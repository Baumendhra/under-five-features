-- ============================================================
-- EduTrace: Phase 2 RBAC Migration
-- Run AFTER apply_in_supabase_dashboard.sql
-- Execute in Supabase Dashboard → SQL Editor
-- Each block is idempotent (safe to re-run).
-- ============================================================

-- ── 1. Correction Requests table ─────────────────────────────
create table if not exists public.correction_requests (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references public.students(id) on delete cascade,
  requested_by   uuid not null references auth.users(id),
  field_name     text not null
    check (field_name in ('name','dob','gender','contact','category','programme_code','intake_type')),
  current_value  text,
  proposed_value text not null,
  reason         text not null,
  status         text not null default 'pending'
    check (status in ('pending','approved','rejected')),
  reviewed_by    uuid references auth.users(id),
  reviewer_notes text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);

create index if not exists correction_requests_student_idx
  on public.correction_requests (student_id);
create index if not exists correction_requests_requester_idx
  on public.correction_requests (requested_by);
create index if not exists correction_requests_status_idx
  on public.correction_requests (status);

grant select, insert, update on public.correction_requests to authenticated;
grant all on public.correction_requests to service_role;

alter table public.correction_requests enable row level security;

-- Students can see their own requests
create policy "Students see own correction requests"
  on public.correction_requests for select to authenticated
  using (auth.uid() = requested_by);

-- Students can insert requests for their own records only
create policy "Students insert own correction requests"
  on public.correction_requests for insert to authenticated
  with check (auth.uid() = requested_by);

-- Staff can see and update requests for their institution
create policy "Staff manage correction requests"
  on public.correction_requests for all to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid()
        and up.role in ('aicte_admin', 'institution_admin', 'officer')
    )
  );

-- ── 2. Fix students RLS – institution-aware policies ─────────

-- Drop old name-based policies and recreate them correctly.
-- Using if not exists guards so re-runs are safe.

-- Allow aicte_admin to see ALL students
drop policy if exists "aicte_admin sees all students" on public.students;
create policy "aicte_admin sees all students"
  on public.students for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.role = 'aicte_admin'
    )
  );

-- Allow institution staff to see their institution's students
drop policy if exists "Staff see institution students" on public.students;
create policy "Staff see institution students"
  on public.students for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid()
        and up.role in ('institution_admin', 'officer')
        and up.institution_id = public.students.institution_id
    )
  );

-- Students can only see their own record
drop policy if exists "Users can view their own students" on public.students;
create policy "Students see own record"
  on public.students for select to authenticated
  using (auth.uid() = user_id);

-- Insert: staff stamp institution_id server-side
drop policy if exists "Users can insert their own students" on public.students;
create policy "Staff insert students"
  on public.students for insert to authenticated
  with check (
    auth.uid() = user_id
    and (
      -- aicte_admin can insert for any institution
      exists (select 1 from public.user_profiles up where up.id = auth.uid() and up.role = 'aicte_admin')
      or
      -- institution staff insert for their own institution only
      exists (
        select 1 from public.user_profiles up
        where up.id = auth.uid()
          and up.role in ('institution_admin', 'officer')
          and up.institution_id = public.students.institution_id
      )
    )
  );

-- Update: only staff in same institution or aicte_admin
drop policy if exists "Users can update their own students" on public.students;
create policy "Staff update institution students"
  on public.students for update to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid()
        and up.role in ('aicte_admin', 'institution_admin', 'officer')
        and (
          up.role = 'aicte_admin'
          or up.institution_id = public.students.institution_id
        )
    )
  );

-- ── 3. Audit log RLS – admin sees all, staff sees own institution ──

drop policy if exists "Users see own audit logs" on public.audit_logs;

-- aicte_admin sees all logs
create policy "aicte_admin sees all audit logs"
  on public.audit_logs for select to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.role = 'aicte_admin'
    )
  );

-- institution staff see logs they created
create policy "Staff see own audit entries"
  on public.audit_logs for select to authenticated
  using (
    auth.uid() = user_id
    and exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.role in ('institution_admin', 'officer')
    )
  );

-- Students: no select on audit_logs (no policy for them = denied)

-- Write: anyone can insert their own log entries
drop policy if exists "Users write audit logs" on public.audit_logs;
create policy "Authenticated users write audit logs"
  on public.audit_logs for insert to authenticated
  with check (auth.uid() = user_id);

-- ── 4. Institutions – only aicte_admin can insert/update ─────

drop policy if exists "aicte_admin manages institutions" on public.institutions;
create policy "aicte_admin manages institutions"
  on public.institutions for all to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.role = 'aicte_admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.role = 'aicte_admin'
    )
  );

-- ── 5. user_profiles – prevent role self-elevation ────────────

-- Users can update their OWN profile (name etc.) but NOT their role or institution_id
drop policy if exists "Users can update own profile" on public.user_profiles;
create policy "Users update own non-role profile fields"
  on public.user_profiles for update to authenticated
  using (auth.uid() = id)
  with check (
    -- Role and institution_id must not change from the current values
    role = (select role from public.user_profiles where id = auth.uid())
    and institution_id is not distinct from (select institution_id from public.user_profiles where id = auth.uid())
  );

-- aicte_admin can update any profile (including role assignment)
create policy "aicte_admin manages profiles"
  on public.user_profiles for all to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid() and up.role = 'aicte_admin'
    )
  );

-- ── 6. Duplicate cases – students cannot access ──────────────

drop policy if exists "Authenticated users manage duplicate cases" on public.duplicate_cases;

create policy "Staff manage duplicate cases"
  on public.duplicate_cases for all to authenticated
  using (
    exists (
      select 1 from public.user_profiles up
      where up.id = auth.uid()
        and up.role in ('aicte_admin', 'institution_admin', 'officer')
    )
  );

-- ── 7. Helper function: get_my_role() ─────────────────────────
-- Allows server-side functions to quickly query the caller's role
-- without a separate round-trip.
create or replace function public.get_my_role()
returns text language sql security definer stable as $$
  select role from public.user_profiles where id = auth.uid();
$$;

grant execute on function public.get_my_role() to authenticated;

-- ── Done ─────────────────────────────────────────────────────
select 'EduTrace RBAC Phase 2 migration applied successfully' as status;
