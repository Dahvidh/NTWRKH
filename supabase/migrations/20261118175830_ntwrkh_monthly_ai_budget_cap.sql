alter table public.ai_usage_ledger
  add column if not exists reserved_cost_usd numeric(18,10);

comment on column public.ai_usage_ledger.reserved_cost_usd is
  'Conservative USD budget reservation held for an AI request until actual token cost is recorded. Failed/unknown-cost attempts retain their reservation for the month.';

create or replace function public.reserve_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_action text,
  p_user_daily_limit integer default 30,
  p_global_daily_limit integer default 1000,
  p_monthly_budget_usd numeric default 99.90,
  p_request_reservation_usd numeric default 0.10
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_user_count integer;
  v_global_count integer;
  v_month_reserved numeric(18,10);
  v_budget numeric(18,10) := greatest(0, p_monthly_budget_usd);
  v_reservation numeric(18,10) := greatest(0, p_request_reservation_usd);
begin
  if p_action not in ('analyze','assistant','distribution','tiktok-plan') then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_action');
  end if;

  if p_user_id is null or p_request_id is null then
    return jsonb_build_object('allowed', false, 'reason', 'invalid_request');
  end if;

  perform pg_advisory_xact_lock(hashtext('ntwrkh-ai-usage'));

  if exists (
    select 1 from public.ai_usage_ledger
    where user_id = p_user_id and request_id = p_request_id
  ) then
    return jsonb_build_object('allowed', false, 'reason', 'duplicate_request');
  end if;

  select count(*) into v_user_count
  from public.ai_usage_ledger
  where user_id = p_user_id
    and created_at >= date_trunc('day', now())
    and status <> 'provider_unavailable';

  if v_user_count >= greatest(1, p_user_daily_limit) then
    return jsonb_build_object('allowed', false, 'reason', 'user_daily_limit');
  end if;

  select count(*) into v_global_count
  from public.ai_usage_ledger
  where created_at >= date_trunc('day', now());

  if v_global_count >= greatest(1, p_global_daily_limit) then
    return jsonb_build_object('allowed', false, 'reason', 'platform_daily_limit');
  end if;

  select coalesce(sum(coalesce(reserved_cost_usd, estimated_cost_usd, 0)), 0)
    into v_month_reserved
  from public.ai_usage_ledger
  where created_at >= date_trunc('month', now());

  if v_month_reserved + v_reservation > v_budget then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'monthly_budget_limit',
      'budget_usd', v_budget,
      'reserved_usd', v_month_reserved,
      'request_reservation_usd', v_reservation
    );
  end if;

  insert into public.ai_usage_ledger
    (user_id, request_id, action, status, reserved_cost_usd)
  values
    (p_user_id, p_request_id, p_action, 'started', v_reservation);

  return jsonb_build_object(
    'allowed', true,
    'duplicate', false,
    'budget_usd', v_budget,
    'reserved_usd', v_month_reserved + v_reservation
  );
end;
$function$;

revoke all on function public.reserve_ai_request(uuid,uuid,text,integer,integer,numeric,numeric) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid,uuid,text,integer,integer,numeric,numeric) to service_role;
