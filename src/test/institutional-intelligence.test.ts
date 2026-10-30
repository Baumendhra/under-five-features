import { describe, it, expect } from "vitest";
import {
  aggregateInstitutionalIntelligence,
  deriveOperationalPriorities,
  sanitizeForAIPrompt,
  type RawStudentInput,
  type RawProgrammeInput,
  type RawCorrectionInput,
} from "../lib/institutional-intelligence";

const MOCK_INSTITUTION_A = "11111111-1111-1111-1111-111111111111";
const MOCK_INSTITUTION_B = "22222222-2222-2222-2222-222222222222";

describe("Institutional Intelligence Aggregator", () => {
  const sampleStudents: RawStudentInput[] = [
    {
      id: "std-1",
      student_id: "CS2024-001",
      apaar_id: "123456789012", // Checksum valid APAAR
      name: "Aarav Sharma",
      dob: "2002-05-14",
      programme_code: "CSE",
      category: "General",
      intake_type: "Regular",
      contact: "9876543210",
      gender: "Male",
      admission_year: 2024,
      institution_id: MOCK_INSTITUTION_A,
      apaar_verify_status: "verified",
      consent_recorded: true,
    },
    {
      id: "std-2",
      student_id: "CS2024-002",
      apaar_id: "987654321098",
      name: "Diya Patel",
      dob: "2003-08-20",
      programme_code: "CSE",
      category: "OBC",
      intake_type: "Regular",
      contact: "8765432109",
      gender: "Female",
      admission_year: 2024,
      institution_id: MOCK_INSTITUTION_A,
      apaar_verify_status: "processing",
      consent_recorded: true,
    },
    {
      id: "std-3",
      student_id: "ME2024-001",
      apaar_id: "111122223333", // Bad checksum
      name: "Rohan Verma",
      dob: null, // missing DOB
      programme_code: "MECH",
      category: "SC",
      intake_type: "Supernumerary_EWS",
      contact: "invalid-phone",
      gender: "Male",
      admission_year: 2024,
      institution_id: MOCK_INSTITUTION_A,
      apaar_verify_status: "failed",
      consent_recorded: false,
    },
    {
      id: "std-4-colliding",
      student_id: "CS2024-001", // Identifier collision with std-1!
      apaar_id: "123456789012", // APAAR collision with std-1!
      name: "Vikram Malhotra",
      dob: "2001-11-03",
      programme_code: "CSE",
      category: "General",
      intake_type: "Regular",
      contact: "7654321098",
      gender: "Male",
      admission_year: 2024,
      institution_id: MOCK_INSTITUTION_A,
      apaar_verify_status: "manual_review",
      consent_recorded: true,
    },
  ];

  const sampleProgrammes: RawProgrammeInput[] = [
    {
      id: "prog-1",
      code: "CSE",
      name: "Computer Science and Engineering",
      approved_intake: 60,
      institution_id: MOCK_INSTITUTION_A,
    },
    {
      id: "prog-2",
      code: "MECH",
      name: "Mechanical Engineering",
      approved_intake: 30,
      institution_id: MOCK_INSTITUTION_A,
    },
  ];

  const sampleCorrections: RawCorrectionInput[] = [
    {
      id: "corr-1",
      student_id: "std-3",
      field_name: "dob",
      status: "pending",
      created_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(), // 72h old -> SLA overdue!
      updated_at: new Date(Date.now() - 72 * 60 * 60 * 1000).toISOString(),
    },
    {
      id: "corr-2",
      student_id: "std-3",
      field_name: "contact",
      status: "approved",
      created_at: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      updated_at: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
    },
  ];

  it("aggregates student registry health metrics accurately", () => {
    const metrics = aggregateInstitutionalIntelligence({
      institutionId: MOCK_INSTITUTION_A,
      institutionName: "Apex Institute of Technology",
      students: sampleStudents,
      programmes: sampleProgrammes,
      corrections: sampleCorrections,
    });

    expect(metrics.institutionId).toBe(MOCK_INSTITUTION_A);
    expect(metrics.registryHealth.totalStudents).toBe(4);
    expect(metrics.registryHealth.averageQualityScore).toBeGreaterThan(0);
    expect(metrics.registryHealth.attentionNeededCount).toBeGreaterThanOrEqual(1);
    expect(metrics.registryHealth.qualityBands).toHaveProperty("excellent");
    expect(metrics.registryHealth.qualityBands).toHaveProperty("critical");
  });

  it("isolates data strictly by institution", () => {
    const studentInstB: RawStudentInput = {
      id: "std-b-1",
      student_id: "INST-B-001",
      apaar_id: "123456789012",
      name: "Kavita Rao",
      dob: "2003-01-01",
      programme_code: "CSE",
      category: "General",
      intake_type: "Regular",
      contact: "9876543210",
      gender: "Female",
      admission_year: 2024,
      institution_id: MOCK_INSTITUTION_B,
      apaar_verify_status: "verified",
    };

    const metricsA = aggregateInstitutionalIntelligence({
      institutionId: MOCK_INSTITUTION_A,
      institutionName: "Institution A",
      students: sampleStudents,
      programmes: sampleProgrammes,
      corrections: sampleCorrections,
    });

    const metricsB = aggregateInstitutionalIntelligence({
      institutionId: MOCK_INSTITUTION_B,
      institutionName: "Institution B",
      students: [studentInstB],
      programmes: [{ code: "CSE", name: "CSE", approved_intake: 40 }],
      corrections: [],
    });

    expect(metricsA.registryHealth.totalStudents).toBe(4);
    expect(metricsB.registryHealth.totalStudents).toBe(1);
    expect(metricsB.institutionId).toBe(MOCK_INSTITUTION_B);
  });

  it("handles missing data gracefully without throwing or NaN", () => {
    const emptyMetrics = aggregateInstitutionalIntelligence({
      institutionId: MOCK_INSTITUTION_A,
      institutionName: "Empty College",
      students: [],
      programmes: [],
      corrections: [],
    });

    expect(emptyMetrics.registryHealth.totalStudents).toBe(0);
    expect(emptyMetrics.registryHealth.averageQualityScore).toBe(100);
    expect(emptyMetrics.corrections.totalRequests).toBe(0);
    expect(emptyMetrics.corrections.averageResolutionHours).toBeNull();
    expect(emptyMetrics.apaar.coveragePercentage).toBe(0);
    expect(emptyMetrics.intake.overallCapacityUtilizationPct).toBe(0);
  });

  it("strictly separates official external verification from local checksum validity and mock results", () => {
    const studentsWithVariousApaar: RawStudentInput[] = [
      {
        id: "s1",
        student_id: "001",
        apaar_id: "123456789010", // valid Verhoeff checksum
        name: "Test 1",
        dob: "2002-01-01",
        programme_code: "CSE",
        category: "Gen",
        intake_type: "Regular",
        contact: "9876543210",
        gender: "M",
        apaar_verify_status: "verified", // Official verified
      },
      {
        id: "s2",
        student_id: "002",
        apaar_id: "123456789010", // valid Verhoeff checksum
        name: "Test 2",
        dob: "2002-01-01",
        programme_code: "CSE",
        category: "Gen",
        intake_type: "Regular",
        contact: "9876543210",
        gender: "M",
        apaar_verify_status: "not_submitted", // local valid, but NOT officially verified
      },
      {
        id: "s3",
        student_id: "003",
        apaar_id: "123456789010", // valid Verhoeff checksum
        name: "Test 3",
        dob: "2002-01-01",
        programme_code: "CSE",
        category: "Gen",
        intake_type: "Regular",
        contact: "9876543210",
        gender: "M",
        apaar_verify_status: "mock_verified", // Simulated mock result
      },
    ];

    const metrics = aggregateInstitutionalIntelligence({
      institutionId: MOCK_INSTITUTION_A,
      institutionName: "Demo Inst",
      students: studentsWithVariousApaar,
      programmes: [],
      corrections: [],
    });

    expect(metrics.apaar.checksumValidCount).toBe(3);
    // Only 1 student is officially verified:
    expect(metrics.apaar.officiallyVerifiedCount).toBe(1);
    expect(metrics.apaar.mockSimulatedCount).toBe(1);
    // Coverage percentage must count ONLY official verification:
    expect(metrics.apaar.coveragePercentage).toBe(33);
  });

  it("calculates correction workflow statistics and SLA breaches", () => {
    const metrics = aggregateInstitutionalIntelligence({
      institutionId: MOCK_INSTITUTION_A,
      institutionName: "Apex Inst",
      students: sampleStudents,
      programmes: sampleProgrammes,
      corrections: sampleCorrections,
    });

    expect(metrics.corrections.totalRequests).toBe(2);
    expect(metrics.corrections.pendingCount).toBe(1);
    expect(metrics.corrections.approvedCount).toBe(1);
    expect(metrics.corrections.slaOverdueCount).toBe(1); // corr-1 is 72h old
    expect(metrics.corrections.averageResolutionHours).toBe(12); // corr-2 took 12 hours
    expect(metrics.corrections.topCorrectedFields.length).toBeGreaterThan(0);
  });

  it("generates deterministic operational risk priorities categorized by severity", () => {
    const metrics = aggregateInstitutionalIntelligence({
      institutionId: MOCK_INSTITUTION_A,
      institutionName: "Apex Inst",
      students: sampleStudents,
      programmes: sampleProgrammes,
      corrections: sampleCorrections,
    });

    const prios = metrics.operationalPriorities;
    expect(prios.length).toBeGreaterThan(0);

    // Identifier collision must trigger CRITICAL priority
    const critCollisions = prios.find((p) => p.id === "op-crit-ident-collision");
    expect(critCollisions).toBeDefined();
    expect(critCollisions?.category).toBe("CRITICAL");
    expect(critCollisions?.responsibleRole).toBe("institution_admin");
    expect(critCollisions?.routeLink).toBe("/duplicates");

    // Overdue correction must trigger HIGH priority
    const highSla = prios.find((p) => p.id === "op-high-sla-corrections");
    expect(highSla).toBeDefined();
    expect(highSla?.category).toBe("HIGH");
    expect(highSla?.responsibleRole).toBe("officer");
    expect(highSla?.routeLink).toBe("/corrections");
  });

  it("strictly scrubs PII during AI prompt sanitization", () => {
    const metrics = aggregateInstitutionalIntelligence({
      institutionId: MOCK_INSTITUTION_A,
      institutionName: "Apex Institute of Technology",
      students: sampleStudents,
      programmes: sampleProgrammes,
      corrections: sampleCorrections,
    });

    const sanitized = sanitizeForAIPrompt(metrics);
    const jsonString = JSON.stringify(sanitized);

    // Must NOT contain personal identifiable information
    expect(jsonString).not.toContain("Aarav Sharma");
    expect(jsonString).not.toContain("Diya Patel");
    expect(jsonString).not.toContain("Rohan Verma");
    expect(jsonString).not.toContain("Vikram Malhotra");
    expect(jsonString).not.toContain("9876543210");
    expect(jsonString).not.toContain("2002-05-14");
    expect(jsonString).not.toContain("CS2024-001");

    // Must contain aggregate stats
    expect(sanitized.summaryStatistics.totalStudents).toBe(4);
    expect(sanitized.institutionName).toBe("Apex Institute of Technology");
    expect(sanitized.programmeSummaries.length).toBe(2);
  });
});
