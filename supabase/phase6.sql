-- Felixia Hub — Phase 6: only two roles (manager + client)
-- Run AFTER phase5.sql, in Supabase → SQL Editor → New query → paste → Run. Safe to run again.

-- anyone who was a Page Reply Admin becomes a client
update profiles set role = 'client' where role = 'page_admin';

-- new sign-ups start as client (the manager can change it on the Team page)
alter table profiles alter column role set default 'client';
