-- Felixia Hub — reset the database to empty (fresh start). THIS CANNOT BE UNDONE.
-- Run in Supabase → SQL Editor.
--
-- Deleted:  • all posts + Content Calendar / Posting Calendar lines (content_cards), with their comments and versions
--           • all ideas (Ideas Inbox)
--           • all jobs (Hiring page, job_orders) and applicants (inquiries)
--           • the activity log
-- Kept:     users / logins, AI Brand Settings, holiday edits, performance numbers, saved replies.
-- Uploaded pictures/videos stay in Storage → "uploads"; empty that folder in the Supabase dashboard if you want them gone too.

-- STEP 1 — preview: run this first and check the numbers.
select
  (select count(*) from content_cards) as posts_and_calendar_lines,
  (select count(*) from comments) as comments,
  (select count(*) from card_versions) as versions,
  (select count(*) from ideas) as ideas,
  (select count(*) from job_orders) as jobs,
  (select count(*) from inquiries) as applicants,
  (select count(*) from activity_log) as activity_log;

-- STEP 2 — delete: remove the "-- " at the start of each line below, select only those lines, and Run.
-- begin;
-- delete from inquiries;
-- delete from ideas;
-- delete from content_cards;   -- comments + versions go with it
-- delete from job_orders;
-- delete from activity_log;
-- commit;
-- select
--   (select count(*) from content_cards) as posts_left,
--   (select count(*) from ideas) as ideas_left,
--   (select count(*) from job_orders) as jobs_left,
--   (select count(*) from activity_log) as activity_left;
