-- Felixia Hub — Phase 7: client comments + live updates on the Content Calendar
-- Run in Supabase → SQL Editor → New query → paste → Run. Safe to run again.
-- (If you never ran phase4.sql / phase5.sql / phase6.sql, run those first.)

-- the client's comment on a plan line
alter table content_cards add column if not exists client_note text not null default '';

-- live updates: the manager sees the client's note right away
do $$
begin
  alter publication supabase_realtime add table content_cards;
exception
  when duplicate_object then null;
  when undefined_object then null;
end $$;
