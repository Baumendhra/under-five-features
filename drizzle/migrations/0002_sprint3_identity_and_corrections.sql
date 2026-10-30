-- ============================================================
-- EduTrace: Sprint 3 Additive Migration
-- Advanced Identity Resolution & Correction Workflow Lifecycle
-- Idempotent, safe to run in Supabase SQL editor
-- ============================================================

-- ── 1. Correction Requests Lifecycle Expansion ────────────────
-- Support all 8 granular lifecycle states in the database
alter table public.correction_requests
  drop constraint if exists correction_requests_status_check;

alter table public.correction_requests
  add constraint correction_requests_status_check
  check (status in (
    'open',
    'submitted',
    'under_review',
    'needs_information',
    'approved',
    'rejected',
    'applied',
    'cancelled',
    'pending' -- preserved for backwards-compatibility
  ));

-- Add evidence document references to correction_requests if not existing
alter table public.correction_requests
  add column if not exists evidence_path text,
  add column if not exists evidence_file_name text,
  add column if not exists evidence_file_size integer,
  add column if not exists evidence_file_type text;

-- ── 2. Duplicate Cases Composite & Clustering Extensions ─────
-- Add similarity metrics, explainable match breakdown, and clustering IDs
alter table public.duplicate_cases
  add column if not exists institution_id uuid references public.institutions(id) on delete cascade,
  add column if not exists match_score numeric(5,2),
  add column if not exists confidence text,
  add column if not exists match_details jsonb,
  add column if not exists cluster_id text;

-- Update status check constraint to support controlled reviewer actions
alter table public.duplicate_cases
  drop constraint if exists duplicate_cases_status_check;

alter table public.duplicate_cases
  add constraint duplicate_cases_status_check
  check (status in (
    'open',
    'under_review',
    'resolved',
    'dismissed',
    'confirmed',
    'escalated',
    'needs_information'
  ));

-- Update reason check constraint to support multi-algorithm matches
alter table public.duplicate_cases
  drop constraint if exists duplicate_cases_reason_check;

alter table public.duplicate_cases
  add constraint duplicate_cases_reason_check
  check (reason in (
    'apaar_duplicate',
    'name_dob_match',
    'fuzzy_name_match',
    'exact_apaar',
    'exact_identity',
    'composite_similarity',
    'identifier_collision'
  ));

-- Create indexes for fast lookup and clustering
create index if not exists duplicate_cases_institution_idx
  on public.duplicate_cases (institution_id);

create index if not exists duplicate_cases_cluster_idx
  on public.duplicate_cases (cluster_id);

create index if not exists duplicate_cases_score_idx
  on public.duplicate_cases (match_score desc);

-- ── 3. Private Storage Bucket for Supporting Evidence ─────────
-- Ensure storage bucket 'evidence-attachments' is strictly private
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'evidence-attachments',
  'evidence-attachments',
  false,
  5242880, -- 5 MB limit
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do update set
  public = false,
  file_size_limit = 5242880,
  allowed_mime_types = array['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

-- Storage RLS: Ensure only authenticated users can access evidence
-- 1. Insert: users can only upload files into their institution directory or authenticated subfolder
create policy "Authenticated users upload evidence attachments"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'evidence-attachments');

-- 2. Select: staff can view evidence for their institution, students can view their own
create policy "Staff and owners read evidence attachments"
  on storage.objects for select to authenticated
  using (
    bucket_id = 'evidence-attachments'
    and (
      auth.uid() = owner
      or exists (
        select 1 from public.user_profiles up
        where up.id = auth.uid()
          and up.role in ('aicte_admin', 'institution_admin', 'officer')
      )
    )
  );

-- ── 4. Atomic Correction Application Function ─────────────────
-- Executes student record update, correction request status change,
-- and audit log insert in a single transactional database call.
create or replace function public.apply_correction_atomically(
  p_request_id uuid,
  p_decision text,
  p_reviewer_notes text,
  p_reviewer_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_req public.correction_requests%rowtype;
  v_student public.students%rowtype;
  v_prev_value text;
begin
  -- Fetch and lock request record
  select * into v_req
  from public.correction_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Correction request % not found', p_request_id;
  end if;

  -- Fetch student
  select * into v_student
  from public.students
  where id = v_req.student_id
  for update;

  if not found then
    raise exception 'Student record % not found', v_req.student_id;
  end if;

  -- Apply student update if approved
  if p_decision = 'approved' then
    if v_req.field_name = 'name' then
      v_prev_value := v_student.name;
      update public.students set name = v_req.proposed_value, updated_at = now() where id = v_student.id;
    elsif v_req.field_name = 'dob' then
      v_prev_value := v_student.dob;
      update public.students set dob = v_req.proposed_value, updated_at = now() where id = v_student.id;
    elsif v_req.field_name = 'gender' then
      v_prev_value := v_student.gender;
      update public.students set gender = v_req.proposed_value, updated_at = now() where id = v_student.id;
    elsif v_req.field_name = 'contact' then
      v_prev_value := v_student.contact;
      update public.students set contact = v_req.proposed_value, updated_at = now() where id = v_student.id;
    elsif v_req.field_name = 'category' then
      v_prev_value := v_student.category;
      update public.students set category = v_req.proposed_value, updated_at = now() where id = v_student.id;
    elsif v_req.field_name = 'programme_code' then
      v_prev_value := v_student.programme_code;
      update public.students set programme_code = v_req.proposed_value, updated_at = now() where id = v_student.id;
    elsif v_req.field_name = 'intake_type' then
      v_prev_value := v_student.intake_type;
      update public.students set intake_type = v_req.proposed_value, updated_at = now() where id = v_student.id;
    else
      raise exception 'Field % cannot be updated via atomic correction', v_req.field_name;
    end if;
  end if;

  -- Update request record
  update public.correction_requests
  set status = p_decision,
      reviewed_by = p_reviewer_id,
      reviewer_notes = p_reviewer_notes,
      updated_at = now()
  where id = p_request_id;

  -- Insert immutable audit record
  insert into public.audit_logs (
    user_id,
    action,
    entity_type,
    entity_id,
    details
  ) values (
    p_reviewer_id,
    case when p_decision = 'approved' then 'apply_correction' else p_decision end,
    'correction_request',
    p_request_id::text,
    jsonb_build_object(
      'student_id', v_req.student_id,
      'field_name', v_req.field_name,
      'previous_value', coalesce(v_prev_value, v_req.current_value),
      'new_value', v_req.proposed_value,
      'decision', p_decision,
      'reviewer_notes', p_reviewer_notes
    )
  );

  return jsonb_build_object('success', true, 'request_id', p_request_id, 'status', p_decision);
end;
$$;

