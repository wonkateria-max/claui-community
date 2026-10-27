# Telegram alerts

Admin: https://claui-community.pages.dev/admin#telegram-alerts

Create a dedicated bot with https://t.me/BotFather (`/newbot`). Paste the token only into the signed-in Admin Telegram panel. The server validates the bot, encrypts its token with Supabase Vault, and generates a 30-minute private pairing link. Open the link, press Start, then confirm in Admin. The server matches the exact pairing payload in a private chat and proves delivery before enabling alerts. Do not commit tokens or paste them into chat.

Successful inserts into `poll_votes` and `submissions` create notifications after commit. Submissions support the actual deployed `subject`/`nickname` columns and the older schema aliases. Game, content and story submissions include a bounded preview and Admin URL. Votes include the selected title, never a voter token. Re-voting is a recorded vote and sends another notification; it does not mean another unique voter. Edits/deletes and existing entries do not create alerts.

`pg_net` sends asynchronously. A private durable outbox tracks Telegram responses; a one-minute pg_cron worker retries temporary failures up to eight attempts with backoff and Telegram rate-limit handling. Normal alerts dispatch immediately; temporary outages, rate limits and a busy queue can delay them. Delivery is at-least-once: an ambiguous network timeout may produce a duplicate on retry. Permanent Telegram 400/401/403/404 responses stop retries and appear in Admin failed counts. Pausing prevents new events; an already queued HTTP request may still arrive. The test button explicitly sends a test notification.

Credentials and outbox use a non-exposed private schema with RLS and no public grants. The sole configuration RPC is service-role-only. The Edge Function validates the user against Auth and `is_admin()` for every action; it never returns stored tokens or raw network errors. A bot with an existing webhook is rejected instead of taking it over. Tokens are not stored in browser storage. Two Vault rows are reused for active/pending credentials; the pending copy is cleared on activation.

Deploy `supabase/telegram-notifications.sql` once through migrations, then deploy `supabase/functions/telegram-notifications/index.ts` with handler.ts. The function performs its own admin authentication; gateway verify_jwt is false, matching the existing site's publishable-key setup. The schema requires pg_net, pg_cron and Supabase Vault. Do not re-run the bootstrap SQL after applying it; use subsequent migrations for changes.

Validation: Node handler tests cover private pairing, auth, origin checks, webhook conflicts, delivery-before-activation and credential redaction. A live database transaction exercised encrypted pairing, all four event types and queued HTTP requests, then rolled back all test rows before any network send. Real Telegram delivery requires the owner's bot connection and must be confirmed by the welcome/test alert.
