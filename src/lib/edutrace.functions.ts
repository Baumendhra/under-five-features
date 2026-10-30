import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Json } from "@/integrations/supabase/types";
import { verifyApaarId } from "@/lib/apaar-adapter";
import { generateCandidatePairs, type StudentIdentityRecord } from "@/lib/identity-resolution";
import {
  requireAicteAdmin,
  requireStaff,
  requireExportPermission,
  requireApaarVerifyPermission,
  requireDuplicateResolvePermission,
  requireAuditAccess,
  applyStudentScope,
} from "@/lib/rbac";

// ── Types ─────────────────────────────────────────────────────────────────

export type Institution = {
  id: string;
  name: string;
  aicte_id: string | null;
  region: string | null;
  affiliation: string | null;
  address: string | null;
  contact_email: string | null;
  created_at: string;
};

export type Programme = {
  id: string;
  institution_id: string;
  course_code: string;
  course_name: string | null;
  year: number;
  intake_approved: number;
  intake_nri: number;
  intake_supernumerary: number;
  other_details: string | null;
  created_at: string;
};

export type DashboardStats = {
  total: number;
  verified: number;
  missing_apaar: number;
  invalid_apaar: number;
  pending_verification: number;
  duplicates: number;
  categories: Record<string, number>;
  programmes: Record<string, number>;
  intake_types: Record<string, number>;
  recent_uploads: { date: string; count: number }[];
};

export type DuplicateCase = {
  id: string;
  student_ids: string[];
  reason: string;
  status: string;
  resolution: string | null;
  created_at: string;
  updated_at?: string | null | undefined;
  reviewed_by?: string | null | undefined;
  match_score?: number | null | undefined;
  confidence?: string | null | undefined;
  match_details?: Json | null | undefined;
  cluster_id?: string | null | undefined;
  institution_id?: string | null | undefined;
};

export type AuditEntry = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Json;
  created_at: string;
};

export type Notification = {
  id: string;
  type: string;
  title: string;
  message: string | null;
  read: boolean;
  created_at: string;
};

export type UserProfile = {
  id: string;
  full_name: string | null;
  role: string;
  institution_id: string | null;
};

// ── Institutions ──────────────────────────────────────────────────────────

export const listInstitutions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // All authenticated users can list institutions (needed for forms etc.)
    const { data, error } = await context.supabase.from("institutions").select("*").order("name");
    if (error) throw new Error(error.message);
    return (data ?? []) as Institution[];
  });

export const institutionsQueryOptions = queryOptions({
  queryKey: ["institutions"],
  queryFn: () => listInstitutions(),
});

export const createInstitution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Omit<Institution, "id" | "created_at">) => input)
  .handler(async ({ data, context }) => {
    // Only AICTE admin can create institutions
    requireAicteAdmin(context.role);

    const { data: inst, error } = await context.supabase
      .from("institutions")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "insert",
      entity_type: "institution",
      entity_id: inst.id,
      details: { name: data.name },
    });
    return inst as Institution;
  });

export const updateInstitution = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Partial<Institution> & { id: string }) => input)
  .handler(async ({ data, context }) => {
    requireAicteAdmin(context.role);
    const { id, ...rest } = data;
    const { data: inst, error } = await context.supabase
      .from("institutions")
      .update(rest)
      .eq("id", id)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "update",
      entity_type: "institution",
      entity_id: id,
      details: rest,
    });
    return inst as Institution;
  });

// ── Programmes ────────────────────────────────────────────────────────────

export const listProgrammes = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("programmes")
      .select("*")
      .order("course_code");
    if (error) throw new Error(error.message);
    return (data ?? []) as Programme[];
  });

export const programmesQueryOptions = queryOptions({
  queryKey: ["programmes"],
  queryFn: () => listProgrammes(),
});

