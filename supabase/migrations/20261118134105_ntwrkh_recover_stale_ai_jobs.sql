create or replace function private.recover_stale_ai_jobs(p_stale_after_seconds integer default 600)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_recovered integer;
begin
  with stale_jobs as (
    update private.ai_jobs
    set status = case when attempt_count < max_attempts then 'retrying' else 'failed' end,
        error_message = 'The worker stopped responding. NTWRKH recovered this request automatically.',
        last_error_code = 'AI_WORKER_TIMEOUT',
        next_attempt_at = case when attempt_count < max_attempts then now() else null end,
        completed_at = case when attempt_count >= max_attempts then now() else null end,
        updated_at = now()
    where status = 'processing'
      and started_at < now() - make_interval(secs => greatest(600, least(3600, p_stale_after_seconds)))
    returning id
  )
  select count(*)::integer into v_recovered from stale_jobs;
  return v_recovered;
end;
$$;

revoke all on function private.recover_stale_ai_jobs(integer) from public, anon, authenticated;
grant execute on function private.recover_stale_ai_jobs(integer) to service_role;
