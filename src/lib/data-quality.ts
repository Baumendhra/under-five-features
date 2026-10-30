/**
 * Intelligent Student Data Quality Engine for EduTrace (SIH26263).
 *
 * Evaluates student enrolment records, explains data-quality defects,
 * calculates transparent explainable quality scores (0-100), and helps
 * institutions prioritize corrections before regulatory reporting.
 *
 * Note: A valid format or checksum does NOT equate to official external
 * identity verification with the APAAR/ABC registry.
 */

import { apaarStatus, normalizeDob } from "@/lib/student-import";

// ── Types ──────────────────────────────────────────────────────────────────

export type QualityBand = "excellent" | "good" | "needs_improvement" | "critical";

export type IssueSeverity = "critical" | "high" | "medium" | "low";

export type IssueCategory = "identity" | "apaar" | "contact" | "academic" | "integrity";

export type PriorityLevel = "critical" | "high" | "routine" | "none";

export interface QualityIssue {
  id: string;
  field: string;
  currentValue: string | null;
  maskedValue: string | null;
  category: IssueCategory;
  title: string;
  explanation: string;
  severity: IssueSeverity;
  deduction: number;
  suggestedAction: string;
  humanVerificationRequired: boolean;
}

export interface StudentQualityInput {
  id?: string | null | undefined;
  studentId?: string | null | undefined;
  student_id?: string | null | undefined;
  apaarId?: string | null | undefined;
  apaar_id?: string | null | undefined;
  name?: string | null | undefined;
  dob?: string | null | undefined;
  programmeCode?: string | null | undefined;
  programme_code?: string | null | undefined;
  category?: string | null | undefined;
  intakeType?: string | null | undefined;
  intake_type?: string | null | undefined;
  contact?: string | null | undefined;
  gender?: string | null | undefined;
  admissionYear?: number | null | undefined;
  admission_year?: number | null | undefined;
  apaarVerifyStatus?: string | null | undefined;
  apaar_verify_status?: string | null | undefined;
  institutionId?: string | null | undefined;
  institution_id?: string | null | undefined;
  duplicateFlag?: boolean | undefined;
}

export interface StudentQualityReport {
  studentId: string | null;
  recordId?: string | null | undefined;
  name: string;
  overallScore: number; // 0 - 100
  completenessScore: number; // 0 - 100
  validityScore: number; // 0 - 100
  verificationScore: number; // 0 - 100
  band: QualityBand;
  priorityLevel: PriorityLevel;
  priorityScore: number; // 0 - 100 urgency score (higher = more urgent)
  priorityReason: string;
  issues: QualityIssue[];
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  dimensionScores: {
    identity: number; // 0 - 100
    apaar: number; // 0 - 100
    contact: number; // 0 - 100
    academic: number; // 0 - 100
  };
  passedChecks: string[];
}

export interface InstitutionQualitySummary {
  totalRecords: number;
  averageScore: number;
  averageCompleteness: number;
  averageValidity: number;
  qualityBands: {
    excellent: number;
    good: number;
    needsImprovement: number;
    critical: number;
  };
  attentionNeededCount: number;
  apaarBreakdown: {
    verified: number;
    pending: number;
    missing: number;
    invalid: number;
  };
  frequentIssues: {
    field: string;
    title: string;
    category: IssueCategory;
    count: number;
    severity: IssueSeverity;
  }[];
  priorityDistribution: {
    critical: number;
    high: number;
    routine: number;
    none: number;
  };
}

export interface BatchQualityReport {
  totalRecords: number;
  validRecords: number;
  attentionNeededCount: number;
  invalidRecords: number;
  averageScore: number;
  missingFieldDistribution: Record<string, number>;
  invalidFieldDistribution: Record<string, number>;
  duplicateCandidateCount: number;
  apaarStatusBreakdown: {
    verified: number;
    pending: number;
    missing: number;
    invalid: number;
  };
  rowReports: StudentQualityReport[];
}

