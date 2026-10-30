/**
 * correction-requests.functions.ts
 *
 * Student correction-request workflow for EduTrace (SIH26263):
 *   1. Student identifies incorrect information or discrepancies.
 *   2. System suggests explainable formatting/syntax normalizations.
 *   3. Student submits a correction request (proposed value, reason, optional evidence).
 *   4. Officer reviews evidence, requests info if needed, and approves or rejects.
 *   5. Official student record is only updated AFTER authorized approval and conflict verification.
 *   6. Quality score is recalculated post-application and audit logs are recorded.
 */
import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff } from "@/lib/rbac";
import {
  canTransition,
  validateTransition,
  detectCorrectionConflicts,
  recalculateQualityAfterCorrection,
  generateSmartSuggestions,
  validateEvidenceFile,
  type CorrectionStatus,
  type CorrectableFieldName,
  type EvidenceAttachment,
  type SmartSuggestion,
} from "@/lib/correction-engine";
import { evaluateStudentRecord } from "@/lib/data-quality";
import type { TablesUpdate } from "@/integrations/supabase/types";

export type CorrectionRequest = {
  id: string;
  student_id: string;
  requested_by: string;
  field_name: string;
  current_value: string | null;
  proposed_value: string;
  reason: string;
  status: string;
  reviewed_by: string | null;
  reviewer_notes: string | null;
  created_at: string;
  updated_at: string;
};

export type CorrectionRequestWithStudent = CorrectionRequest & {
  students: {
    id?: string;
    name: string;
    institution_id: string;
    user_id?: string | null;
    student_id?: string | null;
    dob?: string | null;
    contact?: string | null;
    category?: string | null;
    programme_code?: string | null;
    intake_type?: string | null;
    gender?: string | null;
  };
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
      issueCode?: string | undefined;
      evidence?:
        | {
            fileName: string;
            fileType: string;
            fileSize: number;
            storagePath?: string | undefined;
          }
        | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
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

    // Validate evidence file if supplied
    if (data.evidence) {
      const validation = validateEvidenceFile({
        fileName: data.evidence.fileName,
        fileType: data.evidence.fileType,
        fileSize: data.evidence.fileSize,
      });
      if (!validation.valid) {
        throw new Error(validation.error);
      }
    }

    // Insert correction request
    // Note: status is set to 'pending' to comply with existing DB check constraints,
    // while the application handles lifecycle states (submitted / under_review)
    const { data: req, error } = await context.supabase
      .from("correction_requests")
      .insert({
        student_id: data.studentId,
        requested_by: context.userId,
        field_name: data.fieldName,
        current_value: data.currentValue,
        proposed_value: data.proposedValue.trim(),
        reason: data.reason.trim(),
        status: "pending",
      })
      .select()
      .single();
    if (error) throw new Error(error.message);

    // Write audit log
    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "insert",
      entity_type: "correction_request",
      entity_id: req.id,
      details: {
        student_id: data.studentId,
        field_name: data.fieldName,
        role: context.role,
        issue_code: data.issueCode ?? null,
        evidence: data.evidence ?? null,
      },
    });

    // Notify institution staff of new submission
    try {
      const { data: studentData } = await context.supabase
        .from("students")
        .select("name, institution_id")
        .eq("id", data.studentId)
        .maybeSingle();

      if (studentData?.institution_id) {
        // Find staff profiles in the same institution
        const { data: staffProfiles } = await context.supabase
          .from("user_profiles")
          .select("id")
          .eq("institution_id", studentData.institution_id)
          .in("role", ["institution_admin", "officer"]);

        if (staffProfiles && staffProfiles.length > 0) {
          const notifications = staffProfiles.map((p) => ({
            user_id: p.id,
            type: "correction_request_submitted",
            title: "New Correction Request",
            message: `${studentData.name} requested a correction for ${data.fieldName.replace(/_/g, " ")}.`,
          }));
          await context.supabase.from("notifications").insert(notifications);
        }
      }
    } catch {
      // Non-blocking notification dispatch
    }

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

// ── Student: Provide additional information / response ────────────────────

export const provideAdditionalInformation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      requestId: string;
      additionalNotes: string;
      evidence?:
        | {
            fileName: string;
            fileType: string;
            fileSize: number;
            storagePath?: string | undefined;
          }
        | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const { data: req } = await context.supabase
      .from("correction_requests")
      .select("*, students!inner(institution_id, name)")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Correction request not found.");

    if (context.role === "student" && req.requested_by !== context.userId) {
      throw new Error("Forbidden: you can only update your own requests.");
    }

    if (data.evidence) {
      const validation = validateEvidenceFile({
        fileName: data.evidence.fileName,
        fileType: data.evidence.fileType,
        fileSize: data.evidence.fileSize,
      });
      if (!validation.valid) throw new Error(validation.error);
    }

    const updatedNotes = req.reviewer_notes
      ? `${req.reviewer_notes}\n[Student Response ${new Date().toLocaleDateString("en-IN")}]: ${data.additionalNotes.trim()}`
      : `[Student Response ${new Date().toLocaleDateString("en-IN")}]: ${data.additionalNotes.trim()}`;

    // Update request
    const { error: updateErr } = await context.supabase
      .from("correction_requests")
      .update({
        reviewer_notes: updatedNotes,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);
    if (updateErr) throw new Error(updateErr.message);

    // Audit log
    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "update",
      entity_type: "correction_request",
      entity_id: data.requestId,
      details: {
        action: "provide_additional_information",
        notes: data.additionalNotes,
        evidence: data.evidence ?? null,
      },
    });

    return { ok: true };
  });

