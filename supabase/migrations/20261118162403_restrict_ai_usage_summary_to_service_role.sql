drop function if exists public.ntwrkh_get_ai_usage_summary();

create function public.ntwrkh_get_ai_usage_summary(p_user_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public
as $function$
declare
  v_today_start timestamptz := date_trunc('day', now() at time zone 'utc') at time zone 'utc';
  v_month_start timestamptz := date_trunc('month', now() at time zone 'utc') at time zone 'utc';
begin
  if p_user_id is null then
    raise exception 'User ID is required' using errcode = '22004';
  end if;

  return jsonb_build_object(
    'today', (
      select jsonb_build_object(
        'requests', count(*),
        'completed', count(*) filter (where status = 'completed'),
        'estimatedCostUsd', coalesce(sum(estimated_cost_usd), 0),
        'inputTokens', coalesce(sum(input_tokens), 0),
        'outputTokens', coalesce(sum(output_tokens), 0)
      )
      from public.ai_usage_ledger
      where user_id = p_user_id and created_at >= v_today_start
    ),
    'month', (
      select jsonb_build_object(
        'requests', count(*),
        'completed', count(*) filter (where status = 'completed'),
        'estimatedCostUsd', coalesce(sum(estimated_cost_usd), 0),
        'inputTokens', coalesce(sum(input_tokens), 0),
        'outputTokens', coalesce(sum(output_tokens), 0)
      )
      from public.ai_usage_ledger
      where user_id = p_user_id and created_at >= v_month_start
    ),
    'providerBreakdown', coalesce((
      select jsonb_agg(jsonb_build_object(
        'provider', provider,
        'model', model,
        'requests', requests,
        'estimatedCostUsd', estimated_cost_usd,
        'inputTokens', input_tokens,
        'outputTokens', output_tokens
      ) order by estimated_cost_usd desc)
      from (
        select
          coalesce(provider, 'pending') as provider,
          coalesce(model, 'not yet assigned') as model,
          count(*) as requests,
          coalesce(sum(estimated_cost_usd), 0) as estimated_cost_usd,
          coalesce(sum(input_tokens), 0) as input_tokens,
          coalesce(sum(output_tokens), 0) as output_tokens
        from public.ai_usage_ledger
        where user_id = p_user_id and created_at >= v_month_start
        group by provider, model
      ) usage_by_provider
    ), '[]'::jsonb)
  );
end;
$function$;

revoke all on function public.ntwrkh_get_ai_usage_summary(uuid) from public, anon, authenticated;
grant execute on function public.ntwrkh_get_ai_usage_summary(uuid) to service_role;
