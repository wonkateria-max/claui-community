-- Read-only verification of the real website inbox and notification route.
-- Does not insert entries, change Telegram configuration, read tokens or send alerts.
select jsonb_build_object(
  'live_inbox_is_table', (select relkind='r' from pg_class where oid='public.community_submissions'::regclass),
  'anonymous_insert_allowed', has_table_privilege('anon','public.community_submissions','INSERT'),
  'live_inbox_rls_enabled', (select relrowsecurity from pg_class where oid='public.community_submissions'::regclass),
  'live_insert_trigger_connected', exists(select 1 from pg_trigger where
    tgrelid='public.community_submissions'::regclass and tgname='telegram_community_submission_insert'
    and tgfoid='claui_private.queue_telegram_entry()'::regprocedure and tgtype=5 and tgenabled='O'),
  'config_rpc_private', not has_function_privilege('anon','public.telegram_service(text,jsonb)','EXECUTE')
    and not has_function_privilege('authenticated','public.telegram_service(text,jsonb)','EXECUTE'),
  'retry_worker_scheduled', exists(select 1 from cron.job where jobname='claui-telegram-delivery' and active)
) as verification;
