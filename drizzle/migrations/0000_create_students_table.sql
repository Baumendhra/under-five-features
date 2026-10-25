create table public.students (
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
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete their own students"
  on public.students for delete to authenticated
  using (auth.uid() = user_id);

create index students_user_idx on public.students (user_id);
create unique index students_user_apaar_idx on public.students (user_id, apaar_id)
  where apaar_id is not null and apaar_id <> '';