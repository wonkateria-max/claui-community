-- Private ingestion and public, sanitized summaries are served by the Edge Function.
alter table public.tiktok_live_status_cache add column if not exists room_id text;
alter table public.tiktok_live_status_cache add column if not exists started_at timestamptz;

create table public.community_bridge_keys (
  id uuid primary key default gen_random_uuid(),
  token_hash text unique not null check (token_hash ~ '^[0-9a-f]{64}$'),
  created_by uuid not null references public.admin_users(user_id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '180 days'),
  disabled_at timestamptz,
  last_seen_at timestamptz,
  source_connected boolean not null default false
);
create table public.community_live_sessions (
  room_id text primary key check (room_id ~ '^[0-9]{10,30}$'),
  started_at timestamptz not null,
  ended_at timestamptz,
  last_event_at timestamptz,
  reported_likes bigint not null default 0 check (reported_likes between 0 and 1000000000000)
);
create index community_bridge_keys_owner_idx on public.community_bridge_keys(created_by);
create unique index community_bridge_one_active_key on public.community_bridge_keys((true)) where disabled_at is null;
create table public.community_live_supporters (
  room_id text not null references public.community_live_sessions(room_id),
  viewer_id text not null check (char_length(viewer_id) between 1 and 128),
  username text not null default '',
  nickname text not null default 'Viewer',
  avatar_url text,
  likes bigint not null default 0 check (likes >= 0),
  gifts bigint not null default 0 check (gifts >= 0),
  coins bigint not null default 0 check (coins >= 0),
  primary key (room_id, viewer_id)
);
create table public.community_live_event_ids (
  room_id text not null references public.community_live_sessions(room_id),
  event_id text not null check (char_length(event_id) between 1 and 300),
  seen_at timestamptz not null default now(),
  primary key (room_id, event_id)
);
create index community_live_event_ids_seen_idx on public.community_live_event_ids(seen_at);
create index community_live_sessions_started_idx on public.community_live_sessions(started_at desc);

create table public.community_videos (
  video_id text primary key check (video_id ~ '^[0-9]{15,25}$'),
  title text not null check (char_length(title) between 1 and 500),
  thumbnail_url text,
  thumbnail_data text check (thumbnail_data is null or char_length(thumbnail_data) <= 600000),
  created_at timestamptz not null default now(),
  metadata_checked_at timestamptz not null default now(),
  hidden boolean not null default false
);

alter table public.community_bridge_keys enable row level security;
alter table public.community_live_sessions enable row level security;
alter table public.community_live_supporters enable row level security;
alter table public.community_live_event_ids enable row level security;
alter table public.community_videos enable row level security;
revoke all on public.community_bridge_keys, public.community_live_sessions,
  public.community_live_supporters, public.community_live_event_ids, public.community_videos
  from public, anon, authenticated;
grant select, insert, update on public.community_bridge_keys, public.community_live_sessions,
  public.community_live_supporters, public.community_videos to service_role;
grant select, insert, delete on public.community_live_event_ids to service_role;
create policy "Backend manages bridge keys" on public.community_bridge_keys for all to service_role using (true) with check (true);
create policy "Backend manages live sessions" on public.community_live_sessions for all to service_role using (true) with check (true);
create policy "Backend manages supporter totals" on public.community_live_supporters for all to service_role using (true) with check (true);
create policy "Backend manages event deduplication" on public.community_live_event_ids for all to service_role using (true) with check (true);
create policy "Backend manages content cards" on public.community_videos for all to service_role using (true) with check (true);

create function public.rotate_community_bridge_key(p_hash text, p_user_id uuid)
returns uuid language plpgsql security invoker set search_path = '' as $$
declare key_id uuid;
begin
  update public.community_bridge_keys set disabled_at = now() where disabled_at is null;
  insert into public.community_bridge_keys(token_hash, created_by) values(p_hash, p_user_id) returning id into key_id;
  return key_id;
end;
$$;

create function public.record_community_live_events(p_room_id text, p_started_at timestamptz, p_events jsonb)
returns integer language plpgsql security invoker set search_path = '' as $$
declare e jsonb; inserted integer; accepted integer := 0; stream_start timestamptz;
begin
  if jsonb_typeof(p_events) <> 'array' or jsonb_array_length(p_events) > 100 then raise exception 'Invalid event batch'; end if;
  if p_started_at is not null then
    if p_started_at > now() + interval '5 minutes' or p_started_at < now() - interval '24 hours' then raise exception 'Invalid stream date'; end if;
    insert into public.community_live_sessions(room_id, started_at) values(p_room_id, p_started_at) on conflict (room_id) do nothing;
    get diagnostics inserted = row_count;
    -- Old IDs are safe to prune because sessions older than a day reject writes.
    if inserted > 0 then delete from public.community_live_event_ids where seen_at < now() - interval '2 days'; end if;
  end if;
  select started_at into stream_start from public.community_live_sessions where room_id=p_room_id for update;
  if stream_start is null or stream_start < now() - interval '24 hours' then raise exception 'Stream is not available for recording'; end if;
  for e in select value from jsonb_array_elements(p_events) loop
    if e->>'kind' not in ('gift','like')
      or (e->>'count')::bigint not between 1 and 1000000
      or (e->>'coins')::bigint not between 0 and 1000000000000
      or (e->>'occurred_at')::timestamptz < stream_start - interval '2 minutes'
      or (e->>'occurred_at')::timestamptz > now() + interval '5 minutes' then continue; end if;
    insert into public.community_live_event_ids(room_id,event_id) values(p_room_id,e->>'event_id') on conflict do nothing;
    get diagnostics inserted = row_count;
    if inserted = 0 then continue; end if;
    insert into public.community_live_supporters(room_id,viewer_id,username,nickname,avatar_url,likes,gifts,coins)
    values(p_room_id,e->>'viewer_id',left(coalesce(e->>'username',''),80),left(coalesce(nullif(e->>'nickname',''),'Viewer'),100),e->>'avatar_url',
      case when e->>'kind'='like' then (e->>'count')::bigint else 0 end,
      case when e->>'kind'='gift' then (e->>'count')::bigint else 0 end,
      case when e->>'kind'='gift' then (e->>'coins')::bigint else 0 end)
    on conflict (room_id,viewer_id) do update set
      username=excluded.username,nickname=excluded.nickname,avatar_url=coalesce(excluded.avatar_url,public.community_live_supporters.avatar_url),
      likes=public.community_live_supporters.likes+excluded.likes,
      gifts=public.community_live_supporters.gifts+excluded.gifts,
      coins=public.community_live_supporters.coins+excluded.coins;
    update public.community_live_sessions set
      reported_likes=greatest(reported_likes,least(coalesce((e->>'total_likes')::bigint,0),1000000000000)),last_event_at=now()
      where room_id=p_room_id;
    accepted := accepted + 1;
  end loop;
  return accepted;
end;
$$;

create function public.get_community_live_recap()
returns jsonb language sql stable security invoker set search_path = '' as $$
  with latest as (select * from public.community_live_sessions order by started_at desc limit 1),
  people as (select s.* from public.community_live_supporters s join latest l using(room_id)),
  gifters as (select username,nickname,avatar_url,gifts,coins from people where gifts>0 order by coins desc,gifts desc,nickname,viewer_id limit 20),
  likers as (select username,nickname,avatar_url,likes from people where likes>0 order by likes desc,nickname,viewer_id limit 20)
  select jsonb_build_object(
    'stream',(select jsonb_build_object('started_at',started_at,'ended_at',ended_at,'last_event_at',last_event_at) from latest),
    'gifters',coalesce((select jsonb_agg(g) from gifters g),'[]'::jsonb),
    'likers',coalesce((select jsonb_agg(l) from likers l),'[]'::jsonb),
    'total_likes',greatest(coalesce((select reported_likes from latest),0),coalesce((select sum(likes) from people),0)),
    'total_gifts',coalesce((select sum(gifts) from people),0),
    'total_coins',coalesce((select sum(coins) from people),0)
  );
$$;
revoke all on function public.rotate_community_bridge_key(text,uuid),
  public.record_community_live_events(text,timestamptz,jsonb),public.get_community_live_recap() from public,anon,authenticated;
grant execute on function public.rotate_community_bridge_key(text,uuid),
  public.record_community_live_events(text,timestamptz,jsonb),public.get_community_live_recap() to service_role;

-- Previously supplied by Claui. Keep unpublished until a title/cover is chosen;
-- these labels identify the saved links without inventing post captions.
insert into public.community_videos(video_id,title,hidden) values
 ('7698410001156623636','Claui · saved clip 01',true),
 ('7681729305855921429','Claui · saved clip 02',true),
 ('7676937964533943573','Claui · saved clip 03',true)
on conflict(video_id) do nothing;