// ── Verhoeff Checksum Algorithm (Indian National ID / APAAR standard) ───────

const VERHOEFF_D: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];

const VERHOEFF_P: number[][] = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function validateVerhoeff(str: string): boolean {
  if (!/^\d+$/.test(str)) return false;
  let c = 0;
  const digits = str.split("").map(Number).reverse();
  for (let i = 0; i < digits.length; i++) {
    const pRow = VERHOEFF_P[i % 8];
    const dRow = VERHOEFF_D[c];
    if (!pRow || !dRow) return false;
    const pVal = pRow[digits[i]!];
    if (pVal === undefined) return false;
    const dVal = dRow[pVal];
    if (dVal === undefined) return false;
    c = dVal;
  }
  return c === 0;
}

// ── Masking Helpers ────────────────────────────────────────────────────────

export function maskApaar(raw: string | null | undefined): string {
  if (!raw) return "—";
  const cleaned = raw.replace(/[\s-]/g, "");
  if (cleaned.length < 6) return cleaned;
  return cleaned.slice(0, 4) + "••••" + cleaned.slice(-4);
}

export function maskContact(raw: string | null | undefined): string {
  if (!raw) return "—";
  const cleaned = raw.trim();
  if (cleaned.length < 6) return cleaned;
  return cleaned.slice(0, 3) + "••••" + cleaned.slice(-3);
}

// ── Quality Band Classifier ────────────────────────────────────────────────

export function classifyQualityBand(score: number): QualityBand {
  if (score >= 90) return "excellent";
  if (score >= 75) return "good";
  if (score >= 50) return "needs_improvement";
  return "critical";
}

export const QUALITY_BAND_CONFIG: Record<
  QualityBand,
  {
    label: string;
    color: string;
    badgeBg: string;
    badgeText: string;
    border: string;
    description: string;
  }
> = {
  excellent: {
    label: "Excellent",
    color: "#10b981",
    badgeBg: "bg-emerald-100 dark:bg-emerald-950/40",
    badgeText: "text-emerald-800 dark:text-emerald-300",
    border: "border-emerald-300 dark:border-emerald-800",
    description: "Record satisfies complete registry requirements with valid identifiers.",
  },
  good: {
    label: "Good",
    color: "#3b82f6",
    badgeBg: "bg-blue-100 dark:bg-blue-950/40",
    badgeText: "text-blue-800 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-800",
    description: "Core identity is intact; non-critical fields or verification pending.",
  },
  needs_improvement: {
    label: "Needs Improvement",
    color: "#f59e0b",
    badgeBg: "bg-amber-100 dark:bg-amber-950/40",
    badgeText: "text-amber-800 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-800",
    description: "Identifier or contact details missing or unverified.",
  },
  critical: {
    label: "Critical",
    color: "#ef4444",
    badgeBg: "bg-red-100 dark:bg-red-950/40",
    badgeText: "text-red-800 dark:text-red-300",
    border: "border-red-300 dark:border-red-800",
    description: "Missing essential identity (name/DOB), duplicate conflict, or malformed data.",
  },
};

// ── Core Quality Evaluator ─────────────────────────────────────────────────

/**
 * Evaluates an individual student record across 4 quality dimensions:
 * 1. Identity Completeness & Plausibility
 * 2. APAAR Format & Verification Status
 * 3. Contact Reliability
 * 4. Academic Classification
 */
