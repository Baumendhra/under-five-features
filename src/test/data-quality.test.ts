import { describe, expect, it } from "vitest";
import {
  evaluateStudentRecord,
  aggregateInstitutionQuality,
  evaluateImportBatch,
  maskApaar,
  maskContact,
  classifyQualityBand,
  validateVerhoeff,
  type StudentQualityInput,
} from "@/lib/data-quality";

describe("Intelligent Student Data Quality Engine", () => {
  // Helper for generating a base valid student
  // "236665564211" and "123456789010" are valid 12-digit numbers with valid Verhoeff checksum
  const createValidStudent = (
    overrides: Partial<StudentQualityInput> = {},
  ): StudentQualityInput => ({
    studentId: "STU-2024-001",
    name: "Aarav Sharma",
    dob: "2002-05-15",
    apaarId: "236665564211",
    apaarVerifyStatus: "verified",
    programmeCode: "BTECH-CSE",
    category: "General",
    intakeType: "Regular",
    contact: "9876543210",
    gender: "Male",
    admissionYear: 2024,
    ...overrides,
  });

  // 1. Fully valid student record
  it("evaluates a fully valid student record with score 100 and band Excellent", () => {
    // If Verhoeff passes and all fields are valid & verified
    const student = createValidStudent();
    const report = evaluateStudentRecord(student);

    expect(report.band).toBe("excellent");
    expect(report.overallScore).toBeGreaterThanOrEqual(90);
    expect(report.criticalCount).toBe(0);
    expect(report.highCount).toBe(0);
    expect(report.completenessScore).toBe(100);
    expect(report.verificationScore).toBe(100);
    expect(report.priorityLevel).toBe("none");
  });

  // 2. Missing required fields (Name, DOB)
  it("detects missing required fields (Name and DOB) and assigns critical/high priority", () => {
    const report = evaluateStudentRecord({
      studentId: "STU-002",
      name: "",
      dob: null,
      programmeCode: "BTECH-CSE",
    });

    expect(report.criticalCount).toBeGreaterThanOrEqual(1);
    expect(report.issues.some((i) => i.id === "name_missing")).toBe(true);
    expect(report.issues.some((i) => i.id === "dob_missing")).toBe(true);
    expect(report.priorityLevel).toBe("critical");
    expect(report.overallScore).toBeLessThan(70);
  });

  // 3. Invalid date formats and implausible ages
  it("flags invalid date of birth formats and out-of-range ages", () => {
    const reportInvalid = evaluateStudentRecord(createValidStudent({ dob: "not-a-valid-date" }));
    expect(reportInvalid.issues.some((i) => i.id === "dob_invalid_format")).toBe(true);

    const reportAncient = evaluateStudentRecord(createValidStudent({ dob: "1850-01-01" }));
    expect(reportAncient.issues.some((i) => i.id === "dob_implausible_age")).toBe(true);
  });

  // 4. Invalid contact information
  it("flags invalid contact numbers that are not 10-digit mobile or valid emails", () => {
    const report = evaluateStudentRecord(createValidStudent({ contact: "12345" }));

    const contactIssue = report.issues.find((i) => i.id === "contact_invalid_format");
    expect(contactIssue).toBeDefined();
    expect(contactIssue?.severity).toBe("high");
    expect(contactIssue?.maskedValue).toBe("12345");
  });

  // 5. Missing APAAR ID
  it("flags missing APAAR identifier with high severity and actionable advice", () => {
    const report = evaluateStudentRecord(createValidStudent({ apaarId: null }));

    const apaarIssue = report.issues.find((i) => i.id === "apaar_missing");
    expect(apaarIssue).toBeDefined();
    expect(apaarIssue?.severity).toBe("high");
    expect(apaarIssue?.suggestedAction).toContain("APAAR");
  });

  // 6. Incorrect APAAR format
  it("flags invalid APAAR format when identifier is not exactly 12 digits", () => {
    const report10Digits = evaluateStudentRecord(createValidStudent({ apaarId: "1234567890" }));
    expect(report10Digits.issues.some((i) => i.id === "apaar_invalid_format")).toBe(true);

    const reportAlpha = evaluateStudentRecord(createValidStudent({ apaarId: "1234ABCD9012" }));
    expect(reportAlpha.issues.some((i) => i.id === "apaar_invalid_format")).toBe(true);
  });

  // 7. Valid checksum but unverified APAAR status
  it("distinguishes format validity from external gateway verification status", () => {
    // 12 digits, but status is not verified
    const report = evaluateStudentRecord(
      createValidStudent({
        apaarId: "236665564211",
        apaarVerifyStatus: null, // pending
      }),
    );

    expect(report.verificationScore).toBe(50); // Valid format awaiting gateway
    expect(report.issues.some((i) => i.id === "apaar_unverified")).toBe(true);
  });

  // 8. Optional fields legitimately absent
  it("does not severely penalize optional fields like gender or admission year when absent", () => {
    const report = evaluateStudentRecord(
      createValidStudent({
        gender: null,
        admissionYear: null,
      }),
    );

    expect(report.band).toBe("excellent");
    expect(report.overallScore).toBeGreaterThanOrEqual(90);
    expect(report.criticalCount).toBe(0);
  });

  // 9. Score calculation, clamping, and quality band thresholds
  it("clamps overall scores between 0 and 100 and classifies bands correctly", () => {
    expect(classifyQualityBand(95)).toBe("excellent");
    expect(classifyQualityBand(90)).toBe("excellent");
    expect(classifyQualityBand(89)).toBe("good");
    expect(classifyQualityBand(75)).toBe("good");
    expect(classifyQualityBand(74)).toBe("needs_improvement");
    expect(classifyQualityBand(50)).toBe("needs_improvement");
    expect(classifyQualityBand(49)).toBe("critical");
    expect(classifyQualityBand(0)).toBe("critical");

    // Even if huge deductions occur, score is never negative
    const catastrophicReport = evaluateStudentRecord({
      name: "",
      dob: "invalid",
      apaarId: "123",
      contact: "bad",
      programmeCode: "",
      duplicateFlag: true,
    });
    expect(catastrophicReport.overallScore).toBeGreaterThanOrEqual(0);
    expect(catastrophicReport.overallScore).toBeLessThan(40);
    expect(catastrophicReport.band).toBe("critical");
  });

  // 10. Multiple simultaneous issues
  it("aggregates multiple issues with cumulative deductions and field-level detail", () => {
    const report = evaluateStudentRecord({
      name: "R123", // Digits in name
      dob: "2005-02-02",
      apaarId: "12345", // Malformed APAAR
      contact: "invalid-phone",
      programmeCode: null,
    });

    expect(report.issues.length).toBeGreaterThanOrEqual(4);
    expect(report.issues.every((i) => i.explanation.length > 0)).toBe(true);
    expect(report.issues.every((i) => i.suggestedAction.length > 0)).toBe(true);
  });

  // 11. Sensitive data masking
  it("masks APAAR numbers and contact phone numbers for privacy protection", () => {
    expect(maskApaar("123456789012")).toBe("1234••••9012");
    expect(maskApaar("1234-5678-9012")).toBe("1234••••9012");
    expect(maskApaar(null)).toBe("—");
    expect(maskApaar("123")).toBe("123");

    expect(maskContact("9876543210")).toBe("987••••210");
    expect(maskContact(null)).toBe("—");
    expect(maskContact("abc")).toBe("abc");
  });

  // 12. Institution-level aggregation
  it("aggregates student reports into institutional quality metrics", () => {
    const rep1 = evaluateStudentRecord(createValidStudent());
    const rep2 = evaluateStudentRecord(createValidStudent({ apaarId: null }));
    const rep3 = evaluateStudentRecord({ name: "", dob: null });

    const summary = aggregateInstitutionQuality([rep1, rep2, rep3]);

    expect(summary.totalRecords).toBe(3);
    expect(summary.averageScore).toBeGreaterThan(0);
    expect(summary.averageScore).toBeLessThanOrEqual(100);
    expect(
      summary.qualityBands.excellent +
        summary.qualityBands.good +
        summary.qualityBands.needsImprovement +
        summary.qualityBands.critical,
    ).toBe(3);
    expect(summary.frequentIssues.length).toBeGreaterThan(0);
  });

  // 13. Correction prioritization
  it("assigns priority levels according to defect severity", () => {
    const criticalRep = evaluateStudentRecord({ name: "", dob: "2002-01-01" });
    expect(criticalRep.priorityLevel).toBe("critical");

    const highRep = evaluateStudentRecord(createValidStudent({ apaarId: null }));
    expect(highRep.priorityLevel).toBe("high");

    const routineRep = evaluateStudentRecord(
      createValidStudent({
        apaarId: "236665564211",
        apaarVerifyStatus: null, // Unverified gateway
      }),
    );
    expect(routineRep.priorityLevel).toBe("routine");

    const cleanRep = evaluateStudentRecord(createValidStudent());
    expect(cleanRep.priorityLevel).toBe("none");
  });

  // 14. Import batch quality report calculations
  it("evaluates an import batch with row-level reports and distributions", () => {
    const batch = [
      createValidStudent({ studentId: "ROW-1" }),
      createValidStudent({ studentId: "ROW-2", apaarId: null }),
      createValidStudent({ studentId: "ROW-3", name: "" }),
    ];

    const duplicateIndices = new Set([2]);
    const report = evaluateImportBatch(batch, duplicateIndices);

    expect(report.totalRecords).toBe(3);
    expect(report.duplicateCandidateCount).toBe(1);
    expect(report.rowReports.length).toBe(3);
    expect(report.rowReports[2]?.issues.some((i) => i.id === "duplicate_conflict")).toBe(true);
    expect(report.apaarStatusBreakdown.missing).toBeGreaterThanOrEqual(1);
  });

  // 15. Verhoeff algorithm verification
  it("correctly evaluates Verhoeff checksums", () => {
    // Known valid Verhoeff numbers
    expect(validateVerhoeff("236665564211")).toBe(true);
    expect(validateVerhoeff("123456789010")).toBe(true);
    expect(validateVerhoeff("12345")).toBe(false);
    expect(validateVerhoeff("notanumber")).toBe(false);
  });
});
