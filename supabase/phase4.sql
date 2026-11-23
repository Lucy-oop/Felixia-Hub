-- Felixia Hub — Phase 4: Content Calendar (plan approval) + Posting checklist
-- Run AFTER phase3.sql, in Supabase → SQL Editor → New query → paste → Run. Safe to run again.

alter table content_cards add column if not exists plan_status text not null default 'draft'
  check (plan_status in ('draft', 'sent', 'approved', 'changes'));
alter table content_cards add column if not exists plan_note text;
alter table content_cards add column if not exists plan_headline text;
alter table content_cards add column if not exists plan_at timestamptz;

-- which places are already posted: { "fb_post": { "at": "...", "url": "..." }, ... }
alter table content_cards add column if not exists posted jsonb not null default '{}'::jsonb;

-- posts that already exist were planned before this feature: treat their plan as approved
update content_cards set plan_status = 'approved' where plan_status = 'draft' and stage <> 'idea';
