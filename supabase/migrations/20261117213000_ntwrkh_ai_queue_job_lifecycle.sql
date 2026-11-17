create or replace function private.enqueue_ai_job(
  p_user_id uuid,
  p_request_id uuid,
  p_action text,
  p_payload jsonb
) returns table(job_id uuid, job_status text, duplicate boolean)
language plpgsql
security definer
set search_path = pg_catalog, public, private, pgmq
as $$
declare
  v_job_id uuid;
  v_status text;
  v_inserted boolean := false;
begin
  if p_action not in ('analyze','assistant','distribution','tiktok-plan') then
    raise exception 'Unsupported queued AI action';
  end if;
  if p_payload is null or pg_column_size(p_payload) > 6000000 then
    raise exception 'Invalid or oversized AI payload';
  end if;

  insert into private.ai_jobs(user_id, request_id, action, payload, status)
  values (p_user_id, p_request_id, p_action, coalesce(p_payload,'{}'::jsonb), 'queued')
  on conflict (user_id, request_id) do nothing
  returning id, status into v_job_id, v_status;

  if v_job_id is not null then
    v_inserted := true;
    perform pgmq.send('ntwrkh_ai', jsonb_build_object('job_id', v_job_id));
  else
    select j.id, j.status into v_job_id, v_status
    from private.ai_jobs j
    where j.user_id=p_user_id and j.request_id=p_request_id;
  end if;

  return query select v_job_id, v_status, not v_inserted;
end;
$$;

create or replace function private.claim_next_ai_job(p_visibility_timeout integer default 120)
returns setof private.ai_jobs
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_job private.ai_jobs%rowtype;
begin
  select j.* into v_job
  from private.ai_jobs j
  where j.status in ('queued','retrying')
    and (j.next_attempt_at is null or j.next_attempt_at <= now())
    and j.attempt_count < j.max_attempts
  order by j.created_at
  for update skip locked
  limit 1;

  if not found then return; end if;

  update private.ai_jobs
  set status='processing',
      attempt_count=attempt_count+1,
      started_at=now(),
      updated_at=now(),
      next_attempt_at=null
  where id=v_job.id
  returning * into v_job;

  return next v_job;
end;
$$;

create or replace function private.finish_ai_job(
  p_job_id uuid,
  p_result jsonb
) returns boolean
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
begin
  update private.ai_jobs
  set status='completed', result=p_result, error_message=null,
      completed_at=now(), updated_at=now(), last_error_code=null
  where id=p_job_id and status='processing';
  return found;
end;
$$;

create or replace function private.fail_ai_job(
  p_job_id uuid,
  p_error_message text,
  p_error_code text default null,
  p_retryable boolean default true
) returns text
language plpgsql
security definer
set search_path = pg_catalog, public, private, pgmq
as $$
declare
  v private.ai_jobs%rowtype;
  v_delay integer;
  v_new_status text;
begin
  select * into v from private.ai_jobs where id=p_job_id for update;
  if not found or v.status <> 'processing' then return null; end if;

  if p_retryable and v.attempt_count < v.max_attempts then
    v_delay := least(300, 15 * (2 ^ greatest(0, v.attempt_count - 1))::integer);
    v_new_status := 'retrying';
    update private.ai_jobs
      set status=v_new_status, error_message=left(p_error_message,1000),
          last_error_code=p_error_code, next_attempt_at=now()+make_interval(secs=>v_delay),
          updated_at=now()
      where id=p_job_id;
    perform pgmq.send('ntwrkh_ai', jsonb_build_object('job_id',p_job_id), v_delay);
  else
    v_new_status := 'failed';
    update private.ai_jobs
      set status=v_new_status, error_message=left(p_error_message,1000),
          last_error_code=p_error_code, completed_at=now(), updated_at=now()
      where id=p_job_id;
  end if;
  return v_new_status;
end;
$$;

revoke all on function private.enqueue_ai_job(uuid,uuid,text,jsonb) from public, anon, authenticated;
revoke all on function private.claim_next_ai_job(integer) from public, anon, authenticated;
revoke all on function private.finish_ai_job(uuid,jsonb) from public, anon, authenticated;
revoke all on function private.fail_ai_job(uuid,text,text,boolean) from public, anon, authenticated;
grant execute on function private.enqueue_ai_job(uuid,uuid,text,jsonb) to service_role;
grant execute on function private.claim_next_ai_job(integer) to service_role;
grant execute on function private.finish_ai_job(uuid,jsonb) to service_role;
grant execute on function private.fail_ai_job(uuid,text,text,boolean) to service_role;
