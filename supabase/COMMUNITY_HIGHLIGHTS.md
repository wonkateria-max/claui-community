# Supporters, TikFinity bridge and TikTok cards

## Data flow

TikFinity Desktop on the streaming PC broadcasts gift/like events at
`ws://localhost:21213/`. The private `bridge.html` Link source subscribes to that
endpoint, retains a bounded retry queue on that PC and uploads normalized gift
and like counters to `community-updates/bridge`. It can run inside LIVE Studio,
so keeping the public website or an admin browser tab open is unnecessary.

The bridge sends no chat messages, cookies, email addresses or TikFinity login
details. New rooms are created only after the server's TikTok checker verifies
the broadcaster and live room ID. Final gift streak totals are processed once;
deduplication in Postgres prevents reconnect/retry double counting. Sessions
and counters are retained for the recap after the stream ends. Unknown TikTok
status does not create a new session. Brief uncertainty can continue a previously
verified room for two minutes; a confirmed offline response clears it.

Counters reflect the events captured while the bridge and TikFinity are running.
Past unrecorded streams cannot be reconstructed. A disconnected source may miss
events. An unavailable TikTok check may delay the first verified recording.
Captured but unsent events retry for up to a day. Unassigned events wait up to
two minutes for a verified room. The local queue is capped at 4,000 events and
reports an operational warning if storage or connectivity needs attention.

## One-time setup

1. In Claui Admin, open **TikFinity & clips**.
2. Create a private connection link, then **Copy link**.
3. On the PC running TikFinity Desktop, add it in TikTok LIVE Studio as
   **Sources → + → Link**. Keep it enabled in the scenes used for streaming.
   The copied URL makes the source transparent. **Open connection test** opens
   a visible status page for troubleshooting on that same PC.
4. Connect TikFinity to `@clawiwawi`. The admin connection indicator confirms
   recent heartbeats and whether the local WebSocket is connected.

The desktop Local Network/Loopback permission may be required by the browser.
No global security setting needs changing. The cloud development browser cannot
reach the creator's localhost or verify the actual desktop installation.

## Content cards

Cards are curated from TikTok links through the admin form; this is not an
automatic discovery feed. Up to four cards are published, newest card first.
Titles and optional cover photos can be edited by re-saving the same link.
TikTok oEmbed metadata is used when available. Current oEmbed responses may only
return an iframe without captions/covers, so an uploaded cover is supported.
No invented view counts, durations or post dates are displayed. Uploaded covers
are resized in the admin browser, validated as JPG/PNG/WebP and served by the
Edge Function. No videos are reuploaded. Three previously supplied clip links
are saved as hidden drafts, ready to title and illustrate before publishing.

## Access controls

All new tables enable RLS and deny `anon`/`authenticated` direct access.
Only the backend service role can call the new security-invoker SQL functions.
Public GET routes expose sanitized recap fields and published clip cards.
Admin actions verify the session with `/auth/v1/user`, then check `is_admin`.

Bridge credentials are independent random 256-bit tokens. Only SHA-256 hashes
are stored. They authorize ingestion/heartbeat only, never admin access, stories,
votes, key creation or clip edits. URLs put the token in the fragment, and the
bridge sends it only in the HTTPS request body. There are no third-party scripts
on the bridge page. Keys expire after 180 days, are replaced atomically and are
revoked if their admin owner is removed.

## Deployment and validation

Apply `community-highlights.sql` once, then deploy the updated
`tiktok-live-status` function and the new `community-updates` function. Include
`tikfinity-events.js` at the repository root of the community-updates bundle so
the relative import resolves. Both functions use `verify_jwt=false` and enforce
their own appropriate authentication.

Run `node --test tests/*.test.mjs`. Database aggregation/deduplication tests must
run inside a transaction that is rolled back, without publishing fake viewers.
Actual TikFinity Desktop delivery can only be checked on the streaming PC once
the private link is set up; simulated event tests do not prove that local link.
