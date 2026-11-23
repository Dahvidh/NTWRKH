# YouTube-first NTWRKH integration

## First milestone: channel connection + discovery

- Reuse the existing Supabase Google OAuth sign-in and its YouTube read-only scope.
- After sign-in, use the Google provider access token only for a server-side YouTube Data API call.
- Verify the signed-in Google account's managed channels through `channels.list?part=snippet,statistics&mine=true`.
- Return channel ID, title, handle, thumbnail and public statistics to the client. Never persist or log the access token.
- Keep public discovery through YouTube Data API search. Search results are candidates, not evidence of audience reach or creator endorsement.
- Add a visible channel connection state and allow the user to refresh it.
- If Google returns 401/403, show the provider's error and guide the user to re-authorize or check API/scope/consent configuration.

## Next milestones

1. Hashtag-to-YouTube query expansion: use original hashtags, caption, transcript and topic to build multiple precise search queries.
2. Real discovery: videos, channels and public metadata; use videos.list/channels.list for details and rank candidates by topic fit, freshness and available public metrics.
3. Connected-channel analytics: request `yt-analytics.readonly` and query the user's own channel reports.
4. Publishing: request `youtube.upload` only when the user chooses to enable publishing; implement resumable uploads, metadata and privacy selection, explicit final approval, and upload status tracking.
5. Distribution feedback: compare discovery targets and published video performance using data actually returned by YouTube.

## OAuth and platform constraints

- Current Google sign-in already requests `youtube.readonly`; do not add upload or analytics scopes until the user-facing consent and Google OAuth verification are ready.
- The provider access token is ephemeral and held by the active Supabase Auth session. This milestone does not yet provide durable refresh-token storage or unattended background access.
- Public search does not provide a list of individual viewers or guarantee recommendation placement.
- YouTube Data API search quota is limited; cache results and avoid repeated identical searches.
- YouTube Analytics reports require OAuth and the `yt-analytics.readonly` scope. Publishing requires `youtube.upload` or a broader permitted scope.
