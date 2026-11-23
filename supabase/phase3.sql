-- Felixia Hub — Phase 3
-- Run AFTER phase2.sql, once, in Supabase → SQL Editor → New query → paste → Run.

-- ---------- Content cards: chosen platforms + notes ----------
alter table content_cards add column if not exists platforms text[] not null default '{facebook,tiktok}';
alter table content_cards add column if not exists notes text not null default '';

-- ---------- Applicant tracking ----------
alter table inquiries add column if not exists stage text not null default 'new'
  check (stage in ('new', 'contacted', 'interview', 'passed', 'departed', 'rejected'));
alter table inquiries add column if not exists stage_at timestamptz;

-- ---------- Saved replies (page admin) ----------
create table if not exists replies (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  answer_my text not null default '',
  answer_en text not null default '',
  answer_ja text not null default '',
  job_id uuid references job_orders on delete set null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table replies enable row level security;
drop policy if exists "read replies" on replies;
create policy "read replies" on replies for select to authenticated using (true);
drop policy if exists "write replies" on replies;
create policy "write replies" on replies for all to authenticated
  using (my_role()::text in ('manager', 'page_admin')) with check (my_role()::text in ('manager', 'page_admin'));

-- ---------- Performance screenshots ----------
create table if not exists metric_shots (
  id uuid primary key default gen_random_uuid(),
  week_start date not null,
  platform platform not null,
  images text[] not null default '{}',
  extracted jsonb,
  created_at timestamptz not null default now()
);
alter table metric_shots enable row level security;
drop policy if exists "read shots" on metric_shots;
create policy "read shots" on metric_shots for select to authenticated using (my_role()::text in ('manager', 'client'));
drop policy if exists "manager writes shots" on metric_shots;
create policy "manager writes shots" on metric_shots for all to authenticated
  using (my_role()::text = 'manager') with check (my_role()::text = 'manager');

-- ---------- Telegram alerts ----------
alter table profiles add column if not exists telegram_chat_id text;
alter table profiles add column if not exists telegram_code text;

-- ---------- Storage: pictures + short videos up to 50 MB ----------
update storage.buckets
  set file_size_limit = 52428800,
      allowed_mime_types = array['image/*', 'video/*']
  where id = 'uploads';
