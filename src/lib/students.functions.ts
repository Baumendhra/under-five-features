import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type StudentRecord = {
  id: string;
  student_id: string | null;
  apaar_id: string | null;
  name: string;
  dob: string | null;
  programme_code: string | null;
  category: string | null;
  intake_type: string | null;
  contact: string | null;
  created_at: string;
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

export const listStudents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase
      .from("students")
      .select(
        "id, student_id, apaar_id, name, dob, programme_code, category, intake_type, contact, created_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as StudentRecord[];
  });

export const studentsQueryOptions = queryOptions({
  queryKey: ["students"],
  queryFn: () => listStudents(),
});

export const insertStudents = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { rows: NewStudentRow[] }) => input)
  .handler(async ({ data, context }) => {
    const rows = data.rows.slice(0, 5000).map((row) => ({
      user_id: context.userId,
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
    return { inserted: inserted?.length ?? 0 };
  });
