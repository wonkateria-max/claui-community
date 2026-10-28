-- Expand stories to 50,000 characters in the live community inbox.
-- Keep game/content messages at 5,000 and retain all existing access rules.
alter table public.community_submissions
  drop constraint community_submissions_message_check,
  add constraint community_submissions_message_check
    check (message is null or char_length(message) <=
      case when type = 'story' then 50000 else 5000 end);

alter policy "anyone can submit" on public.community_submissions
  with check (
    type in ('game', 'content', 'story')
    and char_length(title) between 1 and 160
    and (message is null or char_length(message) <=
      case when type = 'story' then 50000 else 5000 end)
    and (display_name is null or char_length(display_name) <= 80)
    and (tiktok_username is null or char_length(tiktok_username) <= 80)
  );