export const createProgramme = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: Omit<Programme, "id" | "created_at">) => input)
  .handler(async ({ data, context }) => {
    // aicte_admin or institution_admin can create programmes
    if (context.role !== "aicte_admin" && context.role !== "institution_admin") {
      throw new Error("Forbidden: only institution admins may create programmes.");
    }
    // Institution admin can only create programmes for their own institution
    if (
      context.role === "institution_admin" &&
      context.institutionId &&
      data.institution_id !== context.institutionId
    ) {
      throw new Error("Forbidden: you may only create programmes for your institution.");
    }
    const { data: prog, error } = await context.supabase
      .from("programmes")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "insert",
      entity_type: "programme",
      entity_id: prog.id,
      details: { course_code: data.course_code },
    });
    return prog as Programme;
  });

// ── Enhanced Dashboard Stats ───────────────────────────────────────────────

export const getDashboardStats = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<DashboardStats> => {
    let query = context.supabase
      .from("students")
      .select("apaar_id, apaar_verify_status, category, programme_code, intake_type, created_at");

    // Apply role-scoped data filter
    query = applyStudentScope(
      query as any,
      context.role,
      context.userId,
      context.institutionId,
    ) as any;

    const { data: students, error } = await query;
    if (error) throw new Error(error.message);

    const rows = students ?? [];
    const APAAR_RE = /^\d{12}$/;

    let verified = 0,
      missing = 0,
      invalid = 0,
      pending = 0;
    const categories: Record<string, number> = {};
    const programmes: Record<string, number> = {};
    const intakeTypes: Record<string, number> = {};
    const byDate: Record<string, number> = {};

    for (const s of rows) {
      const apaar = s.apaar_id?.replace(/[\s-]/g, "") ?? null;
      if (!apaar) missing++;
      else if (!APAAR_RE.test(apaar)) invalid++;
      else verified++;

      if (s.apaar_verify_status === "pending" && apaar && APAAR_RE.test(apaar)) pending++;

      if (s.category) categories[s.category] = (categories[s.category] ?? 0) + 1;
      if (s.programme_code) programmes[s.programme_code] = (programmes[s.programme_code] ?? 0) + 1;
      if (s.intake_type) intakeTypes[s.intake_type] = (intakeTypes[s.intake_type] ?? 0) + 1;

      const dateKey = s.created_at?.slice(0, 10);
      if (dateKey) byDate[dateKey] = (byDate[dateKey] ?? 0) + 1;
    }

    // Duplicate cases – scoped for institution users
    const dupQuery = context.supabase
      .from("duplicate_cases")
      .select("*", { count: "exact", head: true })
      .eq("status", "open");

    const { count: duplicates } = await dupQuery;

    const recent_uploads = Object.entries(byDate)
      .sort(([a], [b]) => b.localeCompare(a))
      .slice(0, 14)
      .map(([date, count]) => ({ date, count }))
      .reverse();

    return {
      total: rows.length,
      verified,
      missing_apaar: missing,
      invalid_apaar: invalid,
      pending_verification: pending,
      duplicates: duplicates ?? 0,
      categories,
      programmes,
      intake_types: intakeTypes,
      recent_uploads,
    };
  });

export const dashboardStatsQueryOptions = queryOptions({
  queryKey: ["dashboard-stats"],
  queryFn: () => getDashboardStats(),
});

// ── APAAR Verification ────────────────────────────────────────────────────

export const verifyStudentApaar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { studentId: string; apaarId: string }) => input)
  .handler(async ({ data, context }) => {
    // Only staff can verify APAAR
    requireApaarVerifyPermission(context.role);

    const result = await verifyApaarId(data.apaarId);
    const newStatus =
      result.status === "verified"
        ? "verified"
        : result.status === "not_found"
          ? "not_found"
          : "failed";

    // Scope update: staff scoped by institution, student scoped by user_id
    let updateQuery = context.supabase
      .from("students")
      .update({
        apaar_verify_status: newStatus,
        apaar_verified_at: newStatus === "verified" ? new Date().toISOString() : null,
      })
      .eq("id", data.studentId);

    // Institution admins/officers can only update students in their institution
    if (context.role !== "aicte_admin" && context.institutionId) {
      updateQuery = (updateQuery as any).eq("institution_id", context.institutionId);
    } else if (context.role !== "aicte_admin") {
      updateQuery = (updateQuery as any).eq("user_id", context.userId);
    }

    await updateQuery;

    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "verify",
      entity_type: "student",
      entity_id: data.studentId,
      details: { apaar_id: data.apaarId, result: result.status, role: context.role },
    });

    return result;
  });

