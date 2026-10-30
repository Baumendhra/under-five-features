// Intake compliance checker
// Compares enrolled counts against approved intake per programme and admission type.

export type IntakeSummary = {
  programmeCode: string;
  programmeName?: string | undefined;
  intakeApproved: number;
  intakeNri: number;
  intakeSupernumerary: number;
  enrolledRegular: number;
  enrolledNri: number;
  enrolledOci: number;
  enrolledManagement: number;
  enrolledLateral: number;
  totalEnrolled: number;
  regularOverflow: number; // > 0 means over-subscribed
  nriOverflow: number;
  supernumeraryOverflow: number;
  complianceStatus: "compliant" | "warning" | "over_limit";
  flags: string[];
};

export type EnrollmentRecord = {
  programmeCode: string;
  admissionType: string; // 'regular'|'nri'|'oci'|'management'|'lateral'
};

export type ProgrammeConfig = {
  courseCode: string;
  courseName?: string | undefined;
  intakeApproved: number;
  intakeNri: number;
  intakeSupernumerary: number;
};

interface ProgrammeEnrollmentCounts {
  regular: number;
  nri: number;
  oci: number;
  management: number;
  lateral: number;
  [key: string]: number;
}

/**
 * Compute intake compliance for each programme.
 * NRI and OCI count against the supernumerary pool.
 * Management and lateral seats count against regular (unless configured separately).
 */
export function checkIntakeCompliance(
  enrollments: EnrollmentRecord[],
  programmes: ProgrammeConfig[],
): IntakeSummary[] {
  const programmeMap = new Map<string, ProgrammeConfig>();
  for (const p of programmes) programmeMap.set(p.courseCode, p);

  // Aggregate enrollment counts by programme code and type
  const counts = new Map<string, ProgrammeEnrollmentCounts>();
  for (const e of enrollments) {
    if (!counts.has(e.programmeCode)) {
      counts.set(e.programmeCode, {
        regular: 0,
        nri: 0,
        oci: 0,
        management: 0,
        lateral: 0,
      });
    }
    const bucket = counts.get(e.programmeCode)!;
    const type = e.admissionType.toLowerCase();
    if (type in bucket) {
      bucket[type] = (bucket[type] ?? 0) + 1;
    } else {
      bucket.regular = (bucket.regular ?? 0) + 1;
    }
  }

  const summaries: IntakeSummary[] = [];
  for (const [code, cfg] of programmeMap) {
    const c = counts.get(code) ?? { regular: 0, nri: 0, oci: 0, management: 0, lateral: 0 };
    const enrolledRegular = (c.regular ?? 0) + (c.management ?? 0) + (c.lateral ?? 0);
    const enrolledNri = c.nri ?? 0;
    const enrolledOci = c.oci ?? 0;
    const totalEnrolled = enrolledRegular + enrolledNri + enrolledOci;
    const totalSupernumerary = enrolledNri + enrolledOci;

    const regularOverflow = Math.max(0, enrolledRegular - cfg.intakeApproved);
    const nriOverflow = Math.max(0, enrolledNri - cfg.intakeNri);
    const supernumeraryOverflow = Math.max(
      0,
      totalSupernumerary - (cfg.intakeNri + cfg.intakeSupernumerary),
    );

    const flags: string[] = [];
    if (regularOverflow > 0) flags.push(`Regular seats over by ${regularOverflow}`);
    if (nriOverflow > 0) flags.push(`NRI seats over by ${nriOverflow}`);
    if (supernumeraryOverflow > 0)
      flags.push(`Supernumerary pool exceeded by ${supernumeraryOverflow}`);
    if (totalEnrolled === 0) flags.push("No enrollments yet");
    if (totalEnrolled > 0 && totalEnrolled < cfg.intakeApproved * 0.6) {
      flags.push("Enrollment below 60% of approved intake");
    }

    let complianceStatus: IntakeSummary["complianceStatus"] = "compliant";
    if (regularOverflow > 0 || supernumeraryOverflow > 0) {
      complianceStatus = "over_limit";
    } else if (nriOverflow > 0 || flags.length > 0) {
      complianceStatus = "warning";
    }

    summaries.push({
      programmeCode: code,
      programmeName: cfg.courseName,
      intakeApproved: cfg.intakeApproved,
      intakeNri: cfg.intakeNri,
      intakeSupernumerary: cfg.intakeSupernumerary,
      enrolledRegular,
      enrolledNri,
      enrolledOci,
      enrolledManagement: c.management ?? 0,
      enrolledLateral: c.lateral ?? 0,
      totalEnrolled,
      regularOverflow,
      nriOverflow,
      supernumeraryOverflow,
      complianceStatus,
      flags,
    });
  }
  return summaries;
}
