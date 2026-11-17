create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

alter table private.ai_jobs
  add column if not exists max_attempts integer not null default 3,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists updated_at timestamptz not null default now(),
  add column if not exists last_error_code text;

alter table private.ai_jobs
  drop constraint if exists ai_jobs_status_check;

alter table private.ai_jobs
  add constraint ai_jobs_status_check
  check (status = any (array['queued','processing','retrying','completed','failed']::text[]));

alter table private.ai_jobs
  add constraint ai_jobs_attempts_bound_check
  check (attempt_count >= 0 and max_attempts between 1 and 8);

create index if not exists ai_jobs_due_queue_idx
  on private.ai_jobs (next_attempt_at, created_at)
  where status in ('queued','retrying');

create index if not exists ai_jobs_stale_processing_idx
  on private.ai_jobs (started_at)
  where status = 'processing';
