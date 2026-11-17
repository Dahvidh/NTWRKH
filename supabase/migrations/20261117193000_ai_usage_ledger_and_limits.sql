create table if not exists public.ai_usage_ledger (
  id bigint generated always as identity primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  action text not null check (action in ('analyze','assistant','distribution','tiktok-plan')),
  provider text not null default 'openai',
  model text,
  status text not null default 'started' check (status in ('started','completed','failed','provider_unavailable')),
  input_tokens integer,
  output_tokens integer,
  error_code text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  constraint ai_usage_ledger_user_request_unique unique (user_id, request_id)
);
create index if not exists ai_usage_ledger_user_created_idx on public.ai_usage_ledger (user_id, created_at desc);
create index if not exists ai_usage_ledger_created_status_idx on public.ai_usage_ledger (created_at desc, status);
alter table public.ai_usage_ledger enable row level security;
revoke all on public.ai_usage_ledger from anon, authenticated;
grant all on public.ai_usage_ledger to service_role;
create or replace function public.reserve_ai_request(
  p_user_id uuid, p_request_id uuid, p_action text,
  p_user_daily_limit integer default 30, p_global_daily_limit integer default 1000
) returns jsonb
language plpgsql security definer set search_path = pg_catalog, public
as $$
declare v_user_count integer; v_global_count integer;
begin
  if p_action not in ('analyze','assistant','distribution','tiktok-plan') then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_action');
  end if;
  perform pg_advisory_xact_lock(hashtext('ntwrkh-ai-usage'));
  if exists (select 1 from public.ai_usage_ledger where user_id = p_user_id and request_id = p_request_id) then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate_request');
  end if;
  select count(*) into v_user_count from public.ai_usage_ledger
    where user_id = p_user_id and created_at >= date_trunc('day', now()) and status <> 'provider_unavailable';
  if v_user_count >= greatest(1, p_user_daily_limit) then
    return jsonb_build_object('allowed', false, 'reason', 'user_daily_limit');
  end if;
  select count(*) into v_global_count from public.ai_usage_ledger
    where created_at >= date_trunc('day', now());
  if v_global_count >= greatest(1, p_global_daily_limit) then
    return jsonb_build_object('allowed', false, 'reason', 'platform_daily_limit');
  end if;
  insert into public.ai_usage_ledger (user_id, request_id, action, status)
    values (p_user_id, p_request_id, p_action, 'started');
  return jsonb_build_object('allowed', true, 'duplicate', false);
end;
$$;
revoke all on function public.reserve_ai_request(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid, uuid, text, integer, integer) to service_role;
