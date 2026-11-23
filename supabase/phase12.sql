-- Felixia Hub — Phase 12: editable holidays in the AI Month Plan (one saved list per month)
-- Run in Supabase → SQL Editor → New query → paste → Run. Safe to run again.
-- (If you never ran phase2.sql … phase11.sql, run those first.)
-- Until this is run, holiday edits only last while the AI Month Plan popup is open.

-- month = 'yyyy-mm'; items = the full edited holiday list for that month (no row = the built-in list)
create table if not exists month_holidays (
  month text primary key check (month ~ '^\d{4}-\d{2}$'),
  items jsonb not null default '[]'::jsonb,
  updated_at timestamptz not null default now()
);

alter table month_holidays enable row level security;
drop policy if exists "manager reads month holidays" on month_holidays;
create policy "manager reads month holidays" on month_holidays for select to authenticated using (my_role() = 'manager');
drop policy if exists "manager writes month holidays" on month_holidays;
create policy "manager writes month holidays" on month_holidays for all to authenticated
  using (my_role() = 'manager') with check (my_role() = 'manager');
