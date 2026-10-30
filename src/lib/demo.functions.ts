// Demo data and mock server functions – no real DB calls
import { createServerFn } from "@tanstack/react-start";
import type { StudentRecord, NewStudentRow } from "@/lib/students.functions";
import { evaluateStudentRecord, type StudentQualityEvaluation } from "@/lib/data-quality";
import { validateLocalApaar } from "@/lib/apaar-orchestrator";
import {
  aggregateInstitutionalIntelligence,
  type InstitutionalIntelligenceMetrics,
  type RawStudentInput,
  type RawProgrammeInput,
  type RawCorrectionInput,
} from "@/lib/institutional-intelligence";
import {
  RuleBasedInstitutionalAIProvider,
  type InstitutionalAIResponse,
  type InstitutionalReportType,
} from "@/lib/institutional-ai";
import { sanitizeForAIPrompt } from "@/lib/institutional-intelligence";

// ---------------------------------------------------------------------
// 1. Models & Types
// ---------------------------------------------------------------------

export interface DemoProgramme {
  id: string;
  course_code: string;
  course_name: string;
  intake_approved: number;
  regular_admitted: number;
  lateral_admitted: number;
  supernumerary_admitted: number;
  historical_trends?: Array<{
    year: number;
    admitted: number;
    approved: number;
  }>;
}

export interface DemoCorrectionRequest {
  id: string;
  student_id: string;
  student_name: string;
  roll_number: string;
  programme_code: string;
  field_name: "name" | "dob" | "apaar_id" | "contact" | "category" | "programme_code";
  current_value: string;
  requested_value: string;
  reason: string;
  status: "pending" | "in_review" | "more_info_required" | "approved" | "rejected" | "applied";
  created_at: string;
  updated_at: string;
  sla_deadline: string;
  supporting_doc?: string;
  reviewer_notes?: string;
  suggested_fix?: string;
}

// ---------------------------------------------------------------------
// 2. Initial Mock Data
// ---------------------------------------------------------------------

// Known valid Verhoeff APAARs: "236665564211", "123456789010", "567890123457", "987654321099"
// Known invalid Verhoeff: "123456789012" (12 digits, but checksum fails)

