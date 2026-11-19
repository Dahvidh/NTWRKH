-- Subscription catalogue and server-managed user subscription state.
-- Paid tiers are intentionally not purchasable until the pricing and payment provider are approved.

create table if not exists public.subscription_plans (
  plan_key text primary key,
  display_name text not null,
  monthly_price_usd numeric(10,2) not null check (monthly_price_usd >= 0),
  monthly_ai_request_limit integer not null check (monthly_ai_request_limit >= 0),
  connected_account_limit integer not null check (connected_account_limit >= 0),
  team_seat_limit integer not null check (team_seat_limit >= 1),
  features jsonb not null default '[]'::jsonb,
  is_available boolean not null default false,
  is_featured boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.subscription_plans enable row level security;
revoke all on public.subscription_plans from anon, authenticated;
grant select on public.subscription_plans to anon, authenticated;
drop policy if exists "Available subscription plans are viewable" on public.subscription_plans;
create policy "Available subscription plans are viewable"
  on public.subscription_plans for select
  to anon, authenticated
  using (is_available = true);

insert into public.subscription_plans
  (plan_key, display_name, monthly_price_usd, monthly_ai_request_limit, connected_account_limit, team_seat_limit, features, is_available, is_featured, sort_order)
values
  ('free', 'Free', 0, 5, 1, 1,
   '["5 AI requests per month","Basic content analysis","Basic discovery recommendations","1 connected social account"]'::jsonb,
   true, false, 0),
  ('creator', 'Creator', 9, 100, 3, 1,
   '["100 AI requests per month","Visual and audio content understanding","Audience and hashtag recommendations","Up to 3 connected social accounts"]'::jsonb,
   false, false, 1),
  ('pro', 'Pro', 19, 300, 10, 1,
   '["300 AI requests per month","Advanced content and audience intelligence","Cross-platform distribution planning","Up to 10 connected social accounts"]'::jsonb,
   false, true, 2),
  ('business', 'Business', 49, 1000, 25, 5,
   '["1,000 AI requests per month","Multi-brand content intelligence","Team collaboration for up to 5 seats","Up to 25 connected social accounts"]'::jsonb,
   false, false, 3)
on conflict (plan_key) do update set
  display_name = excluded.display_name,
  monthly_price_usd = excluded.monthly_price_usd,
  monthly_ai_request_limit = excluded.monthly_ai_request_limit,
  connected_account_limit = excluded.connected_account_limit,
  team_seat_limit = excluded.team_seat_limit,
  features = excluded.features,
  is_available = excluded.is_available,
  is_featured = excluded.is_featured,
  sort_order = excluded.sort_order,
  updated_at = now();

create table if not exists public.user_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  plan_key text not null references public.subscription_plans(plan_key),
  status text not null default 'active' check (status in ('trialing','active','past_due','canceled','incomplete')),
  billing_provider text check (billing_provider in ('paystack','stripe','manual')),
  provider_customer_id text,
  provider_subscription_id text unique,
  current_period_start timestamptz,
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists user_subscriptions_user_status_idx
  on public.user_subscriptions(user_id, status);

alter table public.user_subscriptions enable row level security;
revoke all on public.user_subscriptions from anon, authenticated;
grant select on public.user_subscriptions to authenticated;
drop policy if exists "Users can view their own subscription" on public.user_subscriptions;
create policy "Users can view their own subscription"
  on public.user_subscriptions for select
  to authenticated
  using ((select auth.uid()) = user_id);

comment on table public.subscription_plans is 'NTWRKH subscription catalogue. Paid plans remain unavailable until pricing and payment processing are approved.';
comment on table public.user_subscriptions is 'Server-managed subscription state. Authenticated users can only read their own subscription.';
