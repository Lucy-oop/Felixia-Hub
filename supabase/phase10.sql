-- Felixia Hub — Phase 10: AI Content Calendar — ideas can be "planned" (put on the calendar by the AI planner)
-- Run in Supabase → SQL Editor → New query → paste → Run. Safe to run again.
-- (If you never ran phase2.sql … phase9.sql, run those first.)
-- Until this is run, planned ideas are saved as "used" instead.

alter table ideas drop constraint if exists ideas_status_check;
alter table ideas add constraint ideas_status_check check (status in ('new', 'seen', 'planned', 'used'));