const INITIAL_DEMO_STUDENTS: StudentRecord[] = [
  {
    id: "demo-1",
    user_id: "demo-user",
    student_id: "STU001",
    apaar_id: "236665564211", // Valid Verhoeff, Verified
    name: "Anita Sharma",
    dob: "2005-04-12",
    programme_code: "CSE01",
    category: "General",
    intake_type: "Regular",
    contact: "9876543210",
    created_at: new Date(Date.now() - 30 * 86400000).toISOString(),
    gender: "female",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "verified",
    apaar_verified_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    consent_recorded: true,
  },
  {
    id: "demo-2",
    user_id: "demo-user",
    student_id: "STU002",
    apaar_id: "", // Missing APAAR
    name: "Ravi Kumar",
    dob: "2004-11-03",
    programme_code: "CSE01",
    category: "OBC",
    intake_type: "Regular",
    contact: "9123456780",
    created_at: new Date(Date.now() - 25 * 86400000).toISOString(),
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
    apaar_id: "123456789012", // Invalid Verhoeff Checksum
    name: "Sita Devi",
    dob: "2005-07-21",
    programme_code: "AIDS01",
    category: "SC",
    intake_type: "Regular",
    contact: "9988776655",
    created_at: new Date(Date.now() - 20 * 86400000).toISOString(),
    gender: "female",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "invalid",
    apaar_verified_at: null,
    consent_recorded: true,
  },
  // Candidate Duplicate Pair: demo-4 & demo-5 (near identical name, same DOB & contact)
  {
    id: "demo-4",
    user_id: "demo-user",
    student_id: "STU004",
    apaar_id: "123456789010", // Valid Verhoeff
    name: "Rohan Verma",
    dob: "2004-05-15",
    programme_code: "AIDS01",
    category: "General",
    intake_type: "Regular",
    contact: "9876543299",
    created_at: new Date(Date.now() - 15 * 86400000).toISOString(),
    gender: "male",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "verified",
    apaar_verified_at: new Date(Date.now() - 14 * 86400000).toISOString(),
    consent_recorded: true,
  },
  {
    id: "demo-5",
    user_id: "demo-user",
    student_id: "STU005",
    apaar_id: "123456789010", // Colliding identical APAAR with STU004
    name: "Rohan Varma", // Slight spelling variant
    dob: "2004-05-15",
    programme_code: "AIDS01",
    category: "General",
    intake_type: "Regular",
    contact: "9876543299",
    created_at: new Date(Date.now() - 12 * 86400000).toISOString(),
    gender: "male",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "pending",
    apaar_verified_at: null,
    consent_recorded: true,
  },
  // Record 6: Good quality, pending external gateway check
  {
    id: "demo-6",
    user_id: "demo-user",
    student_id: "STU006",
    apaar_id: "567890123457", // Valid Verhoeff
    name: "Pooja Hegde",
    dob: "2005-09-18",
    programme_code: "MECH01",
    category: "General",
    intake_type: "Regular",
    contact: "9811223344",
    created_at: new Date(Date.now() - 10 * 86400000).toISOString(),
    gender: "female",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "pending",
    apaar_verified_at: null,
    consent_recorded: true,
  },
  // Record 7: Mechanical Engineering
  {
    id: "demo-7",
    user_id: "demo-user",
    student_id: "STU007",
    apaar_id: "987654321099",
    name: "Karan Malhotra",
    dob: "2004-03-22",
    programme_code: "MECH01",
    category: "OBC",
    intake_type: "Regular",
    contact: "9765432109",
    created_at: new Date(Date.now() - 9 * 86400000).toISOString(),
    gender: "male",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "verified",
    apaar_verified_at: new Date(Date.now() - 8 * 86400000).toISOString(),
    consent_recorded: true,
  },
  // Record 8: Electronics & Communication
  {
    id: "demo-8",
    user_id: "demo-user",
    student_id: "STU008",
    apaar_id: "236665564211",
    name: "Aarav Gupta",
    dob: "2005-01-30",
    programme_code: "ECE01",
    category: "General",
    intake_type: "Regular",
    contact: "9123412345",
    created_at: new Date(Date.now() - 7 * 86400000).toISOString(),
    gender: "male",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "verified",
    apaar_verified_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    consent_recorded: true,
  },
  // Collision pair: demo-9 and demo-10 have the identical roll number STU009 but different students
  {
    id: "demo-9",
    user_id: "demo-user",
    student_id: "STU009", // Colliding roll number
    name: "Amit Patel",
    dob: "2003-08-20",
    apaar_id: "123456789010",
    programme_code: "CSE01",
    category: "General",
    intake_type: "Lateral",
    contact: "9456781230",
    created_at: new Date(Date.now() - 6 * 86400000).toISOString(),
    gender: "male",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "verified",
    apaar_verified_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    consent_recorded: true,
  },
  {
    id: "demo-10",
    user_id: "demo-user",
    student_id: "STU009", // Colliding roll number with Amit Patel
    name: "Sunita Rao",
    dob: "2004-12-11",
    apaar_id: "567890123457",
    programme_code: "AIDS01",
    category: "OBC",
    intake_type: "Regular",
    contact: "9345678901",
    created_at: new Date(Date.now() - 5 * 86400000).toISOString(),
    gender: "female",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "pending",
    apaar_verified_at: null,
    consent_recorded: true,
  },
  // Record 11: Civil Engineering
  {
    id: "demo-11",
    user_id: "demo-user",
    student_id: "STU011",
    apaar_id: "236665564211",
    name: "Deepak Choudhary",
    dob: "2004-06-14",
    programme_code: "CIV01",
    category: "ST",
    intake_type: "Regular",
    contact: "9876001122",
    created_at: new Date(Date.now() - 4 * 86400000).toISOString(),
    gender: "male",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "verified",
    apaar_verified_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    consent_recorded: true,
  },
  // Record 12: Missing Contact & Poor Quality
  {
    id: "demo-12",
    user_id: "demo-user",
    student_id: "STU012",
    apaar_id: "12345", // Format Invalid
    name: "Vikram Sen",
    dob: "", // Missing DOB
    programme_code: "CIV01",
    category: "General",
    intake_type: "Supernumerary",
    contact: "", // Missing Contact
    created_at: new Date(Date.now() - 3 * 86400000).toISOString(),
    gender: "male",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "invalid",
    apaar_verified_at: null,
    consent_recorded: false,
  },
  // Record 13: ECE student
  {
    id: "demo-13",
    user_id: "demo-user",
    student_id: "STU013",
    apaar_id: "123456789010",
    name: "Ananya Deshmukh",
    dob: "2005-02-17",
    programme_code: "ECE01",
    category: "General",
    intake_type: "Regular",
    contact: "9822334455",
    created_at: new Date(Date.now() - 2 * 86400000).toISOString(),
    gender: "female",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "verified",
    apaar_verified_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    consent_recorded: true,
  },
  // Record 14: AIDS student
  {
    id: "demo-14",
    user_id: "demo-user",
    student_id: "STU014",
    apaar_id: "567890123457",
    name: "Manish Tiwari",
    dob: "2004-10-05",
    programme_code: "AIDS01",
    category: "OBC",
    intake_type: "Regular",
    contact: "9711224466",
    created_at: new Date(Date.now() - 1 * 86400000).toISOString(),
    gender: "male",
    admission_year: 2024,
    current_status: "active",
    institution_id: "demo-inst",
    apaar_verify_status: "pending",
    apaar_verified_at: null,
    consent_recorded: true,
  },
];

