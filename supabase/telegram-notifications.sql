-- Telegram: encrypted bot credentials, post-commit delivery and bounded retries.
-- No historical entries are imported. Apply with Supabase migrations.
create extension if not exists pg_net;
create extension if not exists pg_cron;
create schema if not exists claui_private;
revoke all on schema claui_private from public, anon, authenticated;

create table claui_private.telegram_config (
  id boolean primary key default true check (id),
  secret_id uuid,
  bot_username text,
  chat_id text,
  enabled boolean not null default false,
  pending_secret_id uuid,
  pending_username text,
  pairing_code text,
  pairing_expires_at timestamptz,
  last_sent_at timestamptz
);
insert into claui_private.telegram_config(id) values(true);
create table claui_private.telegram_outbox (
  id bigint generated always as identity primary key,
  event_key text not null unique,
  message text not null,
  state text not null default 'pending' check(state in ('pending','sent','failed')),
  attempts integer not null default 0,
  request_id bigint,
  requested_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  last_status integer,
  created_at timestamptz not null default now()
);
create index telegram_outbox_pending on claui_private.telegram_outbox(next_attempt_at) where state='pending';
alter table claui_private.telegram_config enable row level security;
alter table claui_private.telegram_outbox enable row level security;
revoke all on all tables in schema claui_private from public, anon, authenticated;

