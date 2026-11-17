# NTWRKH — Supabase migration (not deployed)

This branch replaces the AppDeploy frontend client with Supabase Auth, Database, Storage, and Edge Function calls while retaining the existing React interface and CSS.

## Local setup

1. Install Node.js 20+ and run `npm install`.
2. Copy `.env.example` to `.env.local`.
3. Set `VITE_SUPABASE_URL` and the Supabase **publishable** key for project `sssqevjzvdpwdeahugcm`. Never put a service-role key in frontend environment variables.
4. Run `npm run dev`.

## Supabase configuration still required

- Enable Google in Supabase Authentication and configure the OAuth client secret in the Supabase dashboard. Add your local and eventual production callback URLs to Google Cloud and Supabase Auth redirect allowlists. The Google provider must request YouTube read-only scope for YouTube account access.
- Deploy `supabase/functions/ntwrkh-ai` only after adding `OPENAI_API_KEY` and `YOUTUBE_API_KEY` as Supabase Function secrets. The frontend invokes this function for content analysis, assistant replies, distribution plans, TikTok creator plans, and YouTube search.
- TikTok OAuth account linking is not migrated yet. TikTok is no longer treated as a login provider; Google/Supabase Auth is the primary sign-in.

## Migration notes

- The existing `src/App.tsx` and `src/index.css` design/workflows are retained.
- Profile, community content, conversations, messages, analysis history, generated assets, and private media uploads now use Supabase services.
- Image upload remains limited to the original 5 MB image workflow. Full video/audio processing is not part of this interface migration and requires a separate worker pipeline.
- Existing AppDeploy users, sessions, OAuth tokens, and content have not been imported.
- No Vercel deployment or Supabase Edge Function deployment has been performed.