export function evaluateStudentRecord(student: StudentQualityInput): StudentQualityReport {
  const issues: QualityIssue[] = [];
  const passedChecks: string[] = [];

  const rawName = student.name?.trim() ?? "";
  const rawStudentId = (student.studentId ?? student.student_id)?.trim() ?? null;
  const rawApaar = (student.apaarId ?? student.apaar_id)?.trim() ?? null;
  const rawDob = student.dob?.trim() ?? null;
  const rawProgramme = (student.programmeCode ?? student.programme_code)?.trim() ?? null;
  const rawCategory = student.category?.trim() ?? null;
  const rawIntake = (student.intakeType ?? student.intake_type)?.trim() ?? null;
  const rawContact = student.contact?.trim() ?? null;
  const rawGender = student.gender?.trim() ?? null;
  const rawAdmissionYear = student.admissionYear ?? student.admission_year ?? null;
  const apaarVerifyStatus = student.apaarVerifyStatus ?? student.apaar_verify_status ?? null;
  const hasDuplicateFlag = Boolean(student.duplicateFlag);

  // Dimension sub-deductions
  let identityDeduction = 0;
  let apaarDeduction = 0;
  let contactDeduction = 0;
  let academicDeduction = 0;

  // Track completeness points (0 - 100)
  // Expected fields: name(20), dob(20), rollNo(10), apaar(20), contact(10), programme(10), category(5), intake(5)
  let completenessEarned = 0;

  // Track validity points (0 - 100)
  let validityDeduction = 0;

  // ── Dimension 1: Identity ────────────────────────────────────────────────

  // 1. Name Check
  if (!rawName) {
    const d = 35;
    identityDeduction += d;
    validityDeduction += 30;
    issues.push({
      id: "name_missing",
      field: "Name",
      currentValue: null,
      maskedValue: null,
      category: "identity",
      title: "Missing Student Name",
      explanation:
        "Official student name is absent. Records cannot be registered without legal name.",
      severity: "critical",
      deduction: d,
      suggestedAction: "Provide the student's legal name as listed on matriculation certificates.",
      humanVerificationRequired: true,
    });
  } else if (rawName.length < 2) {
    const d = 20;
    identityDeduction += d;
    validityDeduction += 20;
    issues.push({
      id: "name_too_short",
      field: "Name",
      currentValue: rawName,
      maskedValue: rawName,
      category: "identity",
      title: "Name Too Short",
      explanation: "Provided name is fewer than 2 characters.",
      severity: "critical",
      deduction: d,
      suggestedAction: "Enter the full student name rather than initials.",
      humanVerificationRequired: true,
    });
  } else if (/[0-9]/.test(rawName)) {
    const d = 15;
    identityDeduction += d;
    validityDeduction += 15;
    issues.push({
      id: "name_has_digits",
      field: "Name",
      currentValue: rawName,
      maskedValue: rawName,
      category: "identity",
      title: "Name Contains Digits",
      explanation:
        "Student name contains numerical digits, suggesting an import or concatenation glitch.",
      severity: "high",
      deduction: d,
      suggestedAction: "Remove numeric artifacts from the name field.",
      humanVerificationRequired: false,
    });
  } else {
    completenessEarned += 20;
    passedChecks.push("Name format verified");
  }

  // 2. Date of Birth Check
  if (!rawDob) {
    const d = 20;
    identityDeduction += d;
    validityDeduction += 20;
    issues.push({
      id: "dob_missing",
      field: "Date of Birth",
      currentValue: null,
      maskedValue: null,
      category: "identity",
      title: "Missing Date of Birth",
      explanation: "Date of birth is mandatory for demographic matching and verification.",
      severity: "high",
      deduction: d,
      suggestedAction: "Obtain and input birth date in YYYY-MM-DD or DD/MM/YYYY format.",
      humanVerificationRequired: true,
    });
  } else {
    const normalized = normalizeDob(rawDob);
    if (!normalized) {
      const d = 20;
      identityDeduction += d;
      validityDeduction += 20;
      issues.push({
        id: "dob_invalid_format",
        field: "Date of Birth",
        currentValue: rawDob,
        maskedValue: rawDob,
        category: "identity",
        title: "Invalid Date of Birth Format",
        explanation: `The value "${rawDob}" cannot be parsed. Standard accepted formats: YYYY-MM-DD, DD/MM/YYYY.`,
        severity: "high",
        deduction: d,
        suggestedAction: "Reformat the date to YYYY-MM-DD.",
        humanVerificationRequired: false,
      });
    } else {
      // Age plausibility check
      const birthYear = parseInt(normalized.slice(0, 4), 10);
      const currentYear = new Date().getFullYear();
      const approxAge = currentYear - birthYear;

      if (approxAge < 14 || approxAge > 80) {
        const d = 10;
        identityDeduction += d;
        validityDeduction += 10;
        issues.push({
          id: "dob_implausible_age",
          field: "Date of Birth",
          currentValue: normalized,
          maskedValue: normalized,
          category: "identity",
          title: "Implausible Enrolment Age",
          explanation: `Calculated age of ~${approxAge} years is outside standard higher-education ranges (14–80).`,
          severity: "medium",
          deduction: d,
          suggestedAction: "Confirm the birth year against matriculation certificate.",
          humanVerificationRequired: true,
        });
      } else {
        completenessEarned += 20;
        passedChecks.push("Date of birth format and age bounds verified");
      }
    }
  }

  // 3. Roll Number / Student ID
  if (!rawStudentId) {
    const d = 5;
    identityDeduction += d;
    issues.push({
      id: "roll_no_missing",
      field: "Roll Number",
      currentValue: null,
      maskedValue: null,
      category: "identity",
      title: "Missing Institutional Roll Number",
      explanation: "No internal student ID/roll number assigned for this institution.",
      severity: "low",
      deduction: d,
      suggestedAction: "Assign the institution roll or registration number.",
      humanVerificationRequired: false,
    });
  } else {
    completenessEarned += 10;
    passedChecks.push("Institutional student ID present");
  }

  // 4. Gender (Optional dimension check)
  if (rawGender) {
    const normalizedGender = rawGender.toLowerCase();
    if (!["male", "female", "other", "m", "f", "o", "transgender"].includes(normalizedGender)) {
      const d = 5;
      identityDeduction += d;
      validityDeduction += 5;
      issues.push({
        id: "gender_unrecognized",
        field: "Gender",
        currentValue: rawGender,
        maskedValue: rawGender,
        category: "identity",
        title: "Unrecognized Gender Value",
        explanation: `Value "${rawGender}" does not match recognized categories (Male, Female, Other).`,
        severity: "low",
        deduction: d,
        suggestedAction: "Standardize gender to Male, Female, or Other.",
        humanVerificationRequired: false,
      });
    } else {
      passedChecks.push("Gender classification recognized");
    }
  }

  // ── Dimension 2: APAAR Information ────────────────────────────────────────

  const localApaar = apaarStatus(rawApaar);

  if (localApaar === "missing") {
    const d = 25;
    apaarDeduction += d;
    issues.push({
      id: "apaar_missing",
      field: "APAAR ID",
      currentValue: null,
      maskedValue: "—",
      category: "apaar",
      title: "Missing APAAR Identifier",
      explanation: "No 12-digit Automated Permanent Academic Account Registry (APAAR) ID provided.",
      severity: "high",
      deduction: d,
      suggestedAction: "Collect and record the 12-digit APAAR ID from ABC or DigiLocker portal.",
      humanVerificationRequired: true,
    });
  } else if (localApaar === "invalid") {
    const d = 30;
    apaarDeduction += d;
    validityDeduction += 30;
    issues.push({
      id: "apaar_invalid_format",
      field: "APAAR ID",
      currentValue: rawApaar,
      maskedValue: maskApaar(rawApaar),
      category: "apaar",
      title: "Invalid APAAR Format",
      explanation: `Identifier "${maskApaar(rawApaar)}" does not conform to the 12-digit numeric APAAR standard.`,
      severity: "high",
      deduction: d,
      suggestedAction: "Re-enter the exact 12 numeric digits without punctuation or alphabets.",
      humanVerificationRequired: false,
    });
  } else {
    // Exactly 12 digits
    completenessEarned += 20;

    // Check Verhoeff checksum
    const digitsOnly = rawApaar!.replace(/\D/g, "");
    const checksumValid = validateVerhoeff(digitsOnly);

    // Note: Do not treat valid checksum as proof of verification
    if (!checksumValid) {
      // Checksum failed
      const d = 15;
      apaarDeduction += d;
      validityDeduction += 15;
      issues.push({
        id: "apaar_checksum_mismatch",
        field: "APAAR ID",
        currentValue: rawApaar,
        maskedValue: maskApaar(rawApaar),
        category: "apaar",
        title: "APAAR Checksum Warning",
        explanation:
          "12-digit string failed Verhoeff checksum algorithm, indicating a potential typo.",
        severity: "medium",
        deduction: d,
        suggestedAction: "Double-check the digits against the student's APAAR card.",
        humanVerificationRequired: true,
      });
    } else {
      passedChecks.push("APAAR 12-digit format and mathematical checksum verified");
    }

    // Now check server-side APAAR registry verification status
    if (apaarVerifyStatus === "verified") {
      passedChecks.push("APAAR officially verified with registry");
    } else if (apaarVerifyStatus === "not_found") {
      const d = 15;
      apaarDeduction += d;
      issues.push({
        id: "apaar_registry_not_found",
        field: "APAAR ID",
        currentValue: rawApaar,
        maskedValue: maskApaar(rawApaar),
        category: "apaar",
        title: "APAAR Not Found in Registry",
        explanation: "The APAAR ID was queried against the registry but could not be located.",
        severity: "high",
        deduction: d,
        suggestedAction: "Ask the student to verify their ABC ID activation status.",
        humanVerificationRequired: true,
      });
    } else if (apaarVerifyStatus === "failed") {
      const d = 15;
      apaarDeduction += d;
      issues.push({
        id: "apaar_verification_failed",
        field: "APAAR ID",
        currentValue: rawApaar,
        maskedValue: maskApaar(rawApaar),
        category: "apaar",
        title: "APAAR Verification Failed",
        explanation: "Last automated verification attempt encountered an error.",
        severity: "medium",
        deduction: d,
        suggestedAction: "Trigger re-verification from the Students action menu.",
        humanVerificationRequired: false,
      });
    } else {
      // Pending official verification
      const d = 10;
      apaarDeduction += d;
      issues.push({
        id: "apaar_unverified",
        field: "APAAR ID",
        currentValue: rawApaar,
        maskedValue: maskApaar(rawApaar),
        category: "apaar",
        title: "APAAR Pending Registry Verification",
        explanation:
          "Valid format recorded, but official lookup against the gateway has not been performed.",
        severity: "medium",
        deduction: d,
        suggestedAction: "Run single or batch verification to confirm live registry status.",
        humanVerificationRequired: false,
      });
    }
  }

  // ── Dimension 3: Contact Information ──────────────────────────────────────

  if (!rawContact) {
    const d = 10;
    contactDeduction += d;
    issues.push({
      id: "contact_missing",
      field: "Contact",
      currentValue: null,
      maskedValue: "—",
      category: "contact",
      title: "Missing Student Contact",
      explanation: "No mobile number or email recorded for communications.",
      severity: "medium",
      deduction: d,
      suggestedAction: "Collect a valid 10-digit mobile number.",
      humanVerificationRequired: false,
    });
  } else {
    const cleanedDigits = rawContact.replace(/\D/g, "");
    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawContact);
    const is10DigitMobile = /^[6-9]\d{9}$/.test(cleanedDigits);
    const is12DigitWithCode = /^91[6-9]\d{9}$/.test(cleanedDigits);

    if (!isEmail && !is10DigitMobile && !is12DigitWithCode) {
      const d = 15;
      contactDeduction += d;
      validityDeduction += 15;
      issues.push({
        id: "contact_invalid_format",
        field: "Contact",
        currentValue: rawContact,
        maskedValue: maskContact(rawContact),
        category: "contact",
        title: "Invalid Contact Format",
        explanation: `"${maskContact(rawContact)}" is neither a valid 10-digit Indian mobile number nor a valid email address.`,
        severity: "high",
        deduction: d,
        suggestedAction: "Ensure phone number is 10 digits starting with 6, 7, 8, or 9.",
        humanVerificationRequired: false,
      });
    } else {
      completenessEarned += 10;
      passedChecks.push("Contact information syntax verified");
    }
  }

  // ── Dimension 4: Academic Information ─────────────────────────────────────

  if (!rawProgramme) {
    const d = 10;
    academicDeduction += d;
    issues.push({
      id: "programme_missing",
      field: "Programme",
      currentValue: null,
      maskedValue: null,
      category: "academic",
      title: "Missing Programme Code",
      explanation: "No degree programme code mapped for this enrolment.",
      severity: "medium",
      deduction: d,
      suggestedAction: "Select an AICTE-approved course/programme code.",
      humanVerificationRequired: false,
    });
  } else {
    completenessEarned += 10;
    passedChecks.push("Programme mapping present");
  }

  if (!rawCategory) {
    const d = 5;
    academicDeduction += d;
    issues.push({
      id: "category_missing",
      field: "Admission Category",
      currentValue: null,
      maskedValue: null,
      category: "academic",
      title: "Missing Social/Admission Category",
      explanation:
        "Category (General/OBC/SC/ST/EWS) is required for statutory reservation reporting.",
      severity: "low",
      deduction: d,
      suggestedAction: "Record the student's admission category.",
      humanVerificationRequired: false,
    });
  } else {
    completenessEarned += 5;
    passedChecks.push("Admission category present");
  }

  if (!rawIntake) {
    const d = 5;
    academicDeduction += d;
    issues.push({
      id: "intake_type_missing",
      field: "Intake Type",
      currentValue: null,
      maskedValue: null,
      category: "academic",
      title: "Missing Intake Type",
      explanation: "Intake quota type (Regular, Lateral, Supernumerary) not specified.",
      severity: "low",
      deduction: d,
      suggestedAction:
        "Specify whether student was admitted under Regular, Lateral, TFW, or Supernumerary quota.",
      humanVerificationRequired: false,
    });
  } else {
    completenessEarned += 5;
    passedChecks.push("Intake type classified");
  }

  if (rawAdmissionYear) {
    const currentYear = new Date().getFullYear();
    if (rawAdmissionYear < 2000 || rawAdmissionYear > currentYear + 1) {
      const d = 5;
      academicDeduction += d;
      validityDeduction += 5;
      issues.push({
        id: "admission_year_out_of_range",
        field: "Admission Year",
        currentValue: String(rawAdmissionYear),
        maskedValue: String(rawAdmissionYear),
        category: "academic",
        title: "Admission Year Suspicious",
        explanation: `Admission year ${rawAdmissionYear} is outside standard operating window (2000–${currentYear + 1}).`,
        severity: "low",
        deduction: d,
        suggestedAction: "Confirm the admission cohort year.",
        humanVerificationRequired: false,
      });
    }
  }

  // ── Dimension 5: Integrity / Conflict Checks ──────────────────────────────

  if (hasDuplicateFlag) {
    const d = 25;
    identityDeduction += d;
    validityDeduction += 20;
    issues.push({
      id: "duplicate_conflict",
      field: "Registry Integrity",
      currentValue: null,
      maskedValue: null,
      category: "integrity",
      title: "Potential Duplicate Enrolment Conflict",
      explanation: "This student matches another record on APAAR ID or Name + Date of Birth.",
      severity: "critical",
      deduction: d,
      suggestedAction: "Navigate to Duplicates Review to merge or resolve the conflict.",
      humanVerificationRequired: true,
    });
  }

  // ── Final Score Calculations ──────────────────────────────────────────────

  const totalDeductions = issues.reduce((sum, item) => sum + item.deduction, 0);
  const overallScore = Math.max(0, Math.min(100, Math.round(100 - totalDeductions)));

  // Completeness: earned vs maximum total (100)
  const completenessScore = Math.max(0, Math.min(100, completenessEarned));

  // Validity: 100 minus specific format/syntax/logic deductions
  const validityScore = Math.max(0, Math.min(100, Math.round(100 - validityDeduction)));

  // Verification score:
  let verificationScore = 0;
  if (apaarVerifyStatus === "verified") {
    verificationScore = 100;
  } else if (localApaar === "verified") {
    verificationScore = 50; // Valid format awaiting gateway lookup
  } else {
    verificationScore = 0;
  }

  const band = classifyQualityBand(overallScore);

  // Severity counts
  const criticalCount = issues.filter((i) => i.severity === "critical").length;
  const highCount = issues.filter((i) => i.severity === "high").length;
  const mediumCount = issues.filter((i) => i.severity === "medium").length;
  const lowCount = issues.filter((i) => i.severity === "low").length;

  // Prioritization Level
  let priorityLevel: PriorityLevel = "none";
  let priorityReason = "Record meets complete quality benchmarks.";
  let priorityScore = 0;

  if (criticalCount > 0) {
    priorityLevel = "critical";
    priorityScore = 95 + Math.min(5, criticalCount);
    priorityReason = `${criticalCount} critical defect(s) detected (missing name, duplicate collision, or major integrity clash).`;
  } else if (highCount > 0) {
    priorityLevel = "high";
    priorityScore = 75 + Math.min(15, highCount * 5);
    priorityReason = `${highCount} high-priority issue(s) detected (missing/invalid APAAR, missing DOB, or invalid contact).`;
  } else if (mediumCount > 0 || lowCount > 0) {
    priorityLevel = "routine";
    priorityScore = 40 + Math.min(30, mediumCount * 5 + lowCount * 2);
    priorityReason = "Pending gateway verification or non-blocking metadata omissions.";
  }

  const dimIdentity = Math.max(0, Math.min(100, Math.round(100 - identityDeduction * 1.5)));
  const dimApaar = Math.max(0, Math.min(100, Math.round(100 - apaarDeduction * 1.8)));
  const dimContact = Math.max(0, Math.min(100, Math.round(100 - contactDeduction * 3.5)));
  const dimAcademic = Math.max(0, Math.min(100, Math.round(100 - academicDeduction * 4)));

  return {
    studentId: rawStudentId,
    recordId: student.id ?? null,
    name: rawName || "Unnamed Student",
    overallScore,
    completenessScore,
    validityScore,
    verificationScore,
    band,
    priorityLevel,
    priorityScore,
    priorityReason,
    issues,
    criticalCount,
    highCount,
    mediumCount,
    lowCount,
    dimensionScores: {
      identity: dimIdentity,
      apaar: dimApaar,
      contact: dimContact,
      academic: dimAcademic,
    },
    passedChecks,
  };
}

