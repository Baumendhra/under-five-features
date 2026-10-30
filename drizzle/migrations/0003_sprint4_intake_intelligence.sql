-- ============================================================
-- EduTrace: Sprint 4 Additive Migration
-- Predictive Intake Intelligence & Capacity Forecasting Snapshots
-- Idempotent, safe to review and apply in Supabase SQL editor
-- ============================================================

-- ── 1. Create intake_observations table ───────────────────────
-- Retains historical intake progress snapshots at annual or admission-period level
create table if not exists public.intake_observations (
  id uuid primary key default gen_random_uuid(),
  institution_id uuid not null references public.institutions(id) on delete cascade,
  programme_id uuid references public.programmes(id) on delete set null,
  course_code text not null,
  academic_year integer not null check (academic_year between 2000 and 2100),
  observation_date date not null default current_date,
  observation_period text not null default 'annual', -- 'annual', 'round_1', 'round_2', 'round_3', 'mop_up', 'monthly'
  admission_category text not null default 'general', -- 'general', 'sc', 'st', 'obc', 'ews', 'tfws', 'nri', 'oci', 'management', 'lateral'
  admission_type text not null default 'regular', -- 'regular', 'lateral_entry', 'supernumerary'
  observed_admitted_count integer not null check (observed_admitted_count >= 0),
  data_source text not null default 'student_registry', -- 'student_registry', 'counseling_portal', 'manual_snapshot', 'state_dte'
  notes text,
  created_at timestamptz not null default timezone('utc'::text, now()),
  updated_at timestamptz not null default timezone('utc'::text, now()),
  constraint intake_observations_unique_snapshot unique (
    institution_id,
    course_code,
    academic_year,
    observation_date,
    observation_period,
    admission_category,
    admission_type
  )
);

-- ── 2. Create Performance & Query Indexes ─────────────────────
create index if not exists idx_intake_obs_inst_year
  on public.intake_observations (institution_id, academic_year);

create index if not exists idx_intake_obs_prog_year
  on public.intake_observations (programme_id, academic_year);

create index if not exists idx_intake_obs_course_year
  on public.intake_observations (course_code, academic_year);

-- ── 3. Row Level Security Policies ─────────────────────────────
alter table public.intake_observations enable row level security;

-- Policy 1: AICTE Admin has global access
drop policy if exists "aicte_admin_full_intake_observations" on public.intake_observations;
create policy "aicte_admin_full_intake_observations"
  on public.intake_observations
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

-- Policy 2: Institution Staff and Admins can view their own institution's observations
drop policy if exists "institution_view_intake_observations" on public.intake_observations;
create policy "institution_view_intake_observations"
  on public.intake_observations
  for select
  to authenticated
  using (
    institution_id in (
      select user_profiles.institution_id
      from public.user_profiles
      where user_profiles.id = auth.uid()
    )
  );

-- Policy 3: Institution Admins can insert/update their own institution's observations
drop policy if exists "institution_admin_manage_intake_observations" on public.intake_observations;
create policy "institution_admin_manage_intake_observations"
  on public.intake_observations
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

drop policy if exists "institution_admin_update_intake_observations" on public.intake_observations;
create policy "institution_admin_update_intake_observations"
  on public.intake_observations
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

-- ── 4. Updated Timestamp Trigger ──────────────────────────────
create or replace function public.handle_intake_observations_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc'::text, now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trigger_set_intake_observations_updated_at on public.intake_observations;
create trigger trigger_set_intake_observations_updated_at
  before update on public.intake_observations
  for each row execute function public.handle_intake_observations_updated_at();

