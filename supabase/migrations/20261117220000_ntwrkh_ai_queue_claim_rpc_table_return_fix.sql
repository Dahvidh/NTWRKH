drop function if exists public.ntwrkh_claim_next_ai_job(uuid);
create function public.ntwrkh_claim_next_ai_job(p_user_id uuid)
returns table(
  id uuid,user_id uuid,request_id uuid,action text,payload jsonb,status text,
  attempt_count integer,result jsonb,error_message text,created_at timestamptz,
  started_at timestamptz,completed_at timestamptz,max_attempts integer,
  next_attempt_at timestamptz,updated_at timestamptz,last_error_code text
)
language plpgsql security definer set search_path=pg_catalog,public,private
as $$
begin
  return query
  select j.id,j.user_id,j.request_id,j.action,j.payload,j.status,j.attempt_count,
         j.result,j.error_message,j.created_at,j.started_at,j.completed_at,
         j.max_attempts,j.next_attempt_at,j.updated_at,j.last_error_code
  from private.claim_next_ai_job(p_user_id,120) j;
end;
$$;
revoke all on function public.ntwrkh_claim_next_ai_job(uuid) from public,anon,authenticated;
grant execute on function public.ntwrkh_claim_next_ai_job(uuid) to service_role;
