-- Apply once before deploying the tiktok-live-status Edge Function.
-- This single-row cache is private: visitors only receive the sanitized status
-- from the Edge Function, and cannot change or trigger arbitrary account checks.
create table public.tiktok_live_status_cache (
  username text primary key check (username = 'clawiwawi'),
  status text not null default 'unknown' check (status in ('live', 'offline', 'unknown')),
  checked_at timestamptz,
  expires_at timestamptz not null default '-infinity',
  next_check_at timestamptz not null default '-infinity',
  lease_token uuid
);

alter table public.tiktok_live_status_cache enable row level security;
revoke all on public.tiktok_live_status_cache from public, anon, authenticated;
grant select, update on public.tiktok_live_status_cache to service_role;
create policy "Backend manages TikTok status cache"
  on public.tiktok_live_status_cache for all to service_role
  using (true) with check (true);

insert into public.tiktok_live_status_cache (username) values ('clawiwawi');