const INITIAL_DEMO_PROGRAMMES: DemoProgramme[] = [
  {
    id: "prog-1",
    course_code: "CSE01",
    course_name: "Computer Science & Engineering",
    intake_approved: 60,
    regular_admitted: 58,
    lateral_admitted: 3,
    supernumerary_admitted: 2,
    historical_trends: [
      { year: 2021, approved: 60, admitted: 55 },
      { year: 2022, approved: 60, admitted: 57 },
      { year: 2023, approved: 60, admitted: 59 },
      { year: 2024, approved: 60, admitted: 58 },
    ],
  },
  {
    id: "prog-2",
    course_code: "AIDS01",
    course_name: "Artificial Intelligence & Data Science",
    intake_approved: 60,
    regular_admitted: 63, // Overcapacity (105%)
    lateral_admitted: 4,
    supernumerary_admitted: 3,
    historical_trends: [
      { year: 2022, approved: 60, admitted: 50 },
      { year: 2023, approved: 60, admitted: 59 },
      { year: 2024, approved: 60, admitted: 63 },
    ],
  },
  {
    id: "prog-3",
    course_code: "MECH01",
    course_name: "Mechanical Engineering",
    intake_approved: 60,
    regular_admitted: 24, // Under-enrolment (40%)
    lateral_admitted: 1,
    supernumerary_admitted: 0,
    historical_trends: [
      { year: 2021, approved: 60, admitted: 48 },
      { year: 2022, approved: 60, admitted: 39 },
      { year: 2023, approved: 60, admitted: 30 },
      { year: 2024, approved: 60, admitted: 24 },
    ],
  },
  {
    id: "prog-4",
    course_code: "ECE01",
    course_name: "Electronics & Communication Engineering",
    intake_approved: 60,
    regular_admitted: 52, // Healthy (86.7%)
    lateral_admitted: 2,
    supernumerary_admitted: 1,
    historical_trends: [
      { year: 2021, approved: 60, admitted: 49 },
      { year: 2022, approved: 60, admitted: 51 },
      { year: 2023, approved: 60, admitted: 53 },
      { year: 2024, approved: 60, admitted: 52 },
    ],
  },
  {
    id: "prog-5",
    course_code: "CIV01",
    course_name: "Civil Engineering",
    intake_approved: 30,
    regular_admitted: 11, // Under-enrolment (36.7%)
    lateral_admitted: 0,
    supernumerary_admitted: 0,
    historical_trends: [
      { year: 2021, approved: 30, admitted: 22 },
      { year: 2022, approved: 30, admitted: 18 },
      { year: 2023, approved: 30, admitted: 14 },
      { year: 2024, approved: 30, admitted: 11 },
    ],
  },
];

