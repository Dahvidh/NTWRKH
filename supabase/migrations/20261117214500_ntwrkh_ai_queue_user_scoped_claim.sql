create or replace function private.claim_next_ai_job(p_user_id uuid, p_visibility_timeout integer default 120)
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
  where j.user_id=p_user_id
    and j.status in ('queued','retrying')
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
revoke all on function private.claim_next_ai_job(uuid,integer) from public, anon, authenticated;
grant execute on function private.claim_next_ai_job(uuid,integer) to service_role;
