import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { requireStaff } from "@/lib/rbac";
import {
  aggregateInstitutionalIntelligence,
  sanitizeForAIPrompt,
  type InstitutionalIntelligenceMetrics,
  type RawStudentInput,
  type RawCorrectionInput,
  type RawProgrammeInput,
} from "./institutional-intelligence";
import {
  resolveInstitutionalAIProvider,
  type InstitutionalAIResponse,
  type InstitutionalReportType,
} from "./institutional-ai";

// ── 1. Get Aggregated Institutional Intelligence ───────────────────────────

export interface InstitutionalIntelligenceDashboardData {
  metrics: InstitutionalIntelligenceMetrics;
  aiInsights: InstitutionalAIResponse;
  providerStatus: "gemini" | "rule_based";
  isGeminiConfigured: boolean;
}

export const getInstitutionalIntelligence = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<InstitutionalIntelligenceDashboardData> => {
    requireStaff(context.role);

    // 1. Fetch institution details
    let institutionName = "All Participating Institutions";
    let scopedInstitutionId = context.institutionId ?? "00000000-0000-0000-0000-000000000000";

    if (context.institutionId) {
      const { data: instData } = await context.supabase
        .from("institutions")
        .select("name")
        .eq("id", context.institutionId)
        .maybeSingle();
      if (instData?.name) {
        institutionName = instData.name;
        scopedInstitutionId = context.institutionId;
      }
    }

    // 2. Fetch scoped students
    let studentQuery = context.supabase
      .from("students")
      .select(
        "id, student_id, apaar_id, name, dob, programme_code, category, intake_type, contact, gender, admission_year, institution_id, apaar_verify_status, consent_recorded, created_at",
      );

    if (context.role !== "aicte_admin" && context.institutionId) {
      studentQuery = studentQuery.eq("institution_id", context.institutionId);
    }

    const { data: studentRows, error: studentErr } = await studentQuery;
    if (studentErr) throw new Error(studentErr.message);

    // 3. Fetch scoped programmes
    let programmeQuery = context.supabase
      .from("programmes")
      .select("id, course_code, course_name, intake_approved, institution_id");

    if (context.role !== "aicte_admin" && context.institutionId) {
      programmeQuery = programmeQuery.eq("institution_id", context.institutionId);
    }

    const { data: progRows, error: progErr } = await programmeQuery;
    if (progErr) throw new Error(progErr.message);

    const mappedProgrammes: RawProgrammeInput[] = (progRows ?? []).map((p) => ({
      id: p.id,
      code: p.course_code,
      name: p.course_name ?? p.course_code,
      approved_intake: p.intake_approved,
      institution_id: p.institution_id,
    }));

    // 4. Fetch scoped corrections
    let correctionQuery = context.supabase
      .from("correction_requests")
      .select("id, student_id, field_name, status, created_at, updated_at, proposed_value");

    if (context.role !== "aicte_admin" && context.institutionId) {
      const studentIds = (studentRows ?? []).map((s) => s.id);
      if (studentIds.length > 0) {
        correctionQuery = correctionQuery.in("student_id", studentIds);
      } else {
        correctionQuery = correctionQuery.eq("student_id", "00000000-0000-0000-0000-000000000000");
      }
    }

    const { data: corrRows, error: corrErr } = await correctionQuery;
    if (corrErr) throw new Error(corrErr.message);

    // 5. Aggregate Intelligence Metrics
    const metrics = aggregateInstitutionalIntelligence({
      institutionId: scopedInstitutionId,
      institutionName,
      students: (studentRows ?? []) as RawStudentInput[],
      programmes: mappedProgrammes,
      corrections: (corrRows ?? []) as RawCorrectionInput[],
    });

    // 6. Generate AI Insights via Resolver
    const sanitized = sanitizeForAIPrompt(metrics);
    const { provider, status, isGeminiConfigured } = resolveInstitutionalAIProvider();
    const aiInsights = await provider.generateInsights(sanitized);

    return {
      metrics,
      aiInsights,
      providerStatus: status,
      isGeminiConfigured,
    };
  });

export const institutionalIntelligenceQueryOptions = queryOptions({
  queryKey: ["institutional-intelligence"],
  queryFn: () => getInstitutionalIntelligence(),
  staleTime: 60 * 1000,
});

// ── 2. Natural-Language Assistant Query ─────────────────────────────────────

export interface AskAssistantInput {
  question: string;
}