const INITIAL_DEMO_CORRECTIONS: DemoCorrectionRequest[] = [
  {
    id: "cor-1",
    student_id: "demo-3",
    student_name: "Sita Devi",
    roll_number: "STU003",
    programme_code: "AIDS01",
    field_name: "apaar_id",
    current_value: "123456789012",
    requested_value: "123456789010",
    reason: "Aadhaar / APAAR card scan indicates last two digits entered incorrectly.",
    status: "pending",
    created_at: new Date(Date.now() - 14 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 14 * 3600000).toISOString(),
    sla_deadline: new Date(Date.now() + 34 * 3600000).toISOString(), // 34h remaining (within 48h SLA)
    supporting_doc: "apaar_card_verified_copy.pdf",
    suggested_fix: "123456789010 (Verhoeff Checksum Valid)",
  },
  {
    id: "cor-2",
    student_id: "demo-2",
    student_name: "Ravi Kumar",
    roll_number: "STU002",
    programme_code: "CSE01",
    field_name: "contact",
    current_value: "9123456780",
    requested_value: "9876501234",
    reason: "Student phone number lost; requested update to parent emergency contact.",
    status: "pending",
    created_at: new Date(Date.now() - 62 * 3600000).toISOString(), // 62h ago -> SLA Breached!
    updated_at: new Date(Date.now() - 62 * 3600000).toISOString(),
    sla_deadline: new Date(Date.now() - 14 * 3600000).toISOString(), // 14h overdue
    supporting_doc: "parent_affidavit.pdf",
    suggested_fix: "9876501234 (Valid 10-digit Indian mobile)",
  },
  {
    id: "cor-3",
    student_id: "demo-1",
    student_name: "Anita Sharma",
    roll_number: "STU001",
    programme_code: "CSE01",
    field_name: "dob",
    current_value: "2005-04-12",
    requested_value: "2005-04-21",
    reason: "Typo in day of birth as per Class X CBSE certificate.",
    status: "in_review",
    created_at: new Date(Date.now() - 20 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 2 * 3600000).toISOString(),
    sla_deadline: new Date(Date.now() + 28 * 3600000).toISOString(),
    supporting_doc: "cbse_marksheet_10th.pdf",
    reviewer_notes: "Scrutinizing secondary school certificate seal with admission cell.",
    suggested_fix: "2005-04-21",
  },
  {
    id: "cor-4",
    student_id: "demo-4",
    student_name: "Rohan Verma",
    roll_number: "STU004",
    programme_code: "AIDS01",
    field_name: "name",
    current_value: "Rohan Verma",
    requested_value: "Rohan K. Verma",
    reason: "Add middle initial as registered in DigiLocker record.",
    status: "more_info_required",
    created_at: new Date(Date.now() - 36 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 8 * 3600000).toISOString(),
    sla_deadline: new Date(Date.now() + 12 * 3600000).toISOString(),
    supporting_doc: "digilocker_statement.pdf",
    reviewer_notes:
      "Aadhaar name shows 'Rohan Verma'. Please upload gazette notification for middle name expansion.",
  },
  {
    id: "cor-5",
    student_id: "demo-6",
    student_name: "Pooja Hegde",
    roll_number: "STU006",
    programme_code: "MECH01",
    field_name: "category",
    current_value: "General",
    requested_value: "OBC",
    reason: "Caste certificate issued by Tahsildar submitted during counseling.",
    status: "approved",
    created_at: new Date(Date.now() - 90 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 40 * 3600000).toISOString(),
    sla_deadline: new Date(Date.now() - 42 * 3600000).toISOString(),
    supporting_doc: "obc_non_creamy_layer_cert.pdf",
    reviewer_notes: "Approved after verifying QR code on state revenue portal.",
  },
  {
    id: "cor-6",
    student_id: "demo-7",
    student_name: "Karan Malhotra",
    roll_number: "STU007",
    programme_code: "MECH01",
    field_name: "programme_code",
    current_value: "MECH01",
    requested_value: "CSE01",
    reason: "Requested internal branch transfer after Round 1.",
    status: "rejected",
    created_at: new Date(Date.now() - 80 * 3600000).toISOString(),
    updated_at: new Date(Date.now() - 30 * 3600000).toISOString(),
    sla_deadline: new Date(Date.now() - 32 * 3600000).toISOString(),
    reviewer_notes:
      "Rejected: Branch transfers must go through state centralized allotment window, not individual correction portal.",
  },
];