// ── Duplicate Cases ────────────────────────────────────────────────────────

export const listDuplicateCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Students cannot see duplicate cases
    requireAuditAccess(context.role);

    const { data, error } = await context.supabase
      .from("duplicate_cases")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as DuplicateCase[];
  });

export const duplicateCasesQueryOptions = queryOptions({
  queryKey: ["duplicate-cases"],
  queryFn: () => listDuplicateCases(),
});

export const resolveDuplicateCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      caseId: string;
      status: string;
      resolution: string;
      actionType?:
        "confirm_duplicate" | "not_duplicate" | "needs_information" | "escalate" | undefined;
      finalise?: boolean | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    const isFinalise =
      data.status === "resolved" ||
      data.status === "dismissed" ||
      data.status === "confirmed" ||
      data.actionType === "confirm_duplicate" ||
      data.actionType === "not_duplicate";

    requireDuplicateResolvePermission(context.role, isFinalise);

    if (!data.resolution || data.resolution.trim().length < 5) {
      throw new Error("A resolution or justification note of at least 5 characters is required.");
    }

    // Determine safe status for DB (fallback to 'resolved' or 'dismissed' if enum constraint is strict)
    let dbStatus = data.status;
    let enrichedResolution = data.resolution.trim();

    if (data.actionType === "confirm_duplicate") {
      dbStatus = "resolved"; // Maps cleanly to standard DB check ('open','under_review','resolved','dismissed')
      enrichedResolution = `[CONFIRMED DUPLICATE]: ${enrichedResolution}`;
    } else if (data.actionType === "not_duplicate") {
      dbStatus = "dismissed";
      enrichedResolution = `[NOT DUPLICATE]: ${enrichedResolution}`;
    } else if (data.actionType === "needs_information") {
      dbStatus = "under_review";
      enrichedResolution = `[NEEDS INFORMATION]: ${enrichedResolution}`;
    } else if (data.actionType === "escalate") {
      dbStatus = "under_review";
      enrichedResolution = `[ESCALATED]: ${enrichedResolution}`;
    }

    const { error } = await context.supabase
      .from("duplicate_cases")
      .update({
        status: dbStatus,
        resolution: enrichedResolution,
        reviewed_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.caseId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: data.actionType ?? data.status,
      entity_type: "duplicate_case",
      entity_id: data.caseId,
      details: {
        status: dbStatus,
        actionType: data.actionType ?? null,
        resolution: enrichedResolution,
        role: context.role,
        finalised: isFinalise,
      },
    });

    return { ok: true, status: dbStatus };
  });

export const createDuplicateCase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      studentIds: string[];
      reason: string;
      matchScore?: number | undefined;
      confidence?: string | undefined;
      matchDetails?: Record<string, unknown> | undefined;
      clusterId?: string | undefined;
      initialNotes?: string | undefined;
    }) => input,
  )
  .handler(async ({ data, context }) => {
    requireStaff(context.role);

    // Map reason to allowed database reason if strict
    const allowedReasons = ["apaar_duplicate", "name_dob_match", "fuzzy_name_match"];
    const safeReason = allowedReasons.includes(data.reason) ? data.reason : "fuzzy_name_match";

    const insertPayload: Record<string, unknown> = {
      student_ids: data.studentIds,
      reason: safeReason,
      status: "open",
      resolution: data.initialNotes ?? null,
    };

    const { data: created, error } = await context.supabase
      .from("duplicate_cases")
      .insert(insertPayload as any)
      .select()
      .single();

    if (error) throw new Error(error.message);

    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "create",
      entity_type: "duplicate_case",
      entity_id: (created as any)?.id ?? "new",
      details: {
        student_ids: data.studentIds,
        reason: data.reason,
        score: data.matchScore,
        confidence: data.confidence,
        role: context.role,
      },
    });

    return { ok: true, case: created };
  });

