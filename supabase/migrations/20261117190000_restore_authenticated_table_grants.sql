-- Restore PostgREST table privileges for signed-in users.
-- Existing RLS policies continue to restrict each user to their own rows.
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
  public.profiles,
  public.connected_accounts,
  public.oauth_states,
  public.content_assets,
  public.analyses,
  public.generated_assets,
  public.conversations,
  public.messages,
  public.publishing_plans,
  public.performance_snapshots,
  public.community_posts
TO authenticated;

-- community_posts has an explicit public-read RLS policy.
GRANT SELECT ON TABLE public.community_posts TO anon;
