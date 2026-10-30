/**
 * correction-requests.functions.ts
 *
 * Student correction-request workflow:
 *   1. Student identifies incorrect information.
 *   2. Student submits a correction request (proposed value + reason).
 *   3. Officer reviews and approves or rejects.
 *   4. Official student record is only updated AFTER authorised approval.
 *   5. Student can track their request status.
 *   6. All changes are audit-logged.
 *
 * Table required: public.correction_requests  (see migration SQL below)
 */
import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff } from "@/lib/rbac";
import type { TablesUpdate } from "@/integrations/supabase/types";

export type CorrectionRequest = {
  id: string;
  student_id: string;
  requested_by: string;
  field_name: string;
  current_value: string | null;
  proposed_value: string;
  reason: string;
  status: "pending" | "approved" | "rejected";
  reviewed_by: string | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
};

// ── Student: submit a correction request ──────────────────────────────────

export const submitCorrectionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      studentId: string;
      fieldName: string;
      currentValue: string | null;
      proposedValue: string;
      reason: string;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    // Any authenticated user can submit for themselves.
    // If role is student, verify the record belongs to them.
    if (context.role === "student") {
      const { data: rec } = await context.supabase
        .from("students")
        .select("user_id")
        .eq("id", data.studentId)
        .maybeSingle();
      if (!rec || rec.user_id !== context.userId) {
        throw new Error("Forbidden: you may only submit requests for your own record.");
      }
    } else {
      // Staff: must ensure the student is in their institution
      if (context.role !== "aicte_admin" && context.institutionId) {
        const { data: rec } = await context.supabase
          .from("students")
          .select("institution_id")
          .eq("id", data.studentId)
          .maybeSingle();
        if (!rec || rec.institution_id !== context.institutionId) {
          throw new Error("Forbidden: student not in your institution.");
        }
      }
    }

    const { data: req, error } = await context.supabase
      .from("correction_requests")
      .insert({
        student_id: data.studentId,
        requested_by: context.userId,
        field_name: data.fieldName,
        current_value: data.currentValue,
        proposed_value: data.proposedValue,
        reason: data.reason,
        status: "pending",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "insert",
      entity_type: "correction_request",
      entity_id: req.id,
      details: { student_id: data.studentId, field_name: data.fieldName, role: context.role },
    });

    return req as CorrectionRequest;
  });

// ── Student: list own correction requests ─────────────────────────────────

export const listMyCorrectionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("correction_requests")
      .select("*")
      .eq("requested_by", context.userId)
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as CorrectionRequest[];
  });

export const myCorrectionRequestsQueryOptions = queryOptions({
  queryKey: ["my-correction-requests"],
  queryFn: () => listMyCorrectionRequests(),
});

// ── Staff: list pending requests for their institution ────────────────────

export const listPendingCorrectionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    requireStaff(context.role);

    // Build join query: correction_requests → students (to scope by institution)
    let query = context.supabase
      .from("correction_requests")
      .select("*, students!inner(name, institution_id, user_id)")
      .order("created_at", { ascending: false });

    if (context.role !== "aicte_admin" && context.institutionId) {
      query = (query as any).eq("students.institution_id", context.institutionId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as (CorrectionRequest & {
      students: { name: string; institution_id: string; user_id: string };
    })[];
  });

export const pendingCorrectionRequestsQueryOptions = queryOptions({
  queryKey: ["pending-correction-requests"],
  queryFn: () => listPendingCorrectionRequests(),
});

// ── Staff: approve or reject a request ───────────────────────────────────

export const reviewCorrectionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      requestId: string;
      decision: "approved" | "rejected";
      reviewerNotes?: string | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    requireStaff(context.role);

    // Fetch the request
    const { data: req } = await context.supabase
      .from("correction_requests")
      .select("*, students!inner(institution_id)")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Correction request not found.");

    // Institution-scoped check
    if (context.role !== "aicte_admin" && context.institutionId) {
      const instId = (req as any).students?.institution_id;
      if (instId !== context.institutionId) {
        throw new Error("Forbidden: request is not in your institution.");
      }
    }

    const { error: updateErr } = await context.supabase
      .from("correction_requests")
      .update({
        status: data.decision,
        reviewed_by: context.userId,
        reviewer_notes: data.reviewerNotes ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);
    if (updateErr) throw new Error(updateErr.message);

    // If approved, apply the field change to the actual student record
    if (data.decision === "approved") {
      const fieldMap: Record<string, keyof TablesUpdate<"students">> = {
        name: "name",
        dob: "dob",
        programme_code: "programme_code",
        category: "category",
        intake_type: "intake_type",
        contact: "contact",
        gender: "gender",
      };
      const dbField = fieldMap[req.field_name];
      if (!dbField)
        throw new Error(`Field '${req.field_name}' cannot be corrected via this workflow.`);

      const updatePayload: Record<string, string> = { [dbField]: req.proposed_value };
      const { error: studentErr } = await context.supabase
        .from("students")
        .update(updatePayload as TablesUpdate<"students">)
        .eq("id", req.student_id);
      if (studentErr) throw new Error(studentErr.message);
    }

    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: data.decision === "approved" ? "update" : "reject",
      entity_type: "correction_request",
      entity_id: data.requestId,
      details: {
        student_id: req.student_id,
        field_name: req.field_name,
        decision: data.decision,
        reviewer_notes: data.reviewerNotes ?? null,
        role: context.role,
      },
    });

    return { ok: true, decision: data.decision };
  });