// ── Staff: list correction requests for their institution ─────────────────

export const listPendingCorrectionRequests = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input?: { statusFilter?: string | undefined }) => input ?? { statusFilter: undefined },
  )
  .handler(async ({ data: inputData, context }) => {
    requireStaff(context.role);

    // Build join query: correction_requests → students (to scope by institution)
    let query = context.supabase
      .from("correction_requests")
      .select(
        "*, students!inner(id, name, institution_id, user_id, student_id, dob, contact, category, programme_code, intake_type, gender)",
      )
      .order("created_at", { ascending: false });

    if (context.role !== "aicte_admin" && context.institutionId) {
      query = (query as unknown as { eq: (col: string, val: string) => typeof query }).eq(
        "students.institution_id",
        context.institutionId,
      );
    }

    if (inputData?.statusFilter && inputData.statusFilter !== "all") {
      query = query.eq("status", inputData.statusFilter);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as CorrectionRequestWithStudent[];
  });

export const pendingCorrectionRequestsQueryOptions = (statusFilter?: string) =>
  queryOptions({
    queryKey: ["pending-correction-requests", statusFilter ?? "all"],
    queryFn: () => listPendingCorrectionRequests({ data: { statusFilter } }),
  });

// ── Staff: Review, transition, approve or reject a request ─────────────────

export const reviewCorrectionRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      requestId: string;
      decision: "approved" | "rejected" | "under_review" | "needs_information" | "cancelled";
      reviewerNotes?: string | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    requireStaff(context.role);

    // Mandatory rejection reason validation
    if (data.decision === "rejected") {
      const reason = data.reviewerNotes?.trim();
      if (!reason || reason.length < 5) {
        throw new Error("A mandatory rejection reason (at least 5 characters) must be provided.");
      }
    }

    if (data.decision === "needs_information") {
      const notes = data.reviewerNotes?.trim();
      if (!notes || notes.length < 5) {
        throw new Error("Reviewer notes specifying what information is needed are required.");
      }
    }

    // Fetch the request with full student info
    const { data: req } = await context.supabase
      .from("correction_requests")
      .select(
        "*, students!inner(id, name, institution_id, student_id, dob, contact, category, programme_code, intake_type, gender, apaar_id, apaar_verify_status)",
      )
      .eq("id", data.requestId)
      .maybeSingle();
    if (!req) throw new Error("Correction request not found.");

    // Institution-scoped check
    const studentInfo = (req as unknown as { students?: { institution_id?: string } }).students;
    if (context.role !== "aicte_admin" && context.institutionId) {
      if (studentInfo?.institution_id !== context.institutionId) {
        throw new Error("Forbidden: request is not in your institution.");
      }
    }

    // Map decision to database status
    // Note: Database check constraint allows 'pending', 'approved', 'rejected'
    let dbStatus = "pending";
    if (data.decision === "approved") {
      dbStatus = "approved";
    } else if (data.decision === "rejected") {
      dbStatus = "rejected";
    } else if (data.decision === "under_review" || data.decision === "needs_information") {
      dbStatus = "pending";
    } else if (data.decision === "cancelled") {
      dbStatus = "rejected"; // Map cancelled to non-pending
    }

    const { error: updateErr } = await context.supabase
      .from("correction_requests")
      .update({
        status: dbStatus,
        reviewed_by: context.userId,
        reviewer_notes: data.reviewerNotes?.trim() ?? null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.requestId);
    if (updateErr) throw new Error(updateErr.message);

    // If approved, apply the field change safely with concurrency conflict check
    let qualityRecalcResult: ReturnType<typeof recalculateQualityAfterCorrection> | null = null;

    if (data.decision === "approved") {
      const fullStudent = (
        req as unknown as {
          students: {
            id: string;
            student_id?: string | null;
            name: string;
            dob?: string | null;
            apaar_id?: string | null;
            gender?: string | null;
            contact?: string | null;
            category?: string | null;
            programme_code?: string | null;
            intake_type?: string | null;
            apaar_verify_status?: string | null;
          };
        }
      ).students;

      // 1. Conflict detection
      const { data: allInstStudents } = await context.supabase
        .from("students")
        .select("id, name, dob, apaar_id")
        .eq("institution_id", studentInfo?.institution_id ?? "");

      const conflictCheck = detectCorrectionConflicts(
        fullStudent,
        {
          field_name: req.field_name as CorrectableFieldName,
          current_value: req.current_value,
          proposed_value: req.proposed_value,
        },
        [],
        (allInstStudents ?? []) as Array<{ id: string; name: string; dob?: string | null }>,
      );

      if (conflictCheck.hasConflict) {
        // Revert status to pending with warning note
        await context.supabase
          .from("correction_requests")
          .update({
            status: "pending",
            reviewer_notes: `[CONFLICT DETECTED]: ${conflictCheck.message}`,
            updated_at: new Date().toISOString(),
          })
          .eq("id", data.requestId);

        throw new Error(`Cannot apply correction due to conflict: ${conflictCheck.message}`);
      }

      // 2. Map field and apply update to student record
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
      if (!dbField) {
        throw new Error(`Field '${req.field_name}' cannot be corrected via this workflow.`);
      }

      const updatePayload: Record<string, string> = { [dbField]: req.proposed_value };
      const { error: studentErr } = await context.supabase
        .from("students")
        .update(updatePayload as TablesUpdate<"students">)
        .eq("id", req.student_id);
      if (studentErr) throw new Error(studentErr.message);

      // 3. Recalculate quality
      qualityRecalcResult = recalculateQualityAfterCorrection(
        fullStudent,
        req.field_name as CorrectableFieldName,
        req.proposed_value,
      );
    }

    // Write audit log
    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: data.decision === "approved" ? "apply_correction" : data.decision,
      entity_type: "correction_request",
      entity_id: data.requestId,
      details: {
        student_id: req.student_id,
        field_name: req.field_name,
        previous_value: req.current_value,
        new_value: req.proposed_value,
        decision: data.decision,
        reviewer_notes: data.reviewerNotes ?? null,
        quality_delta: qualityRecalcResult?.scoreDelta ?? null,
        new_quality_score: qualityRecalcResult?.newReport.overallScore ?? null,
        role: context.role,
      },
    });

    // Notify student
    try {
      const studentUserId = (req as unknown as { students?: { user_id?: string } }).students
        ?.user_id;
      if (studentUserId) {
        await context.supabase.from("notifications").insert({
          user_id: studentUserId,
          type: `correction_request_${data.decision}`,
          title: `Correction Request ${data.decision.toUpperCase()}`,
          message:
            data.decision === "approved"
              ? `Your correction for ${req.field_name.replace(/_/g, " ")} was approved and applied to your record.`
              : data.decision === "rejected"
                ? `Your correction for ${req.field_name.replace(/_/g, " ")} was declined. Reason: ${data.reviewerNotes}`
                : `Your correction request was updated to ${data.decision.replace(/_/g, " ")}.`,
        });
      }
    } catch {
      // Non-blocking notification dispatch
    }

    return {
      ok: true,
      decision: data.decision,
      qualitySummary: qualityRecalcResult?.summaryMessage ?? null,
    };
  });