-- This RPC is available ONLY to the server service role. The Edge Function
-- separately verifies the signed-in user and is_admin() before calling it.
create function public.telegram_service(p_action text, p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare c claui_private.telegram_config; sid uuid;
begin
  select * into c from claui_private.telegram_config where id for update;
  if p_action='status' then
    return jsonb_build_object('enabled',c.enabled,'bot_username',c.bot_username,
      'connected',c.chat_id is not null,'last_sent_at',c.last_sent_at,
      'pending_username',case when c.pairing_expires_at>now() then c.pending_username end,
      'pairing_code',case when c.pairing_expires_at>now() then c.pairing_code end,
      'pending',(select count(*) from claui_private.telegram_outbox where state='pending'),
      'failed',(select count(*) from claui_private.telegram_outbox where state='failed'));
  elsif p_action='prepare' then
    if coalesce(p_data->>'token','') !~ '^[0-9]{5,20}:[A-Za-z0-9_-]{20,100}$' or coalesce(p_data->>'username','') !~ '^[A-Za-z0-9_]{5,32}$'
      or coalesce(p_data->>'code','') !~ '^[a-f0-9]{32}$' then raise exception 'Invalid configuration'; end if;
    if c.pending_secret_id is null then sid:=vault.create_secret(p_data->>'token');
    else sid:=c.pending_secret_id; perform vault.update_secret(sid,p_data->>'token'); end if;
    update claui_private.telegram_config set pending_secret_id=sid,
      pending_username=p_data->>'username',pairing_code=p_data->>'code',pairing_expires_at=now()+interval '30 minutes' where id;
    return '{}'::jsonb;
  elsif p_action='pending' then
    if c.pairing_expires_at is null or c.pairing_expires_at<=now() then return null; end if;
    return jsonb_build_object('token',(select decrypted_secret from vault.decrypted_secrets where id=c.pending_secret_id),
      'code',c.pairing_code);
  elsif p_action='activate' then
    if c.pairing_expires_at is null or c.pairing_expires_at<=now() or c.pairing_code is distinct from p_data->>'code'
      or coalesce(p_data->>'chat_id','') !~ '^[0-9]{1,20}$' then raise exception 'Pairing expired'; end if;
    if c.secret_id is null then sid:=vault.create_secret((select decrypted_secret from vault.decrypted_secrets where id=c.pending_secret_id));
    else sid:=c.secret_id; perform vault.update_secret(sid,(select decrypted_secret from vault.decrypted_secrets where id=c.pending_secret_id)); end if;
    perform vault.update_secret(c.pending_secret_id,'');
    update claui_private.telegram_config set secret_id=sid,bot_username=c.pending_username,
      chat_id=p_data->>'chat_id',enabled=true,pending_username=null,pairing_code=null,pairing_expires_at=null where id;
    return '{}'::jsonb;
  elsif p_action='active' then
    return jsonb_build_object('token',(select decrypted_secret from vault.decrypted_secrets where id=c.secret_id),'chat_id',c.chat_id);
  elsif p_action='disable' then
    update claui_private.telegram_config set enabled=false where id;
    update claui_private.telegram_outbox set state='failed',message='' where state='pending' and request_id is null;
    return '{}'::jsonb;
  elsif p_action='enable' then
    if c.chat_id is null then raise exception 'Connect Telegram first'; end if;
    update claui_private.telegram_config set enabled=true where id;
    return '{}'::jsonb;
  end if;
  raise exception 'Unknown action';
end $$;
revoke all on function public.telegram_service(text,jsonb) from public, anon, authenticated;
grant execute on function public.telegram_service(text,jsonb) to service_role;

create function claui_private.deliver_telegram()
returns void language plpgsql security definer set search_path = '' as $$
declare c claui_private.telegram_config; e claui_private.telegram_outbox; r record; token text; ok boolean; delay_seconds integer;
begin
  if not pg_catalog.pg_try_advisory_xact_lock(741029183) then return; end if;
  select * into c from claui_private.telegram_config where id;
  if not c.enabled or c.secret_id is null or c.chat_id is null then return; end if;
  select decrypted_secret into token from vault.decrypted_secrets where id=c.secret_id;
  for e in select * from claui_private.telegram_outbox where state='pending' and next_attempt_at<=now()
    order by id limit 20 for update skip locked loop
    if e.request_id is not null then
      select * into r from net._http_response where id=e.request_id;
      if not found and e.requested_at>now()-interval '2 minutes' then continue; end if;
      ok:=false;
      begin ok:=r.status_code=200 and (r.content::jsonb->>'ok')='true'; exception when others then ok:=false; end;
      if coalesce(ok,false) then
        update claui_private.telegram_outbox set state='sent',last_status=200,message='' where id=e.id;
        update claui_private.telegram_config set last_sent_at=now() where id;
        continue;
      end if;
      if e.attempts>=8 or r.status_code in (400,401,403,404) then
        update claui_private.telegram_outbox set state='failed',last_status=r.status_code where id=e.id;
        continue;
      end if;
      delay_seconds:=least(900,30*power(2,e.attempts)::integer);
      if r.status_code=429 then
        begin delay_seconds:=greatest(delay_seconds,least(3600,(r.content::jsonb#>>'{parameters,retry_after}')::integer)); exception when others then null; end;
      end if;
      update claui_private.telegram_outbox set request_id=null,last_status=r.status_code,
        next_attempt_at=now()+pg_catalog.make_interval(secs=>delay_seconds) where id=e.id;
      continue;
    end if;
    update claui_private.telegram_outbox set request_id=net.http_post(
      url:='https://api.telegram.org/bot'||token||'/sendMessage',
      body:=jsonb_build_object('chat_id',c.chat_id,'text',e.message,'link_preview_options',jsonb_build_object('is_disabled',true)),
      timeout_milliseconds:=10000),attempts=attempts+1,requested_at=now() where id=e.id;
  end loop;
  update claui_private.telegram_outbox set message='' where message<>'' and
    ((state='sent' and created_at<now()-interval '7 days') or (state='failed' and created_at<now()-interval '30 days'));
end $$;
revoke all on function claui_private.deliver_telegram() from public, anon, authenticated;

create function claui_private.queue_telegram_entry()
returns trigger language plpgsql security definer set search_path = '' as $$
declare entry jsonb:=to_jsonb(new); msg text; pick text; kind text;
begin
  if not exists(select 1 from claui_private.telegram_config where id and enabled) then return new; end if;
  if tg_table_name='poll_votes' then
    select title into pick from public.poll_options where id=new.option_id;
    msg:='🗳️ Vote recorded'||chr(10)||left(coalesce(pick,'Community pick'),160);
  else
    kind:=entry->>'type';
    if kind not in ('game','content','story') then return new; end if;
    msg:=case kind when 'game' then '🎮 New game request' when 'story' then '📖 New story' else '💡 New content suggestion' end
      ||chr(10)||left(coalesce(entry->>'subject',entry->>'title','Untitled'),160)
      ||chr(10)||'From: '||left(coalesce(nullif(entry->>'nickname',''),nullif(entry->>'display_name',''),'Anonymous'),100)
      ||case when coalesce(entry->>'message','')<>'' then chr(10)||chr(10)||left(entry->>'message',2200) else '' end;
  end if;
  msg:=msg||chr(10)||chr(10)||to_char(now() at time zone 'Asia/Manila','Mon DD, HH24:MI')||' PHT'
    ||chr(10)||'https://claui-community.pages.dev/admin';
  insert into claui_private.telegram_outbox(event_key,message) values(tg_table_name||':'||(entry->>'id'),msg) on conflict(event_key) do nothing;
  -- Queue network work inside the transaction; pg_net sends only after commit.
  begin
    perform claui_private.deliver_telegram();
  exception when others then
    raise warning 'Telegram delivery deferred to retry worker';
  end;
  return new;
exception when others then
  -- Notification problems must never lose a visitor's entry. Do not log payloads.
  raise warning 'Telegram notification enqueue failed';
  return new;
end $$;
revoke all on function claui_private.queue_telegram_entry() from public, anon, authenticated;
create trigger telegram_vote_insert after insert on public.poll_votes for each row execute function claui_private.queue_telegram_entry();
create trigger telegram_submission_insert after insert on public.submissions for each row execute function claui_private.queue_telegram_entry();
create trigger telegram_community_submission_insert after insert on public.community_submissions for each row execute function claui_private.queue_telegram_entry();
select cron.schedule('claui-telegram-delivery','* * * * *','select claui_private.deliver_telegram()');
