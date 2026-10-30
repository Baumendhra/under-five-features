-- ============================================================
-- EduTrace: Sprint 5 Additive Migration
-- APAAR Verification Orchestration, Job Tracking & Event Logs
-- Idempotent, safe to review and apply in Supabase SQL editor
-- ============================================================

-- ── 1. Create apaar_verification_jobs Table ───────────────────
create table if not exists public.apaar_verification_jobs (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students(id) on delete cascade,
  institution_id uuid not null references public.institutions(id) on delete cascade,
  provider text not null default 'mock', -- 'mock', 'official_abc', 'sandbox_abc'
  environment text not null default 'mock', -- 'mock', 'sandbox', 'production'
  status text not null check (status in (
    'not_submitted',
    'pending_consent',
    'queued',
    'processing',
    'verified',
    'failed',
    'manual_review',
    'retry_required',
    'service_unavailable'
  )),
  request_id text not null,
  provider_reference text,
  attempt_count integer not null default 1 check (attempt_count >= 1),
  failure_reason text,
  is_simulated boolean not null default true,
  masked_apaar text,
  metadata jsonb default '{}'::jsonb,
  requested_by uuid references auth.users(id),
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  completed_at timestamptz,
  constraint apaar_verification_jobs_req_id_unique unique (request_id)
);

-- ── 2. Create apaar_verification_events Table ─────────────────
create table if not exists public.apaar_verification_events (
  id uuid primary key default gen_random_uuid(),
  verification_job_id uuid not null references public.apaar_verification_jobs(id) on delete cascade,
  event_type text not null, -- 'job_created', 'provider_submitted', 'retry_scheduled', 'verification_succeeded', 'verification_failed', 'status_changed'
  previous_status text,
  new_status text not null,
  message text,
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc'::text, now())
);

-- ── 3. Performance & Audit Indexes ────────────────────────────
create index if not exists idx_apaar_jobs_student
  on public.apaar_verification_jobs (student_id);

create index if not exists idx_apaar_jobs_institution
  on public.apaar_verification_jobs (institution_id);

create index if not exists idx_apaar_jobs_status
  on public.apaar_verification_jobs (status);

create index if not exists idx_apaar_jobs_request_id
  on public.apaar_verification_jobs (request_id);

create index if not exists idx_apaar_events_job_id
  on public.apaar_verification_events (verification_job_id);

-- ── 4. Row Level Security Policies ─────────────────────────────
alter table public.apaar_verification_jobs enable row level security;
alter table public.apaar_verification_events enable row level security;

-- Policy 1: AICTE Admin has global access to all verification jobs
drop policy if exists "aicte_admin_all_apaar_jobs" on public.apaar_verification_jobs;
create policy "aicte_admin_all_apaar_jobs"
  on public.apaar_verification_jobs
  for all
  to authenticated
  using (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = auth.uid()
        and user_profiles.role = 'aicte_admin'
    )
  )
  with check (
    exists (
      select 1 from public.user_profiles
      where user_profiles.id = auth.uid()
        and user_profiles.role = 'aicte_admin'
    )
  );

-- Policy 2: Institution Staff and Admins can view verification jobs in their institution
drop policy if exists "institution_view_apaar_jobs" on public.apaar_verification_jobs;
create policy "institution_view_apaar_jobs"
  on public.apaar_verification_jobs
  for select
  to authenticated
  using (
    institution_id in (
      select user_profiles.institution_id
      from public.user_profiles
      where user_profiles.id = auth.uid()
    )
  );

-- Policy 3: Institution Staff and Admins can insert/update jobs in their institution
drop policy if exists "institution_manage_apaar_jobs" on public.apaar_verification_jobs;
create policy "institution_manage_apaar_jobs"
  on public.apaar_verification_jobs
  for insert
  to authenticated
  with check (
    institution_id in (
      select user_profiles.institution_id
      from public.user_profiles
      where user_profiles.id = auth.uid()
        and user_profiles.role in ('institution_admin', 'institution_staff')
    )
  );

drop policy if exists "institution_update_apaar_jobs" on public.apaar_verification_jobs;
create policy "institution_update_apaar_jobs"
  on public.apaar_verification_jobs
  for update
  to authenticated
  using (
    institution_id in (
      select user_profiles.institution_id
      from public.user_profiles
      where user_profiles.id = auth.uid()
        and user_profiles.role in ('institution_admin', 'institution_staff')
    )
  )
  with check (
    institution_id in (
      select user_profiles.institution_id
      from public.user_profiles
      where user_profiles.id = auth.uid()
        and user_profiles.role in ('institution_admin', 'institution_staff')
    )
  );

-- Policy 4: Verification Events read policy linked to parent job
drop policy if exists "institution_view_apaar_events" on public.apaar_verification_events;
create policy "institution_view_apaar_events"
  on public.apaar_verification_events
  for select
  to authenticated
  using (
    exists (
      select 1 from public.apaar_verification_jobs
      where apaar_verification_jobs.id = apaar_verification_events.verification_job_id
        and (
          apaar_verification_jobs.institution_id in (
            select user_profiles.institution_id
            from public.user_profiles
            where user_profiles.id = auth.uid()
          )
          or exists (
            select 1 from public.user_profiles
            where user_profiles.id = auth.uid()
              and user_profiles.role = 'aicte_admin'
          )
        )
    )
  );

-- Policy 5: Verification Events insert policy
drop policy if exists "staff_insert_apaar_events" on public.apaar_verification_events;
create policy "staff_insert_apaar_events"
  on public.apaar_verification_events
  for insert
  to authenticated
  with check (
    exists (
      select 1 from public.apaar_verification_jobs
      where apaar_verification_jobs.id = apaar_verification_events.verification_job_id
        and (
          apaar_verification_jobs.institution_id in (
            select user_profiles.institution_id
            from public.user_profiles
            where user_profiles.id = auth.uid()
              and user_profiles.role in ('institution_admin', 'institution_staff')
          )
          or exists (
            select 1 from public.user_profiles
            where user_profiles.id = auth.uid()
              and user_profiles.role = 'aicte_admin'
          )
        )
    )
  );

-- ── 5. Updated Timestamp Trigger ──────────────────────────────
create or replace function public.handle_apaar_jobs_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_set_apaar_jobs_updated_at on public.apaar_verification_jobs;
create trigger trigger_set_apaar_jobs_updated_at
  before update on public.apaar_verification_jobs
  for each row execute function public.handle_apaar_jobs_updated_at();

