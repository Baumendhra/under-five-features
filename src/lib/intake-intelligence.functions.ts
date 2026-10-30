import { createServerFn } from "@tanstack/react-start";
import { queryOptions } from "@tanstack/react-query";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  aggregateInstitutionIntakeIntelligence,
  generateProgrammeIntakeForecast,
  type InstitutionIntakeIntelligenceSummary,
  type ProgrammeForecastResult,
  type HistoricalIntakePoint,
} from "@/lib/intake-forecast";

// ── Helpers ───────────────────────────────────────────────────────────────

function isSupernumeraryType(type: string | null | undefined): boolean {
  if (!type) return false;
  const t = type.toLowerCase().trim();
  return (
    t === "supernumerary" ||
    t === "tfws" ||
    t === "nri" ||
    t === "oci" ||
    t === "j_and_k" ||
    t === "km" ||
    t === "pmsss"
  );
}

function isLateralType(type: string | null | undefined): boolean {
  if (!type) return false;
  const t = type.toLowerCase().trim();
  return t === "lateral" || t === "lateral_entry" || t === "lateral entry";
}

// ── Server Function: Get Intake Intelligence Summary ──────────────────────

export const getIntakeIntelligenceSummary = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input?: { institutionId?: string | undefined; targetYear?: number | undefined }) =>
      input ?? {},
  )
  .handler(async ({ data, context }): Promise<InstitutionIntakeIntelligenceSummary> => {
    const supabase = context.supabase;

    // Resolve target institution ID with role-based security
    let institutionId = data.institutionId;
    if (context.role !== "aicte_admin") {
      institutionId = context.institutionId ?? undefined;
    }

    // 1. Fetch approved programmes
    let progQuery = supabase
      .from("programmes")
      .select(
        "id, institution_id, course_code, course_name, year, intake_approved, intake_nri, intake_supernumerary",
      );

    if (institutionId) {
      progQuery = progQuery.eq("institution_id", institutionId);
    }

    const { data: programmesData, error: progError } = await progQuery;
    if (progError) throw new Error(progError.message);

    const programmes = programmesData ?? [];

    // 2. Fetch student enrollment records
    let studQuery = supabase
      .from("students")
      .select("id, institution_id, programme_code, intake_type, admission_year, current_status");

    if (institutionId) {
      studQuery = studQuery.eq("institution_id", institutionId);
    }

    const { data: studentsData, error: studError } = await studQuery;
    if (studError) throw new Error(studError.message);

    const students = studentsData ?? [];

    // 3. Fetch confirmed duplicate student IDs to exclude from counts
    const { data: dupData } = await supabase
      .from("duplicate_cases")
      .select("student_ids, resolution, status")
      .in("resolution", ["confirm_duplicate", "confirmed_duplicate"]);

    const confirmedDuplicateIds = new Set<string>();
    if (dupData) {
      for (const d of dupData) {
        if (Array.isArray(d.student_ids)) {
          // If duplicates were confirmed, keep the first one and exclude secondary IDs
          d.student_ids.slice(1).forEach((id) => confirmedDuplicateIds.add(id));
        }
      }
    }

    // Group valid students by programme_code and admission_year
    // Map: courseCode -> Map(year -> { regular, lateral, supernumerary, total })
    const progYearCounts = new Map<
      string,
      Map<number, { regular: number; lateral: number; supernumerary: number; total: number }>
    >();

    for (const s of students) {
      if (confirmedDuplicateIds.has(s.id)) continue;
      if (!s.programme_code) continue;

      const code = s.programme_code.trim().toUpperCase();
      const yr =
        Number(s.admission_year) || new Date(s.current_status ?? Date.now()).getFullYear() || 2024;

      if (!progYearCounts.has(code)) {
        progYearCounts.set(code, new Map());
      }
      const yearMap = progYearCounts.get(code)!;
      if (!yearMap.has(yr)) {
        yearMap.set(yr, { regular: 0, lateral: 0, supernumerary: 0, total: 0 });
      }

      const counts = yearMap.get(yr)!;
      counts.total += 1;

      if (isSupernumeraryType(s.intake_type)) {
        counts.supernumerary += 1;
      } else if (isLateralType(s.intake_type)) {
        counts.lateral += 1;
      } else {
        counts.regular += 1;
      }
    }

    // Determine target year
    const targetAcademicYear = data.targetYear ?? new Date().getFullYear() + 1;

    // Build programme input structures for forecasting engine
    const programmePayloads = programmes.map((p) => {
      const code = p.course_code.trim().toUpperCase();
      const yearMap = progYearCounts.get(code);

      const history: HistoricalIntakePoint[] = [];

      if (yearMap) {
        for (const [yr, c] of yearMap.entries()) {
          const approved = p.intake_approved || 60;
          history.push({
            academicYear: yr,
            regularCount: c.regular,
            lateralCount: c.lateral,
            supernumeraryCount: c.supernumerary,
            totalCount: c.total,
            approvedIntake: approved,
            utilizationRate: approved > 0 ? Number(((c.regular / approved) * 100).toFixed(1)) : 0,
          });
        }
      }

      // If no student records existed for this programme yet, fallback to empty history
      return {
        courseCode: code,
        courseName: p.course_name,
        approvedIntake: p.intake_approved || 60,
        history,
      };
    });

    const summary = aggregateInstitutionIntakeIntelligence(programmePayloads, targetAcademicYear);

    return {
      ...summary,
      institutionId: institutionId ?? null,
    };
  });

export const intakeIntelligenceQueryOptions = (
  institutionId?: string | undefined,
  targetYear?: number | undefined,
) =>
  queryOptions({
    queryKey: ["intake-intelligence", institutionId ?? "default", targetYear ?? "default"],
    queryFn: () => getIntakeIntelligenceSummary({ data: { institutionId, targetYear } }),
  });

// ── Server Function: Single Programme Forecast Simulation ─────────────────

export const getProgrammeForecast = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator(
    (input: {
      courseCode: string;
      approvedIntake: number;
      history: HistoricalIntakePoint[];
      targetYear?: number | undefined;
      userAdjustmentPercent?: number | undefined;
    }) => input,
  )
  .handler(async ({ data }): Promise<ProgrammeForecastResult> => {
    return generateProgrammeIntakeForecast(
      data.courseCode,
      data.courseCode,
      data.approvedIntake,
      data.history,
      data.targetYear,
      data.userAdjustmentPercent,
    );
  });