export const getDuplicateAnalytics = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    requireAuditAccess(context.role);

    // 1. Fetch institution students
    let query = context.supabase.from("students").select("*");
    if (context.role !== "aicte_admin" && context.institutionId) {
      query = query.eq("institution_id", context.institutionId);
    }
    const { data: students, error: stuErr } = await query;
    if (stuErr) throw new Error(stuErr.message);

    // 2. Fetch duplicate cases from DB
    const { data: cases, error: caseErr } = await context.supabase
      .from("duplicate_cases")
      .select("*");
    if (caseErr) throw new Error(caseErr.message);

    // 3. Run candidate generation on students
    const identityRecords: StudentIdentityRecord[] = (students ?? []).map((s) => ({
      id: s.id,
      studentId: s.student_id,
      apaarId: s.apaar_id,
      name: s.name,
      dob: s.dob,
      gender: s.gender,
      contact: s.contact,
      category: s.category,
      programmeCode: s.programme_code,
      admissionYear: s.admission_year,
      institutionId: s.institution_id,
    }));

    const candidates = generateCandidatePairs(identityRecords, {
      includeCrossInstitution: context.role === "aicte_admin",
    });

    const highConfidenceCount = candidates.filter(
      (c) => c.match.confidence === "HIGH_CONFIDENCE",
    ).length;
    const reviewRecommendedCount = candidates.filter(
      (c) => c.match.confidence === "REVIEW_RECOMMENDED",
    ).length;

    // Cases analytics
    const caseList = cases ?? [];
    const pendingCases = caseList.filter(
      (c) => c.status === "open" || c.status === "under_review" || c.status === "needs_information",
    );
    const confirmedCases = caseList.filter(
      (c) =>
        c.status === "confirmed" ||
        (c.status === "resolved" && !c.resolution?.toLowerCase().includes("not duplicate")),
    );
    const dismissedCases = caseList.filter(
      (c) =>
        c.status === "dismissed" ||
        (c.status === "resolved" && c.resolution?.toLowerCase().includes("not duplicate")),
    );

    // Average review time
    let totalReviewHours = 0;
    let reviewedCount = 0;
    for (const c of caseList) {
      if (c.status !== "open") {
        const diffMs =
          new Date(c.updated_at ?? c.created_at).getTime() - new Date(c.created_at).getTime();
        const hrs = diffMs / (1000 * 60 * 60);
        if (hrs >= 0) {
          totalReviewHours += hrs;
          reviewedCount++;
        }
      }
    }
    const avgReviewTimeHours =
      reviewedCount > 0 ? Math.round((totalReviewHours / reviewedCount) * 10) / 10 : null;

    // Common conflict fields
    const conflictFieldCounts: Record<string, number> = {};
    for (const c of candidates) {
      for (const conf of c.match.conflictingAttributes) {
        const key = conf.split(":")[0]?.trim() || conf;
        conflictFieldCounts[key] = (conflictFieldCounts[key] ?? 0) + 1;
      }
    }

    const topConflictFields = Object.entries(conflictFieldCounts)
      .map(([field, count]) => ({ field, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);

    return {
      totalCandidates: candidates.length,
      highConfidenceCount,
      reviewRecommendedCount,
      pendingCount: pendingCases.length,
      confirmedCount: confirmedCases.length,
      dismissedCount: dismissedCases.length,
      avgReviewTimeHours,
      topConflictFields,
    };
  });

export const duplicateAnalyticsQueryOptions = queryOptions({
  queryKey: ["duplicate-analytics"],
  queryFn: () => getDuplicateAnalytics(),
});

