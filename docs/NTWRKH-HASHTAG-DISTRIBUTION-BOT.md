# NTWRKH — Hashtag-led Distribution Bot

## Client requirement

The client wants a bot, not a conventional content-advice website. A creator publishes content and adds hashtags/mentions, but those tags do not guarantee that interested people will see the post. NTWRKH should connect to the creator's social accounts, interpret the content and its hashtags, discover relevant audience pockets and distribution opportunities, then carry out permitted distribution actions with the creator's approval.

**Product promise:** Users bring content. NTWRKH finds where it belongs, who should see it, and how to get it there.

## Product form

The web app is the control room for connecting accounts, setting permissions, reviewing opportunities and monitoring results. The actual product engine is a background distribution bot that runs scheduled and event-driven jobs. A chat-style interface may be used to control it, but a chat UI alone is not the bot.

## Core workflow

1. **Connect accounts** — OAuth per platform; encrypt and store tokens server-side; record scopes, expiry and revocation.
2. **Ingest content** — import a connected post or accept a public post URL/upload plus caption. Preserve the exact original hashtags and mentions.
3. **Understand intent** — analyse media, caption, language, niche, format, location/region and intended audience.
4. **Resolve hashtag graph** — use platform-approved APIs to inspect hashtagged media and public creator/business metadata where available. Separate verified API results from AI suggestions.
5. **Find audience pockets** — rank relevant posts, creators, communities and conversations by topical fit, freshness, geography and platform policy.
6. **Build distribution routes** — explain each target, recommended action, expected effort and required permissions.
7. **Execute safely** — publish or cross-post only through approved APIs; prepare drafts, share links, or prompt the user for manual actions where automation is unavailable. Never mass-comment, mass-follow, mass-DM or scrape behind login.
8. **Measure and learn** — ingest available impressions, reach, views, engagement and click metrics; compare outcomes and refine future routes.

## What 'push the content' can and cannot mean

NTWRKH cannot force an external platform to insert a post into a hashtag feed, guarantee impressions, or directly deliver it to every user interested in a tag. Platform ranking and distribution remain controlled by each network.

The achievable product is to make the content easier to discover and actively distribute it through permitted mechanisms: publish with optimised metadata, identify relevant public hashtag conversations, surface creator/community opportunities, prepare approved outreach, cross-post where APIs allow, and measure results.

## Platform integration strategy

### Instagram — first discovery adapter
- Use Meta's official Instagram API for professional Creator/Business accounts.
- Evaluate official hashtag search and public media discovery, plus publishing and insights permissions.
- Support only the account types, scopes, review status and rate limits allowed by Meta.
- Do not promise access to personal consumer accounts or unrestricted public-content search.

### TikTok — publishing adapter, discovery subject to approval
- Use TikTok Login Kit and Content Posting API for account connection and user-approved publishing/draft upload.
- Treat broad hashtag research as unavailable unless NTWRKH is separately approved for the required Research API access.
- Respect TikTok's creator consent, posting UX and audit requirements. Unaudited Direct Post clients may be restricted to private visibility.

### YouTube — discovery and publishing adapter
- Continue using YouTube Data API for video/channel discovery.
- Add authorised channel publishing/analytics only after the correct OAuth scopes and Google verification are in place.
- YouTube discovery is not a substitute for Instagram/TikTok hashtag-feed placement.

### Adapter contract
Each platform adapter must declare supported account types, OAuth scopes, discovery methods, publish methods, analytics methods, approval requirements, rate limits, and unavailable actions. The orchestration engine must never call an unsupported action.

## Execution modes
- **Discover:** search and rank opportunities; no external action.
- **Prepare:** generate post variants, captions, hashtags, creator outreach and share links.
- **Approve:** show the exact action and target; obtain explicit consent.
- **Execute:** call only approved platform endpoints; record provider response and post ID.
- **Monitor:** collect metrics and refresh opportunities within platform limits.

No action should be labelled 'sent', 'published', 'reached' or 'distributed' until the provider confirms it.

## Current project baseline
- React + Vite frontend deployed to Vercel.
- Supabase Auth, Postgres, Storage and Edge Functions.
- Existing AI media analysis, hashtag extraction, distribution-plan generation, AI job queue and saved library.
- YouTube Data API search exists.
- TikTok account OAuth and Instagram OAuth are not yet implemented in the current frontend.
- The distribution worker already returns hashtag groups, audiences, communities, creator types, actions and cautions. Its prompts are being aligned with the client's hashtag-led bot intent.
- Existing AI suggestions are not live hashtag discovery and do not constitute automatic distribution.

## Acceptance criteria for the first usable bot release
1. A user can connect an eligible social account and see its verified connection state.
2. NTWRKH can import/select a real post or accept a URL/caption/media upload.
3. Existing hashtags and mentions are extracted exactly and shown separately from AI suggestions.
4. The bot returns platform-grounded discovery results with source links and timestamps, not fabricated handles or trend metrics.
5. Every proposed distribution action shows its platform, target, permission requirement and whether it is automated or user-assisted.
6. User approval is required before publishing or sending anything externally.
7. Provider responses and confirmed outcomes are saved to the user's library.
8. Unsupported actions are clearly labelled unavailable rather than simulated.