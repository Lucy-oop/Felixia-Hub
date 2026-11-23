-- Felixia Hub — Phase 5: client's own note on Content Calendar lines
-- Run AFTER phase4.sql, in Supabase → SQL Editor → New query → paste → Run. Safe to run again.

alter table content_cards add column if not exists client_note text not null default '';
