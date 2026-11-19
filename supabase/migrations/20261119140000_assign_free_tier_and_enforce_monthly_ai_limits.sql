-- Assign every account the Free tier and enforce plan-level monthly AI request limits.

create unique index if not exists user_subscriptions_one_current_per_user
  on public.user_subscriptions(user_id)
  where status in ('trialing','active','past_due','incomplete');

create or replace function private.assign_default_ntwrkh_subscription()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  insert into public.user_subscriptions(user_id, plan_key, status)
  values (new.id, 'free', 'active')
  on conflict do nothing;
  return new;
end;
$function$;

revoke all on function private.assign_default_ntwrkh_subscription() from public, anon, authenticated;

drop trigger if exists on_auth_user_created_ntwrkh_subscription on auth.users;
create trigger on_auth_user_created_ntwrkh_subscription
  after insert on auth.users
  for each row execute function private.assign_default_ntwrkh_subscription();

insert into public.user_subscriptions(user_id, plan_key, status)
select u.id, 'free', 'active'
from auth.users u
where not exists (
  select 1 from public.user_subscriptions s
  where s.user_id = u.id and s.status in ('trialing','active','past_due','incomplete')
)
on conflict do nothing;

create or replace function public.reserve_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_action text,
  p_user_daily_limit integer default 30,
  p_global_daily_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path to 'pg_catalog', 'public', 'private'
as $function$
declare
  v_user_count integer;
  v_global_count integer;
  v_user_month_count integer;
  v_month_reserved numeric(18,10);
  v_budget numeric(18,10);
  v_reservation numeric(18,10);
  v_plan_key text;
  v_monthly_limit integer;
  v_day_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
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

  select s.plan_key into v_plan_key
  from public.user_subscriptions s
  where s.user_id = p_user_id
    and s.status in ('trialing','active')
    and (s.current_period_end is null or s.current_period_end > now())
  order by s.created_at desc
  limit 1;

  select monthly_ai_request_limit into v_monthly_limit
  from public.subscription_plans
  where plan_key = coalesce(v_plan_key, 'free');

  v_monthly_limit := coalesce(v_monthly_limit, 5);

  select count(*) into v_user_month_count
  from public.ai_usage_ledger
  where user_id = p_user_id
    and created_at >= v_month_start
    and status <> 'provider_unavailable';

  if v_user_month_count >= v_monthly_limit then
    return jsonb_build_object(
      'allowed', false,
      'reason', 'subscription_monthly_limit',
      'plan', coalesce(v_plan_key, 'free'),
      'monthly_limit', v_monthly_limit,
      'monthly_used', v_user_month_count
    );
  end if;

  select monthly_budget_usd, per_request_reservation_usd
    into v_budget, v_reservation
  from private.ai_budget_config
  where singleton = true;

  if v_budget is null or v_reservation is null then
    raise exception 'AI budget configuration is missing';
  end if;

  select count(*) into v_user_count
  from public.ai_usage_ledger
  where user_id = p_user_id and created_at >= v_day_start and status <> 'provider_unavailable';
  if v_user_count >= greatest(1, p_user_daily_limit) then
    return jsonb_build_object('allowed', false, 'reason', 'user_daily_limit');
  end if;

  select count(*) into v_global_count
  from public.ai_usage_ledger where created_at >= v_day_start;
  if v_global_count >= greatest(1, p_global_daily_limit) then
    return jsonb_build_object('allowed', false, 'reason', 'platform_daily_limit');
  end if;

  select coalesce(sum(coalesce(reserved_cost_usd, estimated_cost_usd, 0)), 0)
    into v_month_reserved
  from public.ai_usage_ledger
  where created_at >= v_month_start;

  if v_month_reserved + v_reservation > v_budget then
    return jsonb_build_object(
      'allowed', false, 'reason', 'monthly_budget_limit',
      'budget_usd', v_budget, 'reserved_usd', v_month_reserved,
      'request_reservation_usd', v_reservation
    );
  end if;

  insert into public.ai_usage_ledger(user_id, request_id, action, status, reserved_cost_usd)
  values (p_user_id, p_request_id, p_action, 'started', v_reservation);

  return jsonb_build_object(
    'allowed', true, 'duplicate', false,
    'plan', coalesce(v_plan_key, 'free'),
    'monthly_limit', v_monthly_limit,
    'monthly_used', v_user_month_count + 1,
    'budget_usd', v_budget, 'reserved_usd', v_month_reserved + v_reservation
  );
end;
$function$;

revoke all on function public.reserve_ai_request(uuid, uuid, text, integer, integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid, uuid, text, integer, integer) to service_role;