export const askInstitutionalAssistant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    if (typeof d !== "object" || d === null) throw new Error("Invalid input");
    const q = (d as { question?: unknown }).question;
    if (typeof q !== "string" || !q.trim()) throw new Error("Question cannot be empty");
    return { question: q.trim() };
  })
  .handler(async ({ context, data }): Promise<InstitutionalAIResponse> => {
    requireStaff(context.role);

    // 1. Fetch current scoped metrics
    let institutionName = "All Participating Institutions";
    let scopedInstitutionId = context.institutionId ?? "00000000-0000-0000-0000-000000000000";

    if (context.institutionId) {
      const { data: instData } = await context.supabase
        .from("institutions")
        .select("name")
        .eq("id", context.institutionId)
        .maybeSingle();
      if (instData?.name) {
        institutionName = instData.name;
        scopedInstitutionId = context.institutionId;
      }
    }

    let studentQuery = context.supabase
      .from("students")
      .select(
        "id, student_id, apaar_id, name, dob, programme_code, category, intake_type, contact, gender, admission_year, institution_id, apaar_verify_status, consent_recorded, created_at",
      );
    if (context.role !== "aicte_admin" && context.institutionId) {
      studentQuery = studentQuery.eq("institution_id", context.institutionId);
    }
    const { data: studentRows } = await studentQuery;

    let progQuery = context.supabase
      .from("programmes")
      .select("id, course_code, course_name, intake_approved, institution_id");
    if (context.role !== "aicte_admin" && context.institutionId) {
      progQuery = progQuery.eq("institution_id", context.institutionId);
    }
    const { data: progRows } = await progQuery;

    const mappedProgrammes: RawProgrammeInput[] = (progRows ?? []).map((p) => ({
      id: p.id,
      code: p.course_code,
      name: p.course_name ?? p.course_code,
      approved_intake: p.intake_approved,
      institution_id: p.institution_id,
    }));

    let corrQuery = context.supabase
      .from("correction_requests")
      .select("id, student_id, field_name, status, created_at, updated_at, proposed_value");
    if (context.role !== "aicte_admin" && context.institutionId) {
      const studentIds = (studentRows ?? []).map((s) => s.id);
      if (studentIds.length > 0) {
        corrQuery = corrQuery.in("student_id", studentIds);
      }
    }
    const { data: corrRows } = await corrQuery;

    const metrics = aggregateInstitutionalIntelligence({
      institutionId: scopedInstitutionId,
      institutionName,
      students: (studentRows ?? []) as RawStudentInput[],
      programmes: mappedProgrammes,
      corrections: (corrRows ?? []) as RawCorrectionInput[],
    });

    const sanitized = sanitizeForAIPrompt(metrics);
    const { provider } = resolveInstitutionalAIProvider();

    return await provider.answerQuestion(data.question, sanitized);
  });

// ── 3. Generate Official Institutional Report ──────────────────────────────

export interface GenerateReportInput {
  reportType: InstitutionalReportType;
  reportingPeriod: string;
}