// ---------------------------------------------------------------------
// 3. Persistent LocalStorage Store
// ---------------------------------------------------------------------

let DEMO_STUDENTS: StudentRecord[] = (() => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("demoStudents_v2");
      if (stored) return JSON.parse(stored) as StudentRecord[];
    } catch {
      /* ignore */
    }
  }
  return INITIAL_DEMO_STUDENTS;
})();

let DEMO_PROGRAMMES: DemoProgramme[] = (() => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("demoProgrammes_v2");
      if (stored) return JSON.parse(stored) as DemoProgramme[];
    } catch {
      /* ignore */
    }
  }
  return INITIAL_DEMO_PROGRAMMES;
})();

let DEMO_CORRECTIONS: DemoCorrectionRequest[] = (() => {
  if (typeof window !== "undefined") {
    try {
      const stored = localStorage.getItem("demoCorrections_v2");
      if (stored) return JSON.parse(stored) as DemoCorrectionRequest[];
    } catch {
      /* ignore */
    }
  }
  return INITIAL_DEMO_CORRECTIONS;
})();

function persistState() {
  if (typeof window !== "undefined") {
    try {
      localStorage.setItem("demoStudents_v2", JSON.stringify(DEMO_STUDENTS));
      localStorage.setItem("demoProgrammes_v2", JSON.stringify(DEMO_PROGRAMMES));
      localStorage.setItem("demoCorrections_v2", JSON.stringify(DEMO_CORRECTIONS));
    } catch {
      /* ignore */
    }
  }
}

// ---------------------------------------------------------------------
// 4. Server Functions & APIs
// ---------------------------------------------------------------------

/** Returns the demo student list */
export const getDemoStudents = createServerFn({ method: "GET" }).handler(async () => {
  await new Promise((r) => setTimeout(r, 100));
  return DEMO_STUDENTS;
});

/** Batch verify APAAR for all or filtered demo students */
export const batchVerifyDemoStudents = createServerFn({ method: "POST" })
  .validator((data?: { studentIds?: string[] }) => data ?? {})
  .handler(async ({ data }) => {
    await new Promise((r) => setTimeout(r, 800));
    let processed = 0;
    let verified = 0;
    let failed = 0;

    const idsToVerify = data?.studentIds
      ? new Set(data.studentIds)
      : new Set(DEMO_STUDENTS.filter((s) => s.apaar_verify_status !== "verified").map((s) => s.id));

    DEMO_STUDENTS = DEMO_STUDENTS.map((s) => {
      if (!idsToVerify.has(s.id)) return s;
      processed++;
      const local = validateLocalApaar(s.apaar_id || "");

      if (local.isValid) {
        verified++;
        return {
          ...s,
          apaar_verify_status: "verified",
          apaar_verified_at: new Date().toISOString(),
          consent_recorded: true,
        };
      } else {
        failed++;
        return {
          ...s,
          apaar_verify_status: local.formatStatus === "FORMAT_INVALID" ? "invalid" : "not_found",
          apaar_verified_at: null,
        };
      }
    });

    persistState();
    return { processed, verified, failed };
  });

