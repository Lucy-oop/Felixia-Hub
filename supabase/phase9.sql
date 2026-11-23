-- Felixia Hub — Phase 9: AI Brand Settings (brand voice, post templates, compliance rules for Gemini)
-- Run in Supabase → SQL Editor → New query → paste → Run. Safe to run again.
-- (If you never ran phase2.sql … phase8.sql, run those first.)

-- a single row (id = 1) holds the settings every AI generator uses
create table if not exists brand_settings (
  id int primary key default 1 check (id = 1),
  brand_voice text not null default '',
  post_templates jsonb not null default '{"fb_hiring": "", "fb_educational": "", "tiktok_script": ""}'::jsonb,
  compliance_rules text not null default '',
  updated_at timestamptz not null default now()
);

-- in case the table was created earlier without the timestamp
alter table brand_settings add column if not exists updated_at timestamptz not null default now();

insert into brand_settings (id) values (1) on conflict (id) do nothing;

-- only the content manager reads / edits it in the app (API routes use the service key and bypass this)
alter table brand_settings enable row level security;
drop policy if exists "manager reads brand settings" on brand_settings;
create policy "manager reads brand settings" on brand_settings for select to authenticated using (my_role() = 'manager');
drop policy if exists "manager writes brand settings" on brand_settings;
create policy "manager writes brand settings" on brand_settings for all to authenticated
  using (my_role() = 'manager') with check (my_role() = 'manager');
