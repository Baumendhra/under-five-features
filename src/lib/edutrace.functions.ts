import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { verifyApaarId } from "@/lib/apaar-adapter";

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
};

export type AuditEntry = {
  id: string;
  user_id: string | null;
  action: string;
  entity_type: string;
  entity_id: string | null;
  details: Record<string, unknown> | null;
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
    const { data, error } = await context.supabase
      .from("institutions")
      .select("*")
      .order("name");
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
    const { data: inst, error } = await context.supabase
      .from("institutions")
      .insert(data)
      .select()
      .single();
    if (error) throw new Error(error.message);
    // Log audit
    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "insert",
      entity_type: "institution",
      entity_id: inst.id,
      details: { name: data.name },
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
    const { data: students, error } = await context.supabase
      .from("students")
      .select("apaar_id, apaar_verify_status, category, programme_code, intake_type, created_at")
      .eq("user_id", context.userId);
    if (error) throw new Error(error.message);

    const rows = students ?? [];
    const APAAR_RE = /^\d{12}$/;

    let verified = 0, missing = 0, invalid = 0, pending = 0;
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

    // Get duplicate cases
    const { count: duplicates } = await context.supabase
      .from("duplicate_cases")
      .select("*", { count: "exact", head: true })
      .eq("status", "open");

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
    const result = await verifyApaarId(data.apaarId);

    // Update student's verification status
    const newStatus = result.status === "verified" ? "verified"
      : result.status === "not_found" ? "not_found"
      : "failed";

    await context.supabase
      .from("students")
      .update({
        apaar_verify_status: newStatus,
        apaar_verified_at: newStatus === "verified" ? new Date().toISOString() : null,
      })
      .eq("id", data.studentId)
      .eq("user_id", context.userId);

    // Audit log
    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "verify",
      entity_type: "student",
      entity_id: data.studentId,
      details: { apaar_id: data.apaarId, result: result.status },
    });

    return result;
  });

// ── Duplicate Cases ────────────────────────────────────────────────────────

export const listDuplicateCases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
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
  .validator((input: { caseId: string; status: string; resolution: string }) => input)
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase
      .from("duplicate_cases")
      .update({
        status: data.status,
        resolution: data.resolution,
        reviewed_by: context.userId,
        updated_at: new Date().toISOString(),
      })
      .eq("id", data.caseId);
    if (error) throw new Error(error.message);

    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "update",
      entity_type: "duplicate_case",
      entity_id: data.caseId,
      details: { status: data.status, resolution: data.resolution },
    });

    return { ok: true };
  });

// ── Audit Logs ────────────────────────────────────────────────────────────

export const listAuditLogs = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("audit_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(100);
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
      .eq("user_id", context.userId);
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

export const exportStudentsCsv = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("students")
      .select("student_id, apaar_id, name, dob, gender, category, programme_code, intake_type, contact, apaar_verify_status, current_status, created_at")
      .eq("user_id", context.userId)
      .order("name");
    if (error) throw new Error(error.message);

    const rows = data ?? [];
    const headers = ["StudentID", "APAAR_ID", "Name", "DOB", "Gender", "Category", "ProgrammeCode", "IntakeType", "Contact", "VerificationStatus", "CurrentStatus", "ImportedAt"];
    const csvRows = rows.map((r) => [
      r.student_id ?? "",
      r.apaar_id ?? "",
      r.name,
      r.dob ?? "",
      (r as Record<string, unknown>).gender as string ?? "",
      r.category ?? "",
      r.programme_code ?? "",
      r.intake_type ?? "",
      r.contact ?? "",
      (r as Record<string, unknown>).apaar_verify_status as string ?? "pending",
      (r as Record<string, unknown>).current_status as string ?? "active",
      r.created_at?.slice(0, 10) ?? "",
    ].map((v) => `"${String(v).replace(/"/g, '""')}"`).join(","));

    return {
      csv: [headers.join(","), ...csvRows].join("\n"),
      filename: `edutrace-export-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  });
