create table if not exists private.ntwrkh_admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  granted_at timestamptz not null default now(),
  granted_by text not null default 'initial_owner_setup'
);
revoke all on private.ntwrkh_admin_users from public, anon, authenticated;
grant select on private.ntwrkh_admin_users to service_role;

insert into private.ntwrkh_admin_users (user_id)
values ('283d70b8-c45c-42a3-b6f7-0dfee5375ecf'::uuid)
on conflict (user_id) do nothing;

create or replace function public.ntwrkh_get_admin_finance_summary()
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_user_id uuid := auth.uid();
  v_budget numeric(18,2);
  v_reservation numeric(18,4);
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
  v_actual numeric(18,10);
  v_reserved numeric(18,10);
  v_committed numeric(18,10);
  v_outstanding numeric(18,10);
  v_remaining numeric(18,10);
  v_percent numeric(10,4);
  v_result jsonb;
begin
  if v_user_id is null or not exists (
    select 1 from private.ntwrkh_admin_users a where a.user_id = v_user_id
  ) then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  select monthly_budget_usd, per_request_reservation_usd
    into v_budget, v_reservation
  from private.ai_budget_config
  limit 1;

  select
    coalesce(sum(coalesce(estimated_cost_usd, 0)), 0),
    coalesce(sum(greatest(coalesce(reserved_cost_usd, 0) - coalesce(estimated_cost_usd, 0), 0)), 0),
    coalesce(sum(greatest(coalesce(estimated_cost_usd, 0), coalesce(reserved_cost_usd, 0))), 0)
  into v_actual, v_outstanding, v_committed
  from public.ai_usage_ledger
  where created_at >= v_month_start;

  v_reserved := v_outstanding;
  v_remaining := greatest(coalesce(v_budget, 0) - v_committed, 0);
  v_percent := case when coalesce(v_budget, 0) > 0 then (v_committed / v_budget) * 100 else 100 end;

  select jsonb_build_object(
    'monthStart', v_month_start,
    'budgetUsd', coalesce(v_budget, 0),
    'perRequestReservationUsd', coalesce(v_reservation, 0),
    'estimatedSpendUsd', v_actual,
    'outstandingReservationsUsd', v_reserved,
    'committedUsd', v_committed,
    'remainingUsd', v_remaining,
    'utilizationPercent', v_percent,
    'alertThresholds', jsonb_build_array(50,75,90,100),
    'alertLevel', case
      when v_percent >= 100 then 'limit'
      when v_percent >= 90 then 'critical'
      when v_percent >= 75 then 'warning'
      when v_percent >= 50 then 'notice'
      else 'normal'
    end,
    'providerBreakdown', coalesce((
      select jsonb_agg(x order by x->>'committedUsd' desc)
      from (
        select jsonb_build_object(
          'provider', coalesce(provider, 'unknown'),
          'model', coalesce(model, 'unknown'),
          'requests', count(*),
          'estimatedSpendUsd', sum(coalesce(estimated_cost_usd,0)),
          'reservedUsd', sum(greatest(coalesce(reserved_cost_usd,0)-coalesce(estimated_cost_usd,0),0)),
          'committedUsd', sum(greatest(coalesce(estimated_cost_usd,0),coalesce(reserved_cost_usd,0)))
        ) as x
        from public.ai_usage_ledger
        where created_at >= v_month_start
        group by provider, model
      ) p
    ), '[]'::jsonb),
    'userBreakdown', coalesce((
      select jsonb_agg(x order by (x->>'committedUsd')::numeric desc)
      from (
        select jsonb_build_object(
          'userId', l.user_id,
          'email', coalesce(u.email, 'unknown'),
          'requests', count(*),
          'estimatedSpendUsd', sum(coalesce(l.estimated_cost_usd,0)),
          'reservedUsd', sum(greatest(coalesce(l.reserved_cost_usd,0)-coalesce(l.estimated_cost_usd,0),0)),
          'committedUsd', sum(greatest(coalesce(l.estimated_cost_usd,0),coalesce(l.reserved_cost_usd,0)))
        ) as x
        from public.ai_usage_ledger l
        left join auth.users u on u.id = l.user_id
        where l.created_at >= v_month_start
        group by l.user_id, u.email
      ) users
    ), '[]'::jsonb),
    'dailyTrend', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.day::date, 'committedUsd', coalesce(t.amount,0)) order by d.day)
      from generate_series(v_month_start, date_trunc('day', now() at time zone 'utc') at time zone 'utc', interval '1 day') d(day)
      left join (
        select date_trunc('day', created_at) as day,
               sum(greatest(coalesce(estimated_cost_usd,0),coalesce(reserved_cost_usd,0))) as amount
        from public.ai_usage_ledger
        where created_at >= v_month_start
        group by 1
      ) t on t.day = d.day
    ), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.ntwrkh_get_admin_finance_summary() from public, anon;
grant execute on function public.ntwrkh_get_admin_finance_summary() to authenticated, service_role;