/** Single student APAAR verification */
export const singleVerifyDemoStudent = createServerFn({ method: "POST" })
  .validator((data: { studentId: string }) => data)
  .handler(async ({ data }) => {
    await new Promise((r) => setTimeout(r, 400));
    const student = DEMO_STUDENTS.find((s) => s.id === data.studentId);
    if (!student) throw new Error("Student not found");

    const local = validateLocalApaar(student.apaar_id || "");
    const isVerified = local.isValid;

    DEMO_STUDENTS = DEMO_STUDENTS.map((s) => {
      if (s.id !== data.studentId) return s;
      return {
        ...s,
        apaar_verify_status: isVerified ? "verified" : "invalid",
        apaar_verified_at: isVerified ? new Date().toISOString() : null,
        consent_recorded: isVerified ? true : s.consent_recorded,
      };
    });

    persistState();
    return {
      success: true,
      status: isVerified ? "verified" : "invalid",
      local,
    };
  });

/** Insert demo students – used by the demo import page */
export const insertDemoStudents = createServerFn({ method: "POST" })
  .validator((data: { rows: NewStudentRow[] }) => data)
  .handler(async ({ data }) => {
    const rows = (data.rows as NewStudentRow[]).map((row) => ({
      id: `demo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
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
      gender: null,
      admission_year: new Date().getFullYear(),
      current_status: "active",
      institution_id: "demo-inst",
      apaar_verify_status: "pending",
      apaar_verified_at: null,
      consent_recorded: false,
    }));
    DEMO_STUDENTS = [...DEMO_STUDENTS, ...rows];
    persistState();
    return { inserted: rows.length };
  });

/** Get Demo Programmes & Intake */
export const getDemoProgrammes = createServerFn({ method: "GET" }).handler(async () => {
  await new Promise((r) => setTimeout(r, 100));
  return DEMO_PROGRAMMES;
});

/** Create Demo Programme */
export const createDemoProgramme = createServerFn({ method: "POST" })
  .validator((data: { course_code: string; course_name: string; intake_approved: number }) => data)
  .handler(async ({ data }) => {
    const newProg: DemoProgramme = {
      id: `prog-${Date.now()}`,
      course_code: data.course_code.toUpperCase(),
      course_name: data.course_name,
      intake_approved: Number(data.intake_approved),
      regular_admitted: 0,
      lateral_admitted: 0,
      supernumerary_admitted: 0,
      historical_trends: [
        {
          year: new Date().getFullYear(),
          approved: Number(data.intake_approved),
          admitted: 0,
        },
      ],
    };
    DEMO_PROGRAMMES = [...DEMO_PROGRAMMES, newProg];
    persistState();
    return newProg;
  });

/** Get Demo Corrections */
export const getDemoCorrections = createServerFn({ method: "GET" }).handler(async () => {
  await new Promise((r) => setTimeout(r, 100));
  return DEMO_CORRECTIONS;
});

/** Review / Update Demo Correction */
export const reviewDemoCorrection = createServerFn({ method: "POST" })
  .validator(
    (data: {
      correctionId: string;
      status: "pending" | "in_review" | "more_info_required" | "approved" | "rejected";
      notes?: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    await new Promise((r) => setTimeout(r, 200));
    let affectedStudentId: string | null = null;
    let fieldToUpdate: string | null = null;
    let valueToApply: string | null = null;

    DEMO_CORRECTIONS = DEMO_CORRECTIONS.map((c) => {
      if (c.id !== data.correctionId) return c;
      if (data.status === "approved") {
        affectedStudentId = c.student_id;
        fieldToUpdate = c.field_name;
        valueToApply = c.requested_value;
      }
      return {
        ...c,
        status: data.status,
        reviewer_notes: data.notes ?? c.reviewer_notes,
        updated_at: new Date().toISOString(),
      };
    });

    // If approved, apply update directly to DEMO_STUDENTS!
    if (affectedStudentId && fieldToUpdate && valueToApply !== null) {
      DEMO_STUDENTS = DEMO_STUDENTS.map((s) => {
        if (s.id !== affectedStudentId) return s;
        return {
          ...s,
          [fieldToUpdate!]: valueToApply,
        };
      });
    }

    persistState();
    return { success: true };
  });

/** Submit a new Demo Correction request */
export const submitDemoCorrection = createServerFn({ method: "POST" })
  .validator(
    (data: {
      student_id: string;
      student_name: string;
      roll_number: string;
      programme_code: string;
      field_name: "name" | "dob" | "apaar_id" | "contact" | "category" | "programme_code";
      current_value: string;
      requested_value: string;
      reason: string;
    }) => data,
  )
  .handler(async ({ data }) => {
    const newCor: DemoCorrectionRequest = {
      id: `cor-${Date.now()}`,
      student_id: data.student_id,
      student_name: data.student_name,
      roll_number: data.roll_number,
      programme_code: data.programme_code,
      field_name: data.field_name,
      current_value: data.current_value,
      requested_value: data.requested_value,
      reason: data.reason,
      status: "pending",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      sla_deadline: new Date(Date.now() + 48 * 3600000).toISOString(),
    };
    DEMO_CORRECTIONS = [newCor, ...DEMO_CORRECTIONS];
    persistState();
    return newCor;
  });

/**
 * Aggregates full Institutional Intelligence across all 5 modules for Demo
 */
export const getDemoInstitutionalIntelligence = createServerFn({ method: "GET" }).handler(
  async (): Promise<InstitutionalIntelligenceMetrics> => {
    await new Promise((r) => setTimeout(r, 150));

    // Convert demo students to RawStudentInput
    const rawStudents: RawStudentInput[] = DEMO_STUDENTS.map((s) => ({
      id: s.id,
      student_id: s.student_id,
      apaar_id: s.apaar_id,
      name: s.name,
      dob: s.dob,
      programme_code: s.programme_code,
      category: s.category,
      intake_type: s.intake_type,
      contact: s.contact,
      gender: s.gender,
      admission_year: s.admission_year,
      institution_id: "demo-inst",
      apaar_verify_status: s.apaar_verify_status,
      consent_recorded: s.consent_recorded,
      created_at: s.created_at,
    }));

    // Convert demo programmes to RawProgrammeInput
    const rawProgrammes: RawProgrammeInput[] = DEMO_PROGRAMMES.map((p) => ({
      id: p.id,
      code: p.course_code,
      name: p.course_name,
      approved_intake: p.intake_approved,
      institution_id: "demo-inst",
    }));

    // Convert demo corrections to RawCorrectionInput
    const rawCorrections: RawCorrectionInput[] = DEMO_CORRECTIONS.map((c) => ({
      id: c.id,
      student_id: c.student_id,
      field_name: c.field_name,
      status: c.status,
      created_at: c.created_at,
      updated_at: c.updated_at,
      proposed_value: c.requested_value,
    }));

    // Build historical intake map
    const historicalIntakeMap: Record<string, any[]> = {};
    for (const p of DEMO_PROGRAMMES) {
      if (p.historical_trends) {
        historicalIntakeMap[p.course_code] = p.historical_trends.map((t) => ({
          year: t.year,
          regularCount: t.admitted,
          lateralCount: 0,
          supernumeraryCount: 0,
          totalCount: t.admitted,
          approvedIntake: t.approved,
          utilizationRate: Math.round((t.admitted / t.approved) * 1000) / 10,
        }));
      }
    }

    return aggregateInstitutionalIntelligence({
      institutionId: "demo-inst",
      institutionName: "National Institute of Technology (Demo Sandbox)",
      students: rawStudents,
      programmes: rawProgrammes,
      corrections: rawCorrections,
      historicalIntake: historicalIntakeMap,
    });
  },
);

/** Ask Demo AI Assistant (Offline Rule-Based Decision Support) */
export const askDemoAssistant = createServerFn({ method: "POST" })
  .validator((data: { question: string }) => data)
  .handler(async ({ data }): Promise<InstitutionalAIResponse> => {
    await new Promise((r) => setTimeout(r, 400));
    const raw = await getDemoInstitutionalIntelligence();
    const sanitized = sanitizeForAIPrompt(raw);
    const provider = new RuleBasedInstitutionalAIProvider();
    return provider.answerQuestion(sanitized, data.question);
  });

/** Generate Demo Institutional Report */
export const generateDemoReport = createServerFn({ method: "POST" })
  .validator((data: { reportType: InstitutionalReportType; period?: string }) => data)
  .handler(async ({ data }): Promise<InstitutionalAIResponse> => {
    await new Promise((r) => setTimeout(r, 600));
    const raw = await getDemoInstitutionalIntelligence();
    const sanitized = sanitizeForAIPrompt(raw);
    const provider = new RuleBasedInstitutionalAIProvider();
    return provider.generateReport(
      sanitized,
      data.reportType,
      data.period ?? "Academic Year 2024-25",
    );
  });

/** Reset Demo Sandbox data back to initial seeds */
export const resetDemoSandboxData = createServerFn({ method: "POST" }).handler(async () => {
  DEMO_STUDENTS = INITIAL_DEMO_STUDENTS;
  DEMO_PROGRAMMES = INITIAL_DEMO_PROGRAMMES;
  DEMO_CORRECTIONS = INITIAL_DEMO_CORRECTIONS;
  persistState();
  return { success: true };
});

/** Export demo students as CSV */
export const exportDemoCsv = createServerFn({ method: "GET" }).handler(async () => {
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
    "DataQualityScore",
    "CurrentStatus",
    "ImportedAt",
  ];
  const maskApaar = (raw: string | null) => {
    if (!raw) return "";
    const cleaned = raw.replace(/[\s-]/g, "");
    if (cleaned.length < 6) return cleaned;
    return cleaned.slice(0, 4) + "••••" + cleaned.slice(-4);
  };
  const csvRows = rows.map((r) => {
    const q = evaluateStudentRecord({
      id: r.id,
      name: r.name,
      student_id: r.student_id,
      apaar_id: r.apaar_id,
      dob: r.dob,
      contact: r.contact,
      category: r.category,
      gender: r.gender,
      programme_code: r.programme_code,
      intake_type: r.intake_type,
      apaar_verify_status: r.apaar_verify_status,
      consent_recorded: r.consent_recorded,
    });
    return [
      r.student_id ?? "",
      maskApaar(r.apaar_id),
      r.name,
      r.dob ?? "",
      r.gender ?? "",
      r.category ?? "",
      r.programme_code ?? "",
      r.intake_type ?? "",
      r.contact ?? "",
      r.apaar_verify_status ?? "pending",
      q.overallScore,
      r.current_status ?? "active",
      r.created_at?.slice(0, 10) ?? "",
    ]
      .map((v) => `"${String(v).replace(/"/g, '""')}"`)
      .join(",");
  });
  return {
    csv: [headers.join(","), ...csvRows].join("\n"),
    filename: `edutrace-demo-${new Date().toISOString().slice(0, 10)}.csv`,
  };
});
