-- Claui Community Supabase schema
-- Shared polls, viewer submissions, and private admin controls.

create extension if not exists pgcrypto;

-- ---------- helpers ----------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- admin access ----------
create table if not exists public.admin_users (
  user_id uuid primary key references auth.users(id) on delete cascade,
  created_at timestamptz not null default now()
);

alter table public.admin_users enable row level security;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.admin_users a where a.user_id = auth.uid()
  );
$$;

revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

-- ---------- poll rounds ----------
create table if not exists public.poll_rounds (
  id uuid primary key default gen_random_uuid(),
  title text not null default 'This week''s picks',
  status text not null default 'active' check (status in ('draft','active','closed','archived')),
  starts_at timestamptz not null default now(),
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists one_active_poll_round
  on public.poll_rounds ((status)) where status = 'active';

create trigger poll_rounds_set_updated_at
before update on public.poll_rounds
for each row execute function public.set_updated_at();

alter table public.poll_rounds enable row level security;

create policy "public can read active poll rounds"
on public.poll_rounds for select
using (status = 'active' or public.is_admin());

create policy "admins manage poll rounds"
on public.poll_rounds for all
using (public.is_admin())
with check (public.is_admin());

-- ---------- poll options ----------
create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.poll_rounds(id) on delete cascade,
  title text not null,
  status text not null default 'active' check (status in ('active','played','hidden','archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists poll_options_round_sort_idx
  on public.poll_options(round_id, sort_order, created_at);

create trigger poll_options_set_updated_at
before update on public.poll_options
for each row execute function public.set_updated_at();

alter table public.poll_options enable row level security;

create policy "public can read active poll options"
on public.poll_options for select
using (
  status = 'active'
  and exists (
    select 1 from public.poll_rounds r
    where r.id = round_id and r.status = 'active'
  )
  or public.is_admin()
);

create policy "admins manage poll options"
on public.poll_options for all
using (public.is_admin())
with check (public.is_admin());

-- ---------- votes ----------
create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  round_id uuid not null references public.poll_rounds(id) on delete cascade,
  option_id uuid not null references public.poll_options(id) on delete cascade,
  voter_token text not null check (char_length(voter_token) between 8 and 128),
  created_at timestamptz not null default now(),
  unique (round_id, voter_token)
);

create index if not exists poll_votes_option_idx on public.poll_votes(option_id);

alter table public.poll_votes enable row level security;

-- Base vote rows are intentionally not publicly selectable.
create policy "admins can read votes"
on public.poll_votes for select
using (public.is_admin());

create policy "admins can delete votes"
on public.poll_votes for delete
using (public.is_admin());

create or replace function public.cast_vote(
  p_round_id uuid,
  p_option_id uuid,
  p_voter_token text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if char_length(coalesce(p_voter_token, '')) < 8 or char_length(p_voter_token) > 128 then
    raise exception 'Invalid voter token';
  end if;

  if not exists (
    select 1
    from public.poll_rounds r
    join public.poll_options o on o.round_id = r.id
    where r.id = p_round_id
      and r.status = 'active'
      and o.id = p_option_id
      and o.status = 'active'
  ) then
    raise exception 'Poll option is not active';
  end if;

  delete from public.poll_votes
  where round_id = p_round_id and voter_token = p_voter_token;

  insert into public.poll_votes(round_id, option_id, voter_token)
  values (p_round_id, p_option_id, p_voter_token);
end;
$$;

revoke all on function public.cast_vote(uuid, uuid, text) from public;
grant execute on function public.cast_vote(uuid, uuid, text) to anon, authenticated;

create or replace function public.get_poll_results(p_round_id uuid)
returns table(option_id uuid, votes bigint)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, count(v.id)::bigint
  from public.poll_options o
  left join public.poll_votes v on v.option_id = o.id
  where o.round_id = p_round_id
  group by o.id;
$$;

revoke all on function public.get_poll_results(uuid) from public;
grant execute on function public.get_poll_results(uuid) to anon, authenticated;

-- ---------- community submissions ----------
create table if not exists public.submissions (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('game','content','story')),
  title text not null check (char_length(title) between 1 and 160),
  message text,
  display_name text,
  tiktok_username text,
  status text not null default 'new' check (status in ('new','reviewed','approved','used','archived','rejected')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists submissions_status_created_idx
  on public.submissions(status, created_at desc);

create trigger submissions_set_updated_at
before update on public.submissions
for each row execute function public.set_updated_at();

alter table public.submissions enable row level security;

create policy "anyone can submit"
on public.submissions for insert
with check (
  type in ('game','content','story')
  and char_length(title) between 1 and 160
);

create policy "admins can read submissions"
on public.submissions for select
using (public.is_admin());

create policy "admins can update submissions"
on public.submissions for update
using (public.is_admin())
with check (public.is_admin());

create policy "admins can delete submissions"
on public.submissions for delete
using (public.is_admin());

-- ---------- starter poll ----------
insert into public.poll_rounds (id, title, status)
select gen_random_uuid(), 'This week''s picks', 'active'
where not exists (select 1 from public.poll_rounds where status = 'active');

with active_round as (
  select id from public.poll_rounds where status = 'active' limit 1
), starter(title, sort_order) as (
  values
    ('Evil Nun', 1),
    ('Kalayaan Road', 2),
    ('Unfold Flower', 3),
    ('Lugaw Vendor', 4),
    ('Pares Vendor', 5),
    ('Roblox Games', 6),
    ('ClauiPaladesisyon Readings', 7),
    ('Claui Unfiltered', 8)
)
insert into public.poll_options (round_id, title, sort_order)
select a.id, s.title, s.sort_order
from active_round a
cross join starter s
where not exists (
  select 1 from public.poll_options o
  where o.round_id = a.id and lower(o.title) = lower(s.title)
);