export const generateInstitutionalReportFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    if (typeof d !== "object" || d === null) throw new Error("Invalid input");
    const { reportType, reportingPeriod } = d as {
      reportType?: unknown;
      reportingPeriod?: unknown;
    };
    if (typeof reportType !== "string" || !reportType) throw new Error("Report type required");
    return {
      reportType: reportType as InstitutionalReportType,
      reportingPeriod:
        typeof reportingPeriod === "string" ? reportingPeriod : "Current Academic Term",
    };
  })
  .handler(async ({ context, data }): Promise<InstitutionalAIResponse> => {
    requireStaff(context.role);

    let institutionName = "Participating Institution";
    let scopedInstitutionId = context.institutionId ?? "00000000-0000-0000-0000-000000000000";

    if (context.institutionId) {
      const { data: instData } = await context.supabase
        .from("institutions")
        .select("name")
        .eq("id", context.institutionId)
        .maybeSingle();
      if (instData?.name) {
        institutionName = instData.name;
        scopedInstitutionId = context.institutionId;
      }
    }

    let studentQuery = context.supabase
      .from("students")
      .select(
        "id, student_id, apaar_id, name, dob, programme_code, category, intake_type, contact, gender, admission_year, institution_id, apaar_verify_status, consent_recorded, created_at",
      );
    if (context.role !== "aicte_admin" && context.institutionId) {
      studentQuery = studentQuery.eq("institution_id", context.institutionId);
    }
    const { data: studentRows } = await studentQuery;

    let progQuery = context.supabase
      .from("programmes")
      .select("id, course_code, course_name, intake_approved, institution_id");
    if (context.role !== "aicte_admin" && context.institutionId) {
      progQuery = progQuery.eq("institution_id", context.institutionId);
    }
    const { data: progRows } = await progQuery;

    const mappedProgrammes: RawProgrammeInput[] = (progRows ?? []).map((p) => ({
      id: p.id,
      code: p.course_code,
      name: p.course_name ?? p.course_code,
      approved_intake: p.intake_approved,
      institution_id: p.institution_id,
    }));

    let corrQuery = context.supabase
      .from("correction_requests")
      .select("id, student_id, field_name, status, created_at, updated_at, proposed_value");
    if (context.role !== "aicte_admin" && context.institutionId) {
      const studentIds = (studentRows ?? []).map((s) => s.id);
      if (studentIds.length > 0) {
        corrQuery = corrQuery.in("student_id", studentIds);
      }
    }
    const { data: corrRows } = await corrQuery;

    const metrics = aggregateInstitutionalIntelligence({
      institutionId: scopedInstitutionId,
      institutionName,
      students: (studentRows ?? []) as RawStudentInput[],
      programmes: mappedProgrammes,
      corrections: (corrRows ?? []) as RawCorrectionInput[],
    });

    const sanitized = sanitizeForAIPrompt(metrics);
    const { provider, status } = resolveInstitutionalAIProvider();
    const report = await provider.generateReport(sanitized, data.reportType);

    // Attempt to persist report metadata in institutional_reports if table exists
    try {
      await (
        context.supabase as unknown as {
          from: (table: string) => { insert: (obj: unknown) => Promise<unknown> };
        }
      )
        .from("institutional_reports")
        .insert({
          institution_id: scopedInstitutionId,
          report_type: data.reportType,
          title: report.summary.slice(0, 100),
          reporting_period: data.reportingPeriod,
          generated_by: context.userId,
          provider_used: status,
          key_metrics: report.supportingMetrics,
          content: report,
        });
    } catch {
      // Table may not yet be applied in remote Supabase; fail silently
    }

    return report;
  });

// ── 4. Submit Insight Feedback ──────────────────────────────────────────────

export interface InsightFeedbackInput {
  insightId: string;
  feedbackType: "helpful" | "inaccurate" | "dismissed" | "reviewed";
  comments?: string;
}

export const submitInsightFeedbackFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((d: unknown) => {
    if (typeof d !== "object" || d === null) throw new Error("Invalid input");
    const { insightId, feedbackType, comments } = d as {
      insightId?: unknown;
      feedbackType?: unknown;
      comments?: unknown;
    };
    if (typeof insightId !== "string" || !insightId) throw new Error("Insight ID required");
    if (
      typeof feedbackType !== "string" ||
      !["helpful", "inaccurate", "dismissed", "reviewed"].includes(feedbackType)
    ) {
      throw new Error("Invalid feedback type");
    }
    return {
      insightId,
      feedbackType: feedbackType as "helpful" | "inaccurate" | "dismissed" | "reviewed",
      comments: typeof comments === "string" ? comments : undefined,
    };
  })
  .handler(async ({ context, data }) => {
    requireStaff(context.role);

    const institutionId = context.institutionId ?? "00000000-0000-0000-0000-000000000000";

    try {
      // Try inserting into institutional_insight_feedback
      await (
        context.supabase as unknown as {
          from: (table: string) => { insert: (obj: unknown) => Promise<unknown> };
        }
      )
        .from("institutional_insight_feedback")
        .insert({
          institution_id: institutionId,
          insight_id: data.insightId,
          user_id: context.userId,
          feedback_type: data.feedbackType,
          comments: data.comments,
        });
    } catch {
      // Fallback: log to audit_logs
      await context.supabase.from("audit_logs").insert({
        user_id: context.userId,
        action: `insight_feedback_${data.feedbackType}`,
        entity_type: "institutional_insight",
        entity_id: data.insightId,
        details: {
          feedback_type: data.feedbackType,
          comments: data.comments,
        },
      });
    }

    return { success: true };
  });

// ── 5. Provider Status Check ───────────────────────────────────────────────

export const getAIProviderStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    requireStaff(context.role);
    const { status, isGeminiConfigured } = resolveInstitutionalAIProvider();
    return {
      status,
      isGeminiConfigured,
      model: process.env["GEMINI_MODEL"] ?? "gemini-2.0-flash",
    };
  });
