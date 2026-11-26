-- Felixia Hub — Phase 13: Facebook Page auto-scheduling (Meta Graph API, native FB scheduling)
-- Run in Supabase → SQL Editor → New query → paste → Run. Safe to run again.
-- (If you never ran phase2.sql … phase12.sql, run those first.)
-- These columns are written only by the server (/api/facebook/schedule, service role key).

alter table content_cards add column if not exists fb_post_id text;              -- Facebook post id of the scheduled post
alter table content_cards add column if not exists fb_schedule_status text;      -- pending | scheduled | failed | null
alter table content_cards add column if not exists fb_schedule_error text;       -- last Facebook / validation error
alter table content_cards add column if not exists fb_scheduled_for timestamptz; -- when Facebook will publish it
alter table content_cards add column if not exists fb_synced_at timestamptz;     -- last schedule / cancel attempt

alter table content_cards drop constraint if exists content_cards_fb_schedule_status_check;
alter table content_cards add constraint content_cards_fb_schedule_status_check
  check (fb_schedule_status is null or fb_schedule_status in ('pending', 'scheduled', 'failed'));
