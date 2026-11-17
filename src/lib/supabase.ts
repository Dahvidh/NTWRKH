import { createClient } from '@supabase/supabase-js';

// Public project configuration. The publishable key is intended for browser use;
// database access must remain protected by Supabase RLS policies.
const PROJECT_URL = 'https://sssqevjzvdpwdeahugcm.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_3dv6_Vr7IjMgoX_YjbBJZg_7zvWb0Nw';

// Allow local/preview overrides, but never fall back to a fake Supabase host or key.
const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || PROJECT_URL;
const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || PUBLISHABLE_KEY;

if (!supabaseUrl.startsWith('https://') || !supabaseUrl.includes('.supabase.co')) {
  throw new Error('NTWRKH is configured with an invalid Supabase URL.');
}

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export function requireUserId(userId?: string | null): string {
  if (!userId) throw new Error('Please sign in to continue.');
  return userId;
}
