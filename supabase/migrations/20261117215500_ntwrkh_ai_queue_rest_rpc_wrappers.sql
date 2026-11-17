create or replace function public.ntwrkh_enqueue_ai_job(p_user_id uuid,p_request_id uuid,p_action text,p_payload jsonb)
returns table(job_id uuid,job_status text,duplicate boolean)
language sql security definer set search_path=pg_catalog,public,private
as $$ select * from private.enqueue_ai_job(p_user_id,p_request_id,p_action,p_payload); $$;

create or replace function public.ntwrkh_claim_next_ai_job(p_user_id uuid)
returns setof private.ai_jobs
language sql security definer set search_path=pg_catalog,public,private
as $$ select * from private.claim_next_ai_job(p_user_id,120); $$;

create or replace function public.ntwrkh_finish_ai_job(p_job_id uuid,p_result jsonb)
returns boolean
language sql security definer set search_path=pg_catalog,public,private
as $$ select private.finish_ai_job(p_job_id,p_result); $$;

create or replace function public.ntwrkh_fail_ai_job(p_job_id uuid,p_error_message text,p_error_code text default null,p_retryable boolean default true)
returns text
language sql security definer set search_path=pg_catalog,public,private
as $$ select private.fail_ai_job(p_job_id,p_error_message,p_error_code,p_retryable); $$;

create or replace function public.ntwrkh_get_ai_job(p_job_id uuid,p_user_id uuid)
returns table(id uuid,status text,result jsonb,error_message text,attempt_count integer,created_at timestamptz,completed_at timestamptz)
language sql security definer set search_path=pg_catalog,public,private
as $$
  select j.id,j.status,j.result,j.error_message,j.attempt_count,j.created_at,j.completed_at
  from private.ai_jobs j where j.id=p_job_id and j.user_id=p_user_id limit 1;
$$;

revoke all on function public.ntwrkh_enqueue_ai_job(uuid,uuid,text,jsonb) from public,anon,authenticated;
revoke all on function public.ntwrkh_claim_next_ai_job(uuid) from public,anon,authenticated;
revoke all on function public.ntwrkh_finish_ai_job(uuid,jsonb) from public,anon,authenticated;
revoke all on function public.ntwrkh_fail_ai_job(uuid,text,text,boolean) from public,anon,authenticated;
revoke all on function public.ntwrkh_get_ai_job(uuid,uuid) from public,anon,authenticated;
grant execute on function public.ntwrkh_enqueue_ai_job(uuid,uuid,text,jsonb) to service_role;
grant execute on function public.ntwrkh_claim_next_ai_job(uuid) to service_role;
grant execute on function public.ntwrkh_finish_ai_job(uuid,jsonb) to service_role;
grant execute on function public.ntwrkh_fail_ai_job(uuid,text,text,boolean) to service_role;
grant execute on function public.ntwrkh_get_ai_job(uuid,uuid) to service_role;
