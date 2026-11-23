-- Felixia Hub — Phase 8: the client can edit the job details she sent; the admin sees what changed
-- Run in Supabase → SQL Editor → New query → paste → Run. Safe to run again.
-- (If you never ran phase2.sql … phase7.sql, run those first.)

-- the client's text before her last update (the admin's form highlights the changed lines)
alter table job_orders add column if not exists raw_text_before text not null default '';