// ── Batch & Institutional Aggregators ──────────────────────────────────────

/**
 * Aggregates quality reports for an institution or student cohort.
 */
export function aggregateInstitutionQuality(
  reports: StudentQualityReport[],
): InstitutionQualitySummary {
  if (reports.length === 0) {
    return {
      totalRecords: 0,
      averageScore: 100,
      averageCompleteness: 100,
      averageValidity: 100,
      qualityBands: { excellent: 0, good: 0, needsImprovement: 0, critical: 0 },
      attentionNeededCount: 0,
      apaarBreakdown: { verified: 0, pending: 0, missing: 0, invalid: 0 },
      frequentIssues: [],
      priorityDistribution: { critical: 0, high: 0, routine: 0, none: 0 },
    };
  }

  let totalScore = 0;
  let totalComp = 0;
  let totalValid = 0;
  let attentionCount = 0;

  const qualityBands = { excellent: 0, good: 0, needsImprovement: 0, critical: 0 };
  const apaarBreakdown = { verified: 0, pending: 0, missing: 0, invalid: 0 };
  const priorityDistribution = { critical: 0, high: 0, routine: 0, none: 0 };

  const issueFreqMap = new Map<
    string,
    {
      field: string;
      title: string;
      category: IssueCategory;
      count: number;
      severity: IssueSeverity;
    }
  >();

  for (const r of reports) {
    totalScore += r.overallScore;
    totalComp += r.completenessScore;
    totalValid += r.validityScore;

    if (r.band === "needs_improvement") {
      qualityBands.needsImprovement++;
    } else {
      qualityBands[r.band]++;
    }
    priorityDistribution[r.priorityLevel]++;

    if (r.overallScore < 75 || r.criticalCount > 0 || r.highCount > 0) {
      attentionCount++;
    }

    // APAAR status
    if (r.verificationScore === 100) {
      apaarBreakdown.verified++;
    } else if (r.issues.some((i) => i.id === "apaar_missing")) {
      apaarBreakdown.missing++;
    } else if (r.issues.some((i) => i.id === "apaar_invalid_format")) {
      apaarBreakdown.invalid++;
    } else {
      apaarBreakdown.pending++;
    }

    // Frequency map
    for (const issue of r.issues) {
      const key = `${issue.field}:::${issue.title}`;
      const existing = issueFreqMap.get(key);
      if (existing) {
        existing.count++;
      } else {
        issueFreqMap.set(key, {
          field: issue.field,
          title: issue.title,
          category: issue.category,
          count: 1,
          severity: issue.severity,
        });
      }
    }
  }

  const frequentIssues = Array.from(issueFreqMap.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  const n = reports.length;

  return {
    totalRecords: n,
    averageScore: Math.round(totalScore / n),
    averageCompleteness: Math.round(totalComp / n),
    averageValidity: Math.round(totalValid / n),
    qualityBands,
    attentionNeededCount: attentionCount,
    apaarBreakdown,
    frequentIssues,
    priorityDistribution,
  };
}

/**
 * Evaluates an import batch, generating pre-commit validation intelligence.
 */
export function evaluateImportBatch(
  students: StudentQualityInput[],
  duplicateIndices: Set<number> = new Set(),
): BatchQualityReport {
  const rowReports = students.map((s, idx) =>
    evaluateStudentRecord({
      ...s,
      duplicateFlag: duplicateIndices.has(idx),
    }),
  );

  let validRecords = 0;
  let attentionNeededCount = 0;
  let invalidRecords = 0;
  let scoreSum = 0;

  const missingDist: Record<string, number> = {};
  const invalidDist: Record<string, number> = {};
  const apaarBreakdown = { verified: 0, pending: 0, missing: 0, invalid: 0 };

  for (const report of rowReports) {
    scoreSum += report.overallScore;

    if (report.overallScore >= 90 && report.criticalCount === 0 && report.highCount === 0) {
      validRecords++;
    } else if (report.criticalCount > 0 || report.overallScore < 50) {
      invalidRecords++;
      attentionNeededCount++;
    } else {
      attentionNeededCount++;
    }

    if (report.issues.some((i) => i.id === "apaar_missing")) {
      apaarBreakdown.missing++;
    } else if (report.issues.some((i) => i.id === "apaar_invalid_format")) {
      apaarBreakdown.invalid++;
    } else if (report.verificationScore === 100) {
      apaarBreakdown.verified++;
    } else {
      apaarBreakdown.pending++;
    }

    for (const issue of report.issues) {
      if (issue.title.toLowerCase().includes("missing")) {
        missingDist[issue.field] = (missingDist[issue.field] ?? 0) + 1;
      } else {
        invalidDist[issue.field] = (invalidDist[issue.field] ?? 0) + 1;
      }
    }
  }

  const n = rowReports.length;

  return {
    totalRecords: n,
    validRecords,
    attentionNeededCount,
    invalidRecords,
    averageScore: n > 0 ? Math.round(scoreSum / n) : 100,
    missingFieldDistribution: missingDist,
    invalidFieldDistribution: invalidDist,
    duplicateCandidateCount: duplicateIndices.size,
    apaarStatusBreakdown: apaarBreakdown,
    rowReports,
  };
}
