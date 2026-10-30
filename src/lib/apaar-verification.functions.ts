import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff, requireApaarVerifyPermission } from "@/lib/rbac";
import {
  ApaarVerificationOrchestrator,
  type OrchestratedVerificationResult,
} from "@/lib/apaar-orchestrator";

// ── Single Student Orchestrated Verification ──────────────────────────────

export const verifyStudentWithOrchestrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      studentId: string;
      consentRecorded?: boolean | undefined;
      forceRefresh?: boolean | undefined;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<OrchestratedVerificationResult> => {
    const supabase = context.supabase;

    // Check authorization: staff/admin can verify students in their scope; students can verify their own record
    let studentQuery = supabase
      .from("students")
      .select(
        "id, user_id, institution_id, name, dob, apaar_id, consent_recorded, apaar_verify_status",
      )
      .eq("id", data.studentId);

    if (context.role === "student") {
      studentQuery = (studentQuery as any).eq("user_id", context.userId);
    } else {
      requireApaarVerifyPermission(context.role);
      if (context.role !== "aicte_admin" && context.institutionId) {
        studentQuery = (studentQuery as any).eq("institution_id", context.institutionId);
      }
    }

    const { data: student, error: studError } = await studentQuery.maybeSingle();
    if (studError) throw new Error(studError.message);
    if (!student) {
      throw new Error(
        "Student record not found or inaccessible under your current institutional scope.",
      );
    }

    const consent = Boolean(data.consentRecorded ?? student.consent_recorded);

    // Initialize orchestrator and execute workflow
    const orchestrator = new ApaarVerificationOrchestrator();
    const result = await orchestrator.executeVerification({
      studentId: student.id,
      institutionId:
        student.institution_id || context.institutionId || "00000000-0000-0000-0000-000000000000",
      apaarId: student.apaar_id,
      studentName: student.name,
      studentDob: student.dob,
      consentRecorded: consent,
      forceRefresh: data.forceRefresh,
    });

    // Map external status to student registry status
    const dbStatus =
      result.externalStatus === "VERIFIED"
        ? "verified"
        : result.externalStatus === "PENDING_CONSENT"
          ? "pending"
          : result.externalStatus === "FAILED"
            ? "failed"
            : result.externalStatus === "MANUAL_REVIEW"
              ? "manual_review"
              : "service_unavailable";

    // Update students table
    await supabase
      .from("students")
      .update({
        apaar_verify_status: dbStatus,
        apaar_verified_at: result.externalStatus === "VERIFIED" ? new Date().toISOString() : null,
        consent_recorded: consent,
      })
      .eq("id", student.id);

    // Try logging to apaar_verification_jobs if table exists
    try {
      const { data: job } = await (supabase as any)
        .from("apaar_verification_jobs")
        .insert({
          student_id: student.id,
          institution_id:
            student.institution_id ||
            context.institutionId ||
            "00000000-0000-0000-0000-000000000000",
          provider: result.providerName,
          environment: result.providerEnvironment,
          status: result.externalStatus.toLowerCase(),
          request_id: result.requestId,
          attempt_count: result.attemptsCount || 1,
          failure_reason: result.failureCategory ?? null,
          is_simulated: result.isSimulated,
          masked_apaar: result.maskedApaar,
          requested_by: context.userId,
          completed_at: result.completedAt ?? null,
        })
        .select()
        .maybeSingle();

      if (job) {
        await (supabase as any).from("apaar_verification_events").insert({
          verification_job_id: job.id,
          event_type:
            result.externalStatus === "VERIFIED" ? "verification_succeeded" : "verification_failed",
          previous_status: student.apaar_verify_status ?? "not_submitted",
          new_status: result.externalStatus.toLowerCase(),
          message: result.humanReadableResult,
        });
      }
    } catch {
      // Table may be pending migration; gracefully proceed
    }

    // Insert audit log
    await supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "apaar_orchestrated_verify",
      entity_type: "student",
      entity_id: student.id,
      details: {
        masked_apaar: result.maskedApaar,
        status: result.externalStatus,
        provider: result.providerName,
        is_simulated: result.isSimulated,
        requires_manual_review: result.requiresManualReview,
      },
    });

    return result;
  });

// ── Batch Student Orchestrated Verification ───────────────────────────────

export interface BatchVerificationResponse {
  totalProcessed: number;
  verifiedCount: number;
  failedCount: number;
  manualReviewCount: number;
  pendingConsentCount: number;
  results: OrchestratedVerificationResult[];
}

export const batchVerifyStudentsWithOrchestrator = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { studentIds: string[] }) => input)
  .handler(async ({ data, context }): Promise<BatchVerificationResponse> => {
    requireStaff(context.role);

    const supabase = context.supabase;
    const requestedIds = data.studentIds.slice(0, 50); // Cap batch at 50

    let query = supabase
      .from("students")
      .select("id, institution_id, name, dob, apaar_id, consent_recorded, apaar_verify_status")
      .in("id", requestedIds);

    if (context.role !== "aicte_admin" && context.institutionId) {
      query = (query as any).eq("institution_id", context.institutionId);
    }

    const { data: students, error } = await query;
    if (error) throw new Error(error.message);

    const orchestrator = new ApaarVerificationOrchestrator();
    const results: OrchestratedVerificationResult[] = [];

    let verifiedCount = 0;
    let failedCount = 0;
    let manualReviewCount = 0;
    let pendingConsentCount = 0;

    for (const student of students ?? []) {
      const result = await orchestrator.executeVerification({
        studentId: student.id,
        institutionId:
          student.institution_id || context.institutionId || "00000000-0000-0000-0000-000000000000",
        apaarId: student.apaar_id,
        studentName: student.name,
        studentDob: student.dob,
        consentRecorded: Boolean(student.consent_recorded),
      });

      results.push(result);

      if (result.externalStatus === "VERIFIED") verifiedCount++;
      else if (result.externalStatus === "FAILED") failedCount++;
      else if (result.externalStatus === "MANUAL_REVIEW") manualReviewCount++;
      else if (result.externalStatus === "PENDING_CONSENT") pendingConsentCount++;

      // Update student table
      const dbStatus =
        result.externalStatus === "VERIFIED"
          ? "verified"
          : result.externalStatus === "PENDING_CONSENT"
            ? "pending"
            : result.externalStatus === "FAILED"
              ? "failed"
              : "manual_review";

      await supabase
        .from("students")
        .update({
          apaar_verify_status: dbStatus,
          apaar_verified_at: result.externalStatus === "VERIFIED" ? new Date().toISOString() : null,
        })
        .eq("id", student.id);
    }

    return {
      totalProcessed: results.length,
      verifiedCount,
      failedCount,
      manualReviewCount,
      pendingConsentCount,
      results,
    };
  });

// ── Query Options ─────────────────────────────────────────────────────────

export const verificationHistoryQueryOptions = (studentId: string) =>
  queryOptions({
    queryKey: ["verification-history", studentId],
    queryFn: async () => {
      // In-memory or client-side retrieval stub
      return [];
    },
  });
