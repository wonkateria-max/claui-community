# Automatic TikTok live status

The public site and admin page both use `live-status.js`. A visible page checks
`tiktok-live-status` every 30 seconds, with no admin switch or TikTok login.
Hidden tabs stop polling and check again when opened. A shared database cache
allows only one upstream TikTok check per interval across all visitors.

The checker only monitors `@clawiwawi`. It checks TikTok's public API response,
then falls back to the structured broadcast data in the public live page.
It requires the correct username and an explicit recognized broadcast status.
A room ID alone does not prove that a stream is live. The endpoints are
unofficial and TikTok may change or block them.

Known results expire after 30 seconds. Failed checks produce `unknown` and use
a 60-second retry backoff. An expired live result is never shown as current.
The page displays a neutral TikTok link if status cannot be confirmed.
Expect changes within about a minute while the page is visible, rather than
instantaneous push notifications. No checks run when nobody has the site open.

## Deployment

1. Apply `live-status.sql` once.
2. Deploy `supabase/functions/tiktok-live-status/index.ts`, including `status.ts`.
   Disable gateway JWT verification: the handler validates the project's
   publishable API key itself. The existing backend environment provides the
   database service key. Never copy that key into frontend source.
3. Publish the HTML, JS and CSS through the existing GitHub Pages deployment.

The cache table enables RLS, revokes all visitor/admin grants and only permits
the backend service role to read/update its single row. No submissions, votes,
credentials or viewer information are returned by the status endpoint.

## Verification

Run `node --test tests/live-status.test.mjs` with Node 22.18+ or Node 24+.
The tests cover stale room IDs, explicit live/offline statuses, malformed or
blocked responses, account mismatch, cache expiry, refresh concurrency, auth
and the fail-safe display contract. Live fixtures simulate an active broadcast;
a real active stream is needed to validate TikTok's live response end to end.
