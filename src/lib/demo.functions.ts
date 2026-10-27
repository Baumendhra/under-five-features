// Demo data and server functions – no real DB calls
import { createServerFn } from "@tanstack/react-start";
import type { StudentRecord, NewStudentRow } from "@/lib/students.functions";

// ---------------------------------------------------------------------
// Persistent demo data – loads from localStorage (if available) or falls back
// to the static default array. All mutating demo APIs update the in‑memory
// array and then write back to localStorage, so the sandbox state survives
// page reloads.
// ---------------------------------------------------------------------
let DEMO_STUDENTS: StudentRecord[] = (() => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("demoStudents");
      if (stored) return JSON.parse(stored) as StudentRecord[];
    } catch {}
  }
  // Default static demo data
  return [
    {
      id: "demo-1",
      user_id: "demo-user",
      student_id: "STU001",
      apaar_id: "123456789012",
      name: "Anita Sharma",
      dob: "2005-04-12",
      programme_code: "BSC01",
      category: "General",
      intake_type: "Regular",
      contact: "9876543210",
      created_at: new Date().toISOString(),
      gender: "female",
      admission_year: 2024,
      current_status: "active",
      institution_id: "demo-inst",
      apaar_verify_status: "verified",
      apaar_verified_at: new Date().toISOString(),
      consent_recorded: true,
    },
    {
      id: "demo-2",
      user_id: "demo-user",
      student_id: "STU002",
      apaar_id: "",
      name: "Ravi Kumar",
      dob: "2004-11-03",
      programme_code: "BSC02",
      category: "OBC",
      intake_type: "Regular",
      contact: "9123456780",
      created_at: new Date().toISOString(),
      gender: "male",
      admission_year: 2024,
      current_status: "active",
      institution_id: "demo-inst",
      apaar_verify_status: "missing",
      apaar_verified_at: null,
      consent_recorded: false,
    },
    {
      id: "demo-3",
      user_id: "demo-user",
      student_id: "STU003",
      apaar_id: "111111111111",
      name: "Sita Devi",
      dob: "2005-07-21",
      programme_code: "BSC03",
      category: "SC",
      intake_type: "NRI",
      contact: "9988776655",
      created_at: new Date().toISOString(),
      gender: "female",
      admission_year: 2024,
      current_status: "active",
      institution_id: "demo-inst",
      apaar_verify_status: "invalid",
      apaar_verified_at: null,
      consent_recorded: true,
    },
  ];
})();

function persistDemoStudents() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("demoStudents", JSON.stringify(DEMO_STUDENTS));
    } catch {}
  }
}

/** Returns the demo student list – no DB involved. */
export const getDemoStudents = createServerFn({ method: "GET" })
  .handler(async () => {
    // simulate async latency
    await new Promise((r) => setTimeout(r, 200));
    return DEMO_STUDENTS;
  });

/** Export demo students as CSV – mirrors the real export but uses demo data. */
export const exportDemoCsv = createServerFn({ method: "GET" })
  .handler(async () => {
    const rows = DEMO_STUDENTS;
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
    const maskApaar = (raw: string | null) => {
      if (!raw) return "";
      const cleaned = raw.replace(/[\\s-]/g, "");
      if (cleaned.length < 6) return cleaned;
      return cleaned.slice(0, 4) + "••••" + cleaned.slice(-4);
    };
    const csvRows = rows.map((r) =>
      [
        r.student_id ?? "",
        maskApaar(r.apaar_id),
        r.name,
        r.dob ?? "",
        // @ts-ignore – extra fields may be undefined in the type
        (r as any).gender ?? "",
        r.category ?? "",
        r.programme_code ?? "",
        r.intake_type ?? "",
        r.contact ?? "",
        (r as any).apaar_verify_status ?? "pending",
        r.current_status ?? "active",
        r.created_at?.slice(0, 10) ?? "",
      ]
        .map((v) => `"${String(v).replace(/"/g, "\"\"")}"`)
        .join(","),
    );
    return {
      csv: [headers.join(","), ...csvRows].join("\n"),
      filename: `edutrace-demo-${new Date().toISOString().slice(0, 10)}.csv`,
    };
  });

/** Insert demo students – used by the demo import page. */
export const insertDemoStudents = createServerFn({ method: "POST" })
  .handler(async ({ data }) => {
    const rows = (data.rows as NewStudentRow[]).map((row) => ({
      id: `demo-${Date.now()}-${Math.random().toString(36).substr(2, 5)}`,
      user_id: "demo-user",
      student_id: row.studentId ?? null,
      apaar_id: row.apaarId ?? null,
      name: row.name,
      dob: row.dob ?? null,
      programme_code: row.programmeCode ?? null,
      category: row.category ?? null,
      intake_type: row.intakeType ?? null,
      contact: row.contact ?? null,
      created_at: new Date().toISOString(),
      // minimal extra fields for demo
      gender: null,
      admission_year: null,
      current_status: "active",
      institution_id: "demo-inst",
      apaar_verify_status: "pending",
      apaar_verified_at: null,
      consent_recorded: false,
    }));
    DEMO_STUDENTS = [...DEMO_STUDENTS, ...rows];
    persistDemoStudents();
    return { inserted: rows.length };
  });
