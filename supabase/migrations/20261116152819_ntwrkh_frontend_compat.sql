-- Preserve the existing Discover workflow's content metadata in Supabase.
alter table public.community_posts
  add column if not exists topic text,
  add column if not exists niche text,
  add column if not exists analysis jsonb not null default '{}'::jsonb;

create index if not exists community_posts_created_at_idx
  on public.community_posts (created_at desc);

create index if not exists community_posts_author_created_at_idx
  on public.community_posts (author_user_id, created_at desc);
