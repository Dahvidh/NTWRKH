create table if not exists private.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  request_id uuid not null,
  action text not null check (action in ('analyze','assistant','distribution','tiktok-plan')),
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'queued' check (status in ('queued','processing','completed','failed')),
  attempt_count integer not null default 0 check (attempt_count >= 0),
  result jsonb,
  error_message text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  completed_at timestamptz,
  constraint ai_jobs_user_request_unique unique (user_id, request_id)
);

create index if not exists ai_jobs_status_created_idx
  on private.ai_jobs (status, created_at);

create index if not exists ai_jobs_user_created_idx
  on private.ai_jobs (user_id, created_at desc);

alter table private.ai_jobs enable row level security;
revoke all on table private.ai_jobs from public, anon, authenticated;
grant usage on schema private to service_role;
grant all on table private.ai_jobs to service_role;
