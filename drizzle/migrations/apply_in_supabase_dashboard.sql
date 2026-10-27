-- ============================================================
-- EduTrace: COMPLETE database setup script
-- Run this ONCE in the Supabase Dashboard → SQL Editor
-- ============================================================

-- ── 0. Base students table ────────────────────────────────────
create table if not exists public.students (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  student_id text,
  apaar_id text,
  name text not null,
  dob date,
  programme_code text,
  category text,
  intake_type text,
  contact text,
  created_at timestamptz not null default now()
);

grant select, insert, update, delete on public.students to authenticated;
grant all on public.students to service_role;

alter table public.students enable row level security;

create policy "Users can view their own students"
  on public.students for select to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert their own students"
  on public.students for insert to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update their own students"
  on public.students for update to authenticated
  using (
    auth.uid() = user_id
    OR (
      EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('aicte_admin', 'institution_admin', 'officer') AND up.institution_id = public.students.institution_id)
    )
  )
  with check (
    auth.uid() = user_id
    OR (
      EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('aicte_admin', 'institution_admin', 'officer') AND up.institution_id = public.students.institution_id)
    )
  );

create policy "Users can delete their own students"
  on public.students for delete to authenticated
  using (
    auth.uid() = user_id
    OR (
      EXISTS (SELECT 1 FROM public.user_profiles up WHERE up.id = auth.uid() AND up.role IN ('aicte_admin', 'institution_admin', 'officer') AND up.institution_id = public.students.institution_id)
    )
  );

create index if not exists students_user_idx on public.students (user_id);
create unique index if not exists students_user_apaar_idx on public.students (user_id, apaar_id)
  where apaar_id is not null and apaar_id <> '';

-- ── 1. User profiles with roles ──────────────────────────────
create table if not exists public.user_profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        text not null default 'officer'
                check (role in ('aicte_admin','institution_admin','officer','student')),
  institution_id uuid,
  created_at  timestamptz not null default now()
);

grant select, insert, update on public.user_profiles to authenticated;
grant all on public.user_profiles to service_role;

alter table public.user_profiles enable row level security;

create policy "Users can view own profile"
  on public.user_profiles for select to authenticated
  using (auth.uid() = id);

create policy "Users can update own profile"
  on public.user_profiles for update to authenticated
  using (auth.uid() = id);

-- Auto-create profile on sign-up
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into public.user_profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- ── 2. Institutions ───────────────────────────────────────────
create table if not exists public.institutions (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  aicte_id      text unique,
  region        text,
  affiliation   text,
  address       text,
  contact_email text,
  created_at    timestamptz not null default now()
);

grant select on public.institutions to authenticated;
grant all on public.institutions to service_role;

alter table public.institutions enable row level security;

create policy "Authenticated users can view institutions"
  on public.institutions for select to authenticated
  using (true);

-- ── 3. Link user_profiles → institutions ─────────────────────
alter table public.user_profiles
  add column if not exists institution_id_fk uuid references public.institutions(id);

-- ── 4. Academic Years ─────────────────────────────────────────
create table if not exists public.academic_years (
  id                  uuid primary key default gen_random_uuid(),
  label               text not null,
  start_date          date not null,
  end_date            date not null,
  reporting_deadline  date,
  is_active           boolean not null default false
);

grant select on public.academic_years to authenticated;
grant all on public.academic_years to service_role;

alter table public.academic_years enable row level security;

create policy "Authenticated users view academic years"
  on public.academic_years for select to authenticated using (true);

insert into public.academic_years (label, start_date, end_date, reporting_deadline, is_active)
values ('2024-25', '2024-07-01', '2025-06-30', '2025-11-30', true)
on conflict do nothing;

-- ── 5. Programmes ─────────────────────────────────────────────
create table if not exists public.programmes (
  id                   uuid primary key default gen_random_uuid(),
  institution_id       uuid not null references public.institutions(id) on delete cascade,
  course_code          text not null,
  course_name          text,
  year                 int  not null default 2024,
  intake_approved      int  not null default 0,
  intake_nri           int  not null default 0,
  intake_supernumerary int  not null default 0,
  other_details        text,
  created_at           timestamptz not null default now(),
  unique (institution_id, course_code, year)
);

create index if not exists programmes_inst_idx on public.programmes (institution_id);

grant select on public.programmes to authenticated;
grant all on public.programmes to service_role;