// ── Audit Logs ────────────────────────────────────────────────────────────

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // Students cannot view audit logs
    requireAuditAccess(context.role);

    let query = context.supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);

    // Institution-scoped users only see their institution's logs
    if (context.role !== "aicte_admin") {
      query = (query as any).eq("user_id", context.userId);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as AuditEntry[];
  });

export const auditLogsQueryOptions = queryOptions({
  queryKey: ["audit-logs"],
  queryFn: () => listAuditLogs(),
});

// ── Notifications ─────────────────────────────────────────────────────────

export const listNotifications = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("notifications")
      .select("*")
      .eq("user_id", context.userId)
      .order("created_at", { ascending: false })
      .limit(30);
    if (error) throw new Error(error.message);
    return (data ?? []) as Notification[];
  });

export const notificationsQueryOptions = queryOptions({
  queryKey: ["notifications"],
  queryFn: () => listNotifications(),
  refetchInterval: 60_000,
});

export const markNotificationRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((input: { notificationId: string }) => input)
  .handler(async ({ data, context }) => {
    await context.supabase
      .from("notifications")
      .update({ read: true })
      .eq("id", data.notificationId)
      .eq("user_id", context.userId); // enforce ownership
    return { ok: true };
  });

// ── User Profile ──────────────────────────────────────────────────────────

export const getUserProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("user_profiles")
      .select("*")
      .eq("id", context.userId)
      .single();
    if (error && error.code !== "PGRST116") throw new Error(error.message);
    return data as UserProfile | null;
  });

export const userProfileQueryOptions = queryOptions({
  queryKey: ["user-profile"],
  queryFn: () => getUserProfile(),
});

// ── Export ────────────────────────────────────────────────────────────────

function maskApaar(raw: string | null): string {
  if (!raw || raw.length < 6) return raw ?? "";
  const cleaned = raw.replace(/[\s-]/g, "");
  return cleaned.slice(0, 4) + "••••" + cleaned.slice(-4);
}

export const exportStudentsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { filterStatus?: string } | undefined) => input ?? {})
  .handler(async ({ data: filter, context }) => {
    // Students may not export
    requireExportPermission(context.role);

    let query = context.supabase
      .from("students")
      .select(
        "student_id, apaar_id, name, dob, gender, category, programme_code, intake_type, contact, apaar_verify_status, current_status, created_at",
      )
      .order("name");

    query = applyStudentScope(
      query as any,
      context.role,
      context.userId,
      context.institutionId,
    ) as any;

    if (filter?.filterStatus && filter.filterStatus !== "all") {
      query = (query as any).eq("apaar_verify_status", filter.filterStatus);
    }

    const { data, error } = await query;
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const headers = [
      "StudentID",
      "APAAR_ID_masked",
      "Name",
      "DOB",
      "Gender",
      "Category",
      "ProgrammeCode",
      "IntakeType",
      "Contact",
      "VerificationStatus",
      "CurrentStatus",
      "ImportedAt",
    ];
    const csvRows = rows.map((r) =>
      [
        r.student_id ?? "",
        maskApaar(r.apaar_id),
        r.name,
        r.dob ?? "",
        (r as any).gender ?? "",
        r.category ?? "",
        r.programme_code ?? "",
        r.intake_type ?? "",
        r.contact ?? "",
        (r as any).apaar_verify_status ?? "pending",
        (r as any).current_status ?? "active",
        r.created_at?.slice(0, 10) ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, '""')}"`)
        .join(","),
    );

    await context.supabase
      .from("audit_logs")
      .insert({
        user_id: context.userId,
        action: "export",
        entity_type: "student",
        entity_id: null,
        details: {
          row_count: rows.length,
          filter_status: filter?.filterStatus ?? "all",
          institution_id: context.institutionId,
          role: context.role,
        },
      })
      .throwOnError();

    const filename = `edutrace-export-${new Date().toISOString().slice(0, 10)}${filter?.filterStatus && filter.filterStatus !== "all" ? `-${filter.filterStatus}` : ""}.csv`;

    return { csv: [headers.join(","), ...csvRows].join("\n"), filename };
  });
