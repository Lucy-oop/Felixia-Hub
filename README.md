# Felixia Hub

Content, approval and recruitment workspace for Felixia Recruitment.
Full product spec: `../FELIXIA_WEBAPP_SPEC.md`.

## Run
```bash
npm install
npm run dev     # open http://localhost:3000
```

## Status
- **Phase 1** — login (Supabase), My Today, Job Orders, Content Pipeline (6 stages + 2 confirmations),
  Calendar (month / week / list), Ideas & References, Activity Log, Team (roles).
- **Setup:** fill `.env.local`, run `supabase/schema.sql` in the Supabase SQL Editor, add users in
  Supabase → Authentication, set the first one to manager (see below).
- **Next:** Phase 2 (inquiries, applicants, Google Sheets/Drive).

```sql
-- make yourself the manager (run once)
update profiles set role = 'manager', full_name = 'Your Name'
where id = (select id from auth.users where email = 'you@example.com');
```

All data access goes through `src/lib/store.tsx`; permissions are enforced by RLS in `supabase/schema.sql`.