alter table public.programmes enable row level security;

create policy "Authenticated users view programmes"
  on public.programmes for select to authenticated using (true);

-- ── 6. Extend students table with EduTrace fields ─────────────
alter table public.students
  add column if not exists gender               text,
  add column if not exists admission_year       int,
  add column if not exists current_status       text default 'active'
    check (current_status in ('active','inactive','transferred','graduated')),
  add column if not exists institution_id       uuid references public.institutions(id),
  add column if not exists apaar_verify_status  text default 'pending'
    check (apaar_verify_status in ('pending','verified','failed','not_found')),
  add column if not exists apaar_verified_at    timestamptz,
  add column if not exists consent_recorded     boolean default false;

create index if not exists students_institution_idx on public.students (institution_id);

-- ── 7. Enrollments ────────────────────────────────────────────
create table if not exists public.enrollments (
  id               uuid primary key default gen_random_uuid(),
  student_id       uuid not null references public.students(id) on delete cascade,
  programme_id     uuid not null references public.programmes(id),
  academic_year_id uuid not null references public.academic_years(id),
  semester         int,
  admission_type   text not null default 'regular'
    check (admission_type in ('regular','nri','oci','management','lateral')),
  status           text not null default 'active'
    check (status in ('active','withdrawn','completed','transferred')),
  enrolled_at      timestamptz not null default now(),
  unique (student_id, programme_id, academic_year_id)
);

create index if not exists enrollments_student_idx   on public.enrollments (student_id);
create index if not exists enrollments_programme_idx on public.enrollments (programme_id);

grant select, insert, update on public.enrollments to authenticated;
grant all on public.enrollments to service_role;

alter table public.enrollments enable row level security;

create policy "Authenticated users view enrollments"
  on public.enrollments for select to authenticated using (true);

create policy "Authenticated users manage enrollments"
  on public.enrollments for insert to authenticated with check (true);

-- ── 8. Duplicate Cases ────────────────────────────────────────
create table if not exists public.duplicate_cases (
  id           uuid primary key default gen_random_uuid(),
  student_ids  uuid[] not null,
  reason       text not null
    check (reason in ('apaar_duplicate','name_dob_match','fuzzy_name_match')),
  status       text not null default 'open'
    check (status in ('open','under_review','resolved','dismissed')),
  reviewed_by  uuid references auth.users(id),
  resolution   text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

grant select, insert, update on public.duplicate_cases to authenticated;
grant all on public.duplicate_cases to service_role;

alter table public.duplicate_cases enable row level security;

create policy "Authenticated users manage duplicate cases"
  on public.duplicate_cases for all to authenticated using (true);

-- ── 9. Audit Log ─────────────────────────────────────────────
create table if not exists public.audit_logs (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references auth.users(id),
  action      text not null,
  entity_type text not null,
  entity_id   text,
  details     jsonb,
  ip_address  text,
  created_at  timestamptz not null default now()
);

create index if not exists audit_logs_user_idx   on public.audit_logs (user_id);
create index if not exists audit_logs_entity_idx on public.audit_logs (entity_type, entity_id);
create index if not exists audit_logs_time_idx   on public.audit_logs (created_at desc);

grant insert on public.audit_logs to authenticated;
grant select on public.audit_logs to authenticated;
grant all on public.audit_logs to service_role;

alter table public.audit_logs enable row level security;

create policy "Users see own audit logs"
  on public.audit_logs for select to authenticated
  using (auth.uid() = user_id);

create policy "Users write audit logs"
  on public.audit_logs for insert to authenticated
  with check (auth.uid() = user_id);

-- ── 10. Notifications ─────────────────────────────────────────
create table if not exists public.notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id),
  type        text not null,
  title       text not null,
  message     text,
  read        boolean not null default false,
  created_at  timestamptz not null default now()
);

create index if not exists notifications_user_idx on public.notifications (user_id, read, created_at desc);

grant select, insert, update on public.notifications to authenticated;
grant all on public.notifications to service_role;

alter table public.notifications enable row level security;

create policy "Users see own notifications"
  on public.notifications for select to authenticated
  using (auth.uid() = user_id);

create policy "Users update own notifications"
  on public.notifications for update to authenticated
  using (auth.uid() = user_id);

-- ── Done ─────────────────────────────────────────────────────
select 'EduTrace schema applied successfully' as status;
