import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  requireStaff,
  requireImportPermission,
  applyStudentScope,
} from "@/lib/rbac";

// Re-export for convenience
export { getDashboardStats, dashboardStatsQueryOptions } from "@/lib/edutrace.functions";

export type StudentRecord = {
  id: string;
  user_id?: string;
  student_id: string | null;
  apaar_id: string | null;
  name: string;
  dob: string | null;
  programme_code: string | null;
  category: string | null;
  intake_type: string | null;
  contact: string | null;
  created_at: string;
  institution_id?: string | null;
  gender?: string | null;
  admission_year?: number | null;
  current_status?: string | null;
  apaar_verify_status?: string | null;
  apaar_verified_at?: string | null;
};

export type NewStudentRow = {
  studentId: string | null;
  apaarId: string | null;
  name: string;
  dob: string | null;
  programmeCode: string | null;
  category: string | null;
  intakeType: string | null;
  contact: string | null;
};

// ── List students (role-scoped) ───────────────────────────────────────────

export const listStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    let query = context.supabase
      .from("students")
      .select(
        "id, user_id, student_id, apaar_id, name, dob, programme_code, category, intake_type, contact, created_at, institution_id, gender, admission_year, current_status, apaar_verify_status, apaar_verified_at",
      )
      .order("created_at", { ascending: false });

    // Apply data-scope filter based on role
    query = applyStudentScope(
      query as any,
      context.role,
      context.userId,
      context.institutionId,
    ) as any;

    const { data, error } = await query;
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as StudentRecord[];
  });

export const studentsQueryOptions = queryOptions({
  queryKey: ["students"],
  queryFn: () => listStudents(),
});

// ── Get single student (student can only get own record) ─────────────────

export const getStudentById = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator((input: { studentId: string }) => input)
  .handler(async ({ data, context }) => {
    let query = context.supabase
      .from("students")
      .select("*")
      .eq("id", data.studentId);

    // Students can only see their own record
    if (context.role === "student") {
      query = (query as any).eq("user_id", context.userId);
    } else if (context.role !== "aicte_admin" && context.institutionId) {
      query = (query as any).eq("institution_id", context.institutionId);
    }

    const { data: record, error } = await query.maybeSingle();
    if (error) throw new Error(error.message);
    if (!record) throw new Error("Forbidden: student record not found or not accessible.");
    return record as StudentRecord;
  });

// ── Insert students (staff only) ─────────────────────────────────────────

export const insertStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: NewStudentRow[] }) => input)
  .handler(async ({ data, context }) => {
    requireImportPermission(context.role);

    const rows = data.rows.slice(0, 5000).map((row) => ({
      user_id: context.userId,
      institution_id: context.institutionId,  // ← always stamped server-side
      student_id: row.studentId,
      apaar_id: row.apaarId,
      name: row.name,
      dob: row.dob,
      programme_code: row.programmeCode,
      category: row.category,
      intake_type: row.intakeType,
      contact: row.contact,
    }));

    const { data: inserted, error } = await context.supabase
      .from("students")
      .insert(rows)
      .select("id");
    if (error) throw new Error(error.message);

    // Audit the import
    await context.supabase.from("audit_logs").insert({
      user_id: context.userId,
      action: "upload",
      entity_type: "student_batch",
      entity_id: null,
      details: {
        count: inserted?.length ?? 0,
        institution_id: context.institutionId,
        role: context.role,
      },
    });

    return { inserted: inserted?.length ?? 0 };
  });
