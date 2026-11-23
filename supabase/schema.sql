-- Felixia Hub — Phase 1 schema
-- Run once in Supabase → SQL Editor → New query → paste → Run.

-- ---------- Roles ----------
create type user_role as enum ('manager', 'client', 'page_admin');
create type job_status as enum ('open', 'hot', 'closed');
create type card_stage as enum ('idea', 'draft', 'design', 'review', 'approved', 'published');
create type approval_status as enum ('none', 'pending', 'approved', 'changes');
create type platform as enum ('facebook', 'tiktok');

create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  role user_role not null default 'page_admin',
  created_at timestamptz not null default now()
);

-- helper: current user's role
create or replace function my_role() returns user_role
language sql stable security definer set search_path = public as
$$ select role from profiles where id = auth.uid() $$;

-- auto-create a profile on sign-up (default: page_admin; manager changes it)
create or replace function handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (id, full_name) values (new.id, coalesce(new.raw_user_meta_data->>'full_name', ''));
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function handle_new_user();

-- ---------- Job orders ----------
create table job_orders (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  company text not null default '',
  location text not null default '',
  salary_min numeric not null default 0,
  salary_max numeric not null default 0,
  currency text not null default 'JPY',
  salary_per text not null default 'month' check (salary_per in ('hour', 'month')),
  requirements text not null default '',
  benefits text not null default '',
  visa_type text not null default '',
  positions int not null default 1,
  deadline date,
  status job_status not null default 'open',
  created_by uuid references profiles default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Content cards ----------
create table content_cards (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  category text not null default 'Recruitment',
  platform platform not null default 'facebook',
  format text not null default 'Feed',
  job_id uuid references job_orders on delete set null,
  stage card_stage not null default 'idea',
  caption text not null default '',
  hashtags text not null default '',
  cta text not null default '',
  graphic_url text not null default '',
  source_link text not null default '',
  planned_date date,
  planned_time time default '19:00',
  published_url text not null default '',
  content_approval approval_status not null default 'none',
  content_approval_note text,
  content_approval_at timestamptz,
  graphic_approval approval_status not null default 'none',
  graphic_approval_note text,
  graphic_approval_at timestamptz,
  created_by uuid references profiles default auth.uid(),
  created_at timestamptz not null default now()
);

create table card_versions (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references content_cards on delete cascade,
  caption text not null,
  graphic_url text not null,
  created_at timestamptz not null default now()
);

create table comments (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references content_cards on delete cascade,
  author uuid not null references profiles default auth.uid(),
  body text not null,
  created_at timestamptz not null default now()
);

-- ---------- References (mood board) ----------
create table references_board (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('like', 'dislike')),
  title text not null,
  url text not null,          -- link or Supabase Storage path
  note text not null default '',
  author uuid not null references profiles default auth.uid(),
  created_at timestamptz not null default now()
);

-- ---------- Activity log ----------
create table activity_log (
  id bigint generated always as identity primary key,
  actor uuid references profiles default auth.uid(),
  text text not null,
  created_at timestamptz not null default now()
);

-- ---------- Row Level Security ----------
alter table profiles enable row level security;
alter table job_orders enable row level security;
alter table content_cards enable row level security;
alter table card_versions enable row level security;
alter table comments enable row level security;
alter table references_board enable row level security;
alter table activity_log enable row level security;

-- profiles: everyone signed in can see names; only manager changes roles
create policy "read profiles" on profiles for select to authenticated using (true);
create policy "manager edits profiles" on profiles for update to authenticated using (my_role() = 'manager');

-- job orders: all read; manager + client write
create policy "read jobs" on job_orders for select to authenticated using (true);
create policy "write jobs" on job_orders for all to authenticated
  using (my_role() in ('manager', 'client')) with check (my_role() in ('manager', 'client'));

-- content cards: reply admin sees only published
create policy "read cards" on content_cards for select to authenticated
  using (my_role() in ('manager', 'client') or stage = 'published');
create policy "manager writes cards" on content_cards for all to authenticated
  using (my_role() = 'manager') with check (my_role() = 'manager');
-- client may submit ideas (idea stage only)
create policy "client adds ideas" on content_cards for insert to authenticated
  with check (my_role() = 'client' and stage = 'idea');
-- client may update approvals and dates (enforced further by the app's RPCs later)
create policy "client approves" on content_cards for update to authenticated
  using (my_role() = 'client') with check (my_role() = 'client');

create policy "read versions" on card_versions for select to authenticated using (my_role() in ('manager', 'client'));
create policy "manager writes versions" on card_versions for insert to authenticated with check (my_role() = 'manager');

create policy "read comments" on comments for select to authenticated using (my_role() in ('manager', 'client'));
create policy "add comments" on comments for insert to authenticated
  with check (my_role() in ('manager', 'client') and author = auth.uid());

create policy "read refs" on references_board for select to authenticated using (true);
create policy "write refs" on references_board for all to authenticated
  using (my_role() in ('manager', 'client')) with check (my_role() in ('manager', 'client'));

create policy "read activity" on activity_log for select to authenticated using (my_role() in ('manager', 'client'));
create policy "add activity" on activity_log for insert to authenticated with check (actor = auth.uid());

-- ---------- Storage bucket for references / graphics ----------
insert into storage.buckets (id, name, public) values ('uploads', 'uploads', false)
  on conflict do nothing;
create policy "signed-in read uploads" on storage.objects for select to authenticated using (bucket_id = 'uploads');
create policy "manager/client upload" on storage.objects for insert to authenticated
  with check (bucket_id = 'uploads' and my_role() in ('manager', 'client'));
