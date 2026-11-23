-- Felixia Hub — Phase 2 (client features)
-- Run once in Supabase → SQL Editor → New query → paste → Run.
-- Safe to run after schema.sql, and safe to run again.

-- Make sure the "page_admin" role exists (older databases may not have it)
alter type user_role add value if not exists 'page_admin';

-- ---------- Job orders: client pastes raw text ----------
alter table job_orders add column if not exists raw_text text not null default '';
alter table job_orders add column if not exists needs_tidy boolean not null default false;

-- ---------- Content cards: one post = Facebook + TikTok, single client review ----------
do $$ begin
  create type review_status as enum ('none', 'review', 'changes', 'approved');
exception when duplicate_object then null; end $$;

alter table content_cards add column if not exists tiktok_caption text not null default '';
alter table content_cards add column if not exists tiktok_media_url text not null default '';
alter table content_cards add column if not exists review review_status not null default 'none';
alter table content_cards add column if not exists review_note text;
alter table content_cards add column if not exists review_at timestamptz;

-- ---------- Ideas inbox ----------
create table if not exists ideas (
  id uuid primary key default gen_random_uuid(),
  text text not null default '',
  links text[] not null default '{}',
  images text[] not null default '{}',   -- Storage paths in bucket "uploads"
  status text not null default 'new' check (status in ('new', 'seen', 'used')),
  card_id uuid references content_cards on delete set null,
  author uuid references profiles default auth.uid(),
  created_at timestamptz not null default now()
);
alter table ideas enable row level security;
drop policy if exists "read ideas" on ideas;
create policy "read ideas" on ideas for select to authenticated using (my_role()::text in ('manager', 'client'));
drop policy if exists "add ideas" on ideas;
create policy "add ideas" on ideas for insert to authenticated with check (my_role()::text in ('manager', 'client'));
drop policy if exists "manager updates ideas" on ideas;
create policy "manager updates ideas" on ideas for update to authenticated using (my_role()::text = 'manager') with check (my_role()::text = 'manager');
drop policy if exists "delete own or manager ideas" on ideas;
create policy "delete own or manager ideas" on ideas for delete to authenticated using (my_role()::text = 'manager' or author = auth.uid());

-- ---------- Inquiries & applications ----------
create table if not exists inquiries (
  id uuid primary key default gen_random_uuid(),
  date date not null default current_date,
  platform platform not null default 'facebook',
  kind text not null default 'inquiry' check (kind in ('inquiry', 'application')),
  name text not null default '',
  contact text not null default '',
  job_id uuid references job_orders on delete set null,
  card_id uuid references content_cards on delete set null,
  note text not null default '',
  author uuid references profiles default auth.uid(),
  created_at timestamptz not null default now()
);
alter table inquiries enable row level security;
drop policy if exists "read inquiries" on inquiries;
create policy "read inquiries" on inquiries for select to authenticated using (true);
drop policy if exists "write inquiries" on inquiries;
create policy "write inquiries" on inquiries for all to authenticated
  using (my_role()::text in ('manager', 'page_admin')) with check (my_role()::text in ('manager', 'page_admin'));

-- ---------- Weekly performance numbers (typed in by manager) ----------
create table if not exists metrics_weekly (
  week_start date not null,           -- Monday
  platform platform not null,
  reach int not null default 0,
  engagement int not null default 0,
  new_followers int not null default 0,
  link_clicks int not null default 0,
  updated_at timestamptz not null default now(),
  primary key (week_start, platform)
);
alter table metrics_weekly enable row level security;
drop policy if exists "read metrics" on metrics_weekly;
create policy "read metrics" on metrics_weekly for select to authenticated using (my_role()::text in ('manager', 'client'));
drop policy if exists "manager writes metrics" on metrics_weekly;
create policy "manager writes metrics" on metrics_weekly for all to authenticated
  using (my_role()::text = 'manager') with check (my_role()::text = 'manager');

-- ---------- Storage: manager can delete uploaded idea pictures ----------
drop policy if exists "manager deletes uploads" on storage.objects;
create policy "manager deletes uploads" on storage.objects for delete to authenticated
  using (bucket_id = 'uploads' and my_role()::text = 'manager');
