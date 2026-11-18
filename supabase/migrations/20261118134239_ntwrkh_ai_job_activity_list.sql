create or replace function public.ntwrkh_list_ai_jobs(p_user_id uuid)
returns table (
  id uuid,
  action text,
  status text,
  created_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  error_message text,
  last_error_code text
)
language sql
security definer
set search_path = ''
as $$
  select j.id, j.action, j.status, j.created_at, j.started_at, j.completed_at,
         j.error_message, j.last_error_code
  from private.ai_jobs j
  where j.user_id = p_user_id
  order by j.created_at desc
  limit 25;
$$;

revoke all on function public.ntwrkh_list_ai_jobs(uuid) from public, anon, authenticated;
grant execute on function public.ntwrkh_list_ai_jobs(uuid) to service_role;