// ── Analytics Query ────────────────────────────────────────────────────────

export const getCorrectionAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    requireStaff(context.role);

    let query = context.supabase
      .from("correction_requests")
      .select("id, field_name, status, created_at, updated_at, students!inner(institution_id)");

    if (context.role !== "aicte_admin" && context.institutionId) {
      query = (query as unknown as { eq: (col: string, val: string) => typeof query }).eq(
        "students.institution_id",
        context.institutionId,
      );
    }

    const { data: requests, error } = await query;
    if (error) throw new Error(error.message);

    const reqs = requests ?? [];
    let pendingCount = 0;
    let approvedCount = 0;
    let rejectedCount = 0;
    let overdueCount = 0;

    let totalResolutionHours = 0;
    let resolvedCount = 0;

    const fieldCounts: Record<string, number> = {};
    const now = Date.now();
    const SLA_HOURS_MS = 48 * 60 * 60 * 1000;

    for (const r of reqs) {
      fieldCounts[r.field_name] = (fieldCounts[r.field_name] ?? 0) + 1;

      if (r.status === "pending") {
        pendingCount++;
        const age = now - new Date(r.created_at).getTime();
        if (age > SLA_HOURS_MS) {
          overdueCount++;
        }
      } else if (r.status === "approved") {
        approvedCount++;
        const hours =
          (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
        if (hours >= 0) {
          totalResolutionHours += hours;
          resolvedCount++;
        }
      } else if (r.status === "rejected") {
        rejectedCount++;
        const hours =
          (new Date(r.updated_at).getTime() - new Date(r.created_at).getTime()) / (1000 * 60 * 60);
        if (hours >= 0) {
          totalResolutionHours += hours;
          resolvedCount++;
        }
      }
    }

    const avgResolutionHours =
      resolvedCount > 0 ? Math.round((totalResolutionHours / resolvedCount) * 10) / 10 : null;

    const topFields = Object.entries(fieldCounts)
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalRequests: reqs.length,
      pendingCount,
      approvedCount,
      rejectedCount,
      overdueCount,
      avgResolutionHours,
      topFields,
    };
  });

export const correctionAnalyticsQueryOptions = queryOptions({
  queryKey: ["correction-analytics"],
  queryFn: () => getCorrectionAnalytics(),
});
