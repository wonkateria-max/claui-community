-- The public website and current Admin use community_submissions.
-- Retain the existing legacy submissions trigger, and connect the live inbox too.
create trigger telegram_community_submission_insert
after insert on public.community_submissions
for each row execute function claui_private.queue_telegram_entry();
