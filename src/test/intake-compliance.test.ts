import { describe, expect, it } from "vitest";
import { checkIntakeCompliance } from "@/lib/intake-compliance";
import type { ProgrammeConfig, EnrollmentRecord } from "@/lib/intake-compliance";

const PROGRAMME: ProgrammeConfig = {
  courseCode: "CSE-BTECH",
  courseName: "B.Tech CSE",
  intakeApproved: 60,
  intakeNri: 5,
  intakeSupernumerary: 3,
};

function enrollN(n: number, type = "regular", code = "CSE-BTECH"): EnrollmentRecord[] {
  return Array.from({ length: n }, () => ({ programmeCode: code, admissionType: type }));
}

describe("checkIntakeCompliance — normal scenarios", () => {
  it("returns compliant when within all limits", () => {
    const summary = checkIntakeCompliance(
      [...enrollN(60), ...enrollN(5, "nri"), ...enrollN(3, "oci")],
      [PROGRAMME],
    )[0]!;
    expect(summary.complianceStatus).toBe("compliant");
    expect(summary.regularOverflow).toBe(0);
    expect(summary.nriOverflow).toBe(0);
    expect(summary.supernumeraryOverflow).toBe(0);
  });

  it("flags regular overflow", () => {
    const summary = checkIntakeCompliance(enrollN(65), [PROGRAMME])[0]!;
    expect(summary.complianceStatus).toBe("over_limit");
    expect(summary.regularOverflow).toBe(5);
    expect(summary.flags).toContain("Regular seats over by 5");
  });

  it("flags NRI overflow", () => {
    const summary = checkIntakeCompliance(enrollN(7, "nri"), [PROGRAMME])[0]!;
    expect(summary.nriOverflow).toBe(2);
    expect(summary.complianceStatus).toBe("warning");
  });

  it("flags when total supernumerary (NRI+OCI) exceeds pool", () => {
    const summary = checkIntakeCompliance(
      [...enrollN(7, "nri"), ...enrollN(5, "oci")],
      [PROGRAMME],
    )[0]!;
    // Pool = 5 NRI + 3 supernumerary = 8; total supernumerary = 12 → overflow = 4
    expect(summary.supernumeraryOverflow).toBe(4);
    expect(summary.complianceStatus).toBe("over_limit");
  });

  it("warns when enrollment below 60% of approved intake", () => {
    const summary = checkIntakeCompliance(enrollN(30), [PROGRAMME])[0]!;
    expect(summary.flags).toEqual(
      expect.arrayContaining(["Enrollment below 60% of approved intake"]),
    );
  });
});

describe("checkIntakeCompliance — multiple programmes", () => {
  it("handles multiple programmes independently", () => {
    const programmes: ProgrammeConfig[] = [
      { courseCode: "CSE", courseName: "CSE", intakeApproved: 60, intakeNri: 5, intakeSupernumerary: 3 },
      { courseCode: "EEE", courseName: "EEE", intakeApproved: 30, intakeNri: 3, intakeSupernumerary: 2 },
    ];
    const enrollments = [...enrollN(65, "regular", "CSE"), ...enrollN(28, "regular", "EEE")];
    const summaries = checkIntakeCompliance(enrollments, programmes);
    const cse = summaries.find((s) => s.programmeCode === "CSE")!;
    const eee = summaries.find((s) => s.programmeCode === "EEE")!;
    expect(cse.regularOverflow).toBe(5);
    expect(eee.regularOverflow).toBe(0);
    expect(eee.complianceStatus).not.toBe("over_limit");
  });

  it("returns empty summary for programme with no enrollments", () => {
    const summary = checkIntakeCompliance([], [PROGRAMME])[0]!;
    expect(summary.totalEnrolled).toBe(0);
    expect(summary.flags).toContain("No enrollments yet");
  });
});

describe("checkIntakeCompliance — admission types", () => {
  it("counts management seats against regular quota", () => {
    const summary = checkIntakeCompliance(
      [...enrollN(58), ...enrollN(5, "management")],
      [PROGRAMME],
    )[0]!;
    // 58 regular + 5 management = 63 vs approved 60 → overflow 3
    expect(summary.regularOverflow).toBe(3);
  });

  it("counts lateral seats against regular quota", () => {
    const summary = checkIntakeCompliance(
      [...enrollN(55), ...enrollN(10, "lateral")],
      [PROGRAMME],
    )[0]!;
    expect(summary.regularOverflow).toBe(5);
  });
});
