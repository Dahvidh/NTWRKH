alter table public.ai_usage_ledger
  add column if not exists estimated_cost_usd numeric(18,10),
  add column if not exists cost_estimate_basis text;

comment on column public.ai_usage_ledger.estimated_cost_usd is
  'Estimated provider cost in USD from published standard token rates; not an invoice or provider-billed amount.';
comment on column public.ai_usage_ledger.cost_estimate_basis is
  'Model and published token rates used to calculate estimated_cost_usd.';
