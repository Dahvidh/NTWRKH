create table if not exists private.ai_budget_config (
  singleton boolean primary key default true check (singleton),
  monthly_budget_usd numeric(18,2) not null check (monthly_budget_usd >= 0),
  per_request_reservation_usd numeric(18,4) not null check (per_request_reservation_usd > 0),
  updated_at timestamptz not null default now()
);

insert into private.ai_budget_config(singleton, monthly_budget_usd, per_request_reservation_usd)
values (true, 99.99, 0.10)
on conflict (singleton) do update
set monthly_budget_usd = excluded.monthly_budget_usd,
    per_request_reservation_usd = excluded.per_request_reservation_usd,
    updated_at = now();

revoke all on private.ai_budget_config from public, anon, authenticated;
grant select on private.ai_budget_config to service_role;

drop function if exists public.reserve_ai_request(uuid,uuid,text,integer,integer,numeric,numeric);
drop function if exists public.reserve_ai_request(uuid,uuid,text,integer,integer);

create function public.reserve_ai_request(
  p_user_id uuid,
  p_request_id uuid,
  p_action text,
  p_user_daily_limit integer default 30,
  p_global_daily_limit integer default 1000
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_user_count integer;
  v_global_count integer;
  v_month_reserved numeric(18,10);
  v_budget numeric(18,10);
  v_reservation numeric(18,10);
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
    'budget_usd', v_budget, 'reserved_usd', v_month_reserved + v_reservation
  );
end;
$function$;

revoke all on function public.reserve_ai_request(uuid,uuid,text,integer,integer) from public, anon, authenticated;
grant execute on function public.reserve_ai_request(uuid,uuid,text,integer,integer) to service_role;
