/**
 * Intelligent Correction Workflow & Discrepancy Resolution Engine
 * for EduTrace (SIH26263).
 *
 * Connects the Data Quality Engine to a robust, audited correction lifecycle.
 * Provides explainable suggestions for syntax/format issues, enforces strict
 * human-approval boundaries for factual identity fields, detects concurrent
 * update conflicts, and transactionally recalculates quality scores.
 */

import {
  evaluateStudentRecord,
  maskApaar,
  maskContact,
  type StudentQualityReport,
  type QualityIssue,
} from "@/lib/data-quality";
import { normalizeDob } from "@/lib/student-import";

// ── Types & Lifecycle States ───────────────────────────────────────────────

export type CorrectionStatus =
  | "open"
  | "submitted"
  | "under_review"
  | "needs_information"
  | "approved"
  | "rejected"
  | "applied"
  | "cancelled";

export type CorrectionState = CorrectionStatus;

export type UserRole = "student" | "institution_admin" | "officer" | "aicte_admin" | "system";

export type CorrectableFieldName =
  "name" | "dob" | "gender" | "contact" | "category" | "programme_code" | "intake_type";

export interface EvidenceAttachment {
  id: string;
  fileName: string;
  fileType: string; // e.g. 'application/pdf', 'image/jpeg'
  fileSize: number; // in bytes, max 5MB (5 * 1024 * 1024)
  storagePath: string; // private storage bucket path
  uploadedBy: string; // user id
  uploadedAt: string; // ISO date string
  reviewStatus: "pending" | "verified" | "insufficient";
  reviewerComments?: string | null | undefined;
}

export interface SmartSuggestion {
  fieldName: CorrectableFieldName;
  originalValue: string | null;
  proposedValue: string;
  reason: string;
  category: "formatting" | "casing" | "normalization" | "academic" | "identity";
  isHumanApprovalMandatory: boolean;
  isValid: boolean;
  validationError?: string | undefined;
  confidence: "high" | "medium" | "low";
}

export interface CorrectionTimelineEntry {
  timestamp: string;
  actorId: string;
  actorRole: string;
  fromStatus: CorrectionStatus | null;
  toStatus: CorrectionStatus;
  note?: string | null | undefined;
}

export interface ConcurrencyConflictResult {
  hasConflict: boolean;
  conflictType?: "value_mismatch" | "pending_duplicate_request" | "duplicate_student" | undefined;
  type?:
    "stale_data" | "conflicting_request" | "duplicate_collision" | "value_mismatch" | undefined;
  message?: string | undefined;
  description?: string | undefined;
  details?: Record<string, unknown> | undefined;
}

// ── Status Configurations ──────────────────────────────────────────────────

export const CORRECTION_STATUS_CONFIG: Record<
  CorrectionStatus,
  {
    label: string;
    badgeBg: string;
    badgeText: string;
    borderColor: string;
    description: string;
  }
> = {
  open: {
    label: "Open Discrepancy",
    badgeBg: "bg-slate-100 dark:bg-slate-900/40",
    badgeText: "text-slate-800 dark:text-slate-300",
    borderColor: "border-slate-300 dark:border-slate-800",
    description: "Identified by Data Quality Engine; awaiting submission.",
  },
  submitted: {
    label: "Submitted",
    badgeBg: "bg-blue-100 dark:bg-blue-950/40",
    badgeText: "text-blue-800 dark:text-blue-300",
    borderColor: "border-blue-300 dark:border-blue-800",
    description: "Request submitted by student or staff; awaiting officer triage.",
  },
  under_review: {
    label: "Under Review",
    badgeBg: "bg-purple-100 dark:bg-purple-950/40",
    badgeText: "text-purple-800 dark:text-purple-300",
    borderColor: "border-purple-300 dark:border-purple-800",
    description: "Assigned reviewer is evaluating discrepancy and evidence.",
  },
  needs_information: {
    label: "Needs Information",
    badgeBg: "bg-amber-100 dark:bg-amber-950/40",
    badgeText: "text-amber-800 dark:text-amber-300",
    borderColor: "border-amber-300 dark:border-amber-800",
    description: "Reviewer requested supplementary certificates or clarification.",
  },
  approved: {
    label: "Approved",
    badgeBg: "bg-emerald-100 dark:bg-emerald-950/40",
    badgeText: "text-emerald-800 dark:text-emerald-300",
    borderColor: "border-emerald-300 dark:border-emerald-800",
    description: "Correction authorized; ready for application to official record.",
  },
  rejected: {
    label: "Rejected",
    badgeBg: "bg-rose-100 dark:bg-rose-950/40",
    badgeText: "text-rose-800 dark:text-rose-300",
    borderColor: "border-rose-300 dark:border-rose-800",
    description: "Request declined with mandatory reviewer justification.",
  },
  applied: {
    label: "Applied",
    badgeBg: "bg-teal-100 dark:bg-teal-950/40",
    badgeText: "text-teal-800 dark:text-teal-300",
    borderColor: "border-teal-300 dark:border-teal-800",
    description: "Official student record updated, audited, and quality recalculated.",
  },
  cancelled: {
    label: "Cancelled",
    badgeBg: "bg-zinc-100 dark:bg-zinc-900/40",
    badgeText: "text-zinc-600 dark:text-zinc-400",
    borderColor: "border-zinc-300 dark:border-zinc-800",
    description: "Withdrawn by requester prior to final review.",
  },
};

// ── State Transition Rules ─────────────────────────────────────────────────

const VALID_TRANSITIONS: Record<CorrectionStatus, CorrectionStatus[]> = {
  open: ["submitted", "cancelled"],
  submitted: ["under_review", "needs_information", "approved", "rejected", "cancelled"],
  under_review: ["needs_information", "approved", "rejected", "cancelled"],
  needs_information: ["submitted", "under_review", "rejected", "cancelled"],
  approved: ["applied", "cancelled"],
  rejected: [], // terminal
  applied: [], // terminal
  cancelled: [], // terminal
};

export function canTransition(
  currentStatus: CorrectionStatus | string,
  targetStatus: CorrectionStatus,
  userRole: UserRole,
): boolean {
  // Normalize legacy 'pending' status from Supabase to 'submitted'
  const normalizedCurrent: CorrectionStatus =
    currentStatus === "pending" ? "submitted" : (currentStatus as CorrectionStatus);

  const allowedTargets = VALID_TRANSITIONS[normalizedCurrent];
  if (!allowedTargets || !allowedTargets.includes(targetStatus)) {
    return false;
  }

  // Role permissions
  if (userRole === "student") {
    // Students can submit initial request, answer needs_information, or cancel
    if (targetStatus === "submitted" || targetStatus === "cancelled") {
      return true;
    }
    return false;
  }

  if (
    userRole === "institution_admin" ||
    userRole === "officer" ||
    userRole === "aicte_admin" ||
    userRole === "system"
  ) {
    // Reviewers, admins, and system automated workers can transition between any valid graph node
    return true;
  }

  return false;
}

export function validateTransition(
  currentStatus: CorrectionStatus | string,
  targetStatus: CorrectionStatus,
  userRole: UserRole,
  options?: {
    rejectionReason?: string | null | undefined;
    evidenceProvided?: boolean | undefined;
  },
): { valid: boolean; error?: string } {
  if (!canTransition(currentStatus, targetStatus, userRole)) {
    return {
      valid: false,
      error: `Invalid transition from ${currentStatus} to ${targetStatus} for role '${userRole}'.`,
    };
  }

  if (targetStatus === "rejected") {
    const reason = options?.rejectionReason?.trim();
    if (!reason || reason.length < 5) {
      return {
        valid: false,
        error: "A mandatory rejection reason (at least 5 characters) must be provided.",
      };
    }
  }

  return { valid: true };
}

// ── Evidence Validation ────────────────────────────────────────────────────

export const ALLOWED_EVIDENCE_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
]);

export const MAX_EVIDENCE_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

export function validateEvidenceFile(file: {
  fileName: string;
  fileType: string;
  fileSize: number;
}): { valid: boolean; error?: string } {
  if (!ALLOWED_EVIDENCE_MIME_TYPES.has(file.fileType.toLowerCase())) {
    return {
      valid: false,
      error: `Unsupported file type '${file.fileType}'. Allowed formats: PDF, JPEG, PNG, WEBP.`,
    };
  }

  if (file.fileSize > MAX_EVIDENCE_FILE_SIZE) {
    const sizeMb = (file.fileSize / (1024 * 1024)).toFixed(1);
    return {
      valid: false,
      error: `File size exceeds the 5MB limit (${sizeMb}MB provided).`,
    };
  }

  if (!file.fileName || file.fileName.trim().length === 0) {
    return { valid: false, error: "A valid file name must be provided." };
  }

  return { valid: true };
}

// ── Date Normalizer Helper ──────────────────────────────────────────────────

export function normalizeDateString(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  // YYYY-MM-DD or YYYY/MM/DD
  let m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(value);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}-${m[3]!.padStart(2, "0")}`;
  // DD-MM-YYYY or DD/MM/YYYY
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (m) return `${m[3]}-${m[2]!.padStart(2, "0")}-${m[1]!.padStart(2, "0")}`;
  return null;
}

// ── Smart Suggestion Generator ─────────────────────────────────────────────

/**
 * Evaluates an existing student record and quality issues to produce
 * explainable, rule-based correction suggestions.
 */
export function generateSmartSuggestions(
  student: {
    name?: string | null | undefined;
    dob?: string | null | undefined;
    gender?: string | null | undefined;
    contact?: string | null | undefined;
    category?: string | null | undefined;
    programme_code?: string | null | undefined;
    programmeCode?: string | null | undefined;
    intake_type?: string | null | undefined;
    intakeType?: string | null | undefined;
    apaar_id?: string | null | undefined;
  },
  qualityIssues: QualityIssue[] = [],
): SmartSuggestion[] {
  const suggestions: SmartSuggestion[] = [];

  const rawName = student.name ?? "";
  const rawDob = student.dob ?? "";
  const rawContact = student.contact ?? "";
  const rawProgramme = student.programme_code ?? student.programmeCode ?? "";
  const rawCategory = student.category ?? "";
  const rawIntake = student.intake_type ?? student.intakeType ?? "";
  const rawGender = student.gender ?? "";

  // 1. Name Suggestions
  if (rawName) {
    const trimmed = rawName.trim().replace(/\s+/g, " ");
    if (trimmed !== rawName) {
      suggestions.push({
        fieldName: "name",
        originalValue: rawName,
        proposedValue: trimmed,
        reason: "Remove leading, trailing, and excessive internal whitespace.",
        category: "formatting",
        isHumanApprovalMandatory: true, // Factual identity changes require human review
        isValid: true,
        confidence: "high",
      });
    }

    // Title Case check if completely uppercase or lowercase
    const isAllUpper = rawName === rawName.toUpperCase() && /[A-Z]/.test(rawName);
    const isAllLower = rawName === rawName.toLowerCase() && /[a-z]/.test(rawName);
    if ((isAllUpper || isAllLower) && rawName.length > 2) {
      const titleCased = trimmed
        .toLowerCase()
        .split(" ")
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(" ");

      suggestions.push({
        fieldName: "name",
        originalValue: rawName,
        proposedValue: titleCased,
        reason: "Standardize name capitalization to standard Title Case.",
        category: "casing",
        isHumanApprovalMandatory: true, // Factual identity requires human confirmation
        isValid: true,
        confidence: "medium",
      });
    }
  }

  // 2. Date of Birth Normalization
  if (rawDob) {
    const trimmedDob = rawDob.trim();
    const normalized = normalizeDateString(trimmedDob);
    if (normalized && normalized !== rawDob) {
      suggestions.push({
        fieldName: "dob",
        originalValue: rawDob,
        proposedValue: normalized,
        reason: "Normalize date format to statutory standard YYYY-MM-DD.",
        category: "normalization",
        isHumanApprovalMandatory: true, // DOB is factual identity
        isValid: true,
        confidence: "high",
      });
    }
  }

  // 3. Contact Number Normalization
  if (rawContact) {
    const trimmedContact = rawContact.trim();
    if (trimmedContact !== rawContact) {
      suggestions.push({
        fieldName: "contact",
        originalValue: rawContact,
        proposedValue: trimmedContact,
        reason: "Remove leading and trailing whitespace from contact detail.",
        category: "formatting",
        isHumanApprovalMandatory: false,
        isValid: true,
        confidence: "high",
      });
    }

    const isEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedContact);

    if (isEmail) {
      const lower = trimmedContact.toLowerCase();
      if (lower !== trimmedContact) {
        suggestions.push({
          fieldName: "contact",
          originalValue: rawContact,
          proposedValue: lower,
          reason: "Convert email address to lowercase standard formatting.",
          category: "formatting",
          isHumanApprovalMandatory: false,
          isValid: true,
          confidence: "high",
        });
      }
    } else {
      // Clean digits for Indian phone number
      const digitsOnly = trimmedContact.replace(/\D/g, "");
      let normalizedPhone: string | null = null;

      if (digitsOnly.length === 10 && /^[6-9]/.test(digitsOnly)) {
        normalizedPhone = digitsOnly;
      } else if (
        digitsOnly.length === 12 &&
        digitsOnly.startsWith("91") &&
        /^[6-9]/.test(digitsOnly.slice(2))
      ) {
        normalizedPhone = digitsOnly.slice(2);
      } else if (
        digitsOnly.length === 11 &&
        digitsOnly.startsWith("0") &&
        /^[6-9]/.test(digitsOnly.slice(1))
      ) {
        normalizedPhone = digitsOnly.slice(1);
      }

      if (normalizedPhone && normalizedPhone !== trimmedContact) {
        suggestions.push({
          fieldName: "contact",
          originalValue: rawContact,
          proposedValue: normalizedPhone,
          reason:
            "Strip non-numeric characters and country/trunk prefix to extract 10-digit mobile.",
          category: "formatting",
          isHumanApprovalMandatory: false,
          isValid: true,
          confidence: "high",
        });
      }
    }
  }

  // 4. Programme Code Normalization
  if (rawProgramme) {
    const trimmedProg = rawProgramme
      .trim()
      .toUpperCase()
      .replace(/[\s._]+/g, "-");
    const commonMappings: Record<string, string> = {
      "BTECH-CSE": "BTECH-CSE",
      "B-TECH-CSE": "BTECH-CSE",
      "BTECH-COMPUTER-SCIENCE": "BTECH-CSE",
      "BE-CSE": "BTECH-CSE",
      "BTECH-ECE": "BTECH-ECE",
      "B-TECH-ECE": "BTECH-ECE",
      "BTECH-MECH": "BTECH-MECH",
      "BTECH-CIVIL": "BTECH-CIVIL",
      "BTECH-IT": "BTECH-IT",
      MCA: "MCA",
      MBA: "MBA",
    };

    const mapped = commonMappings[trimmedProg] ?? trimmedProg;
    if (mapped !== rawProgramme) {
      suggestions.push({
        fieldName: "programme_code",
        originalValue: rawProgramme,
        proposedValue: mapped,
        reason: "Map course abbreviation to approved AICTE programme nomenclature.",
        category: "academic",
        isHumanApprovalMandatory: true,
        isValid: true,
        confidence: "medium",
      });
    }
  }

  // 5. Category Normalization
  if (rawCategory) {
    const trimmedCat = rawCategory.trim();
    if (trimmedCat !== rawCategory) {
      suggestions.push({
        fieldName: "category",
        originalValue: rawCategory,
        proposedValue: trimmedCat,
        reason: "Remove leading and trailing whitespace from category.",
        category: "formatting",
        isHumanApprovalMandatory: false,
        isValid: true,
        confidence: "high",
      });
    }

    const lowerCat = trimmedCat.toLowerCase().replace(/\s+/g, " ");
    const catMap: Record<string, string> = {
      general: "General",
      gen: "General",
      open: "General",
      obc: "OBC",
      "obc-ncl": "OBC-NCL",
      "other backward class": "OBC",
      sc: "SC",
      "scheduled caste": "SC",
      st: "ST",
      "scheduled tribe": "ST",
      ews: "EWS",
      "economically weaker section": "EWS",
    };

    const standardized = catMap[lowerCat];
    if (standardized && standardized !== trimmedCat) {
      suggestions.push({
        fieldName: "category",
        originalValue: rawCategory,
        proposedValue: standardized,
        reason: "Standardize social reservation category to statutory reporting nomenclature.",
        category: "academic",
        isHumanApprovalMandatory: false,
        isValid: true,
        confidence: "high",
      });
    }
  }

  // 6. Intake Type Normalization
  if (rawIntake) {
    const lowerIntake = rawIntake.trim().toLowerCase();
    const intakeMap: Record<string, string> = {
      regular: "Regular",
      direct: "Regular",
      general: "Regular",
      lateral: "Lateral",
      "lateral entry": "Lateral",
      tfw: "TFW",
      "tuition fee waiver": "TFW",
      supernumerary: "Supernumerary",
      nri: "Supernumerary",
      pio: "Supernumerary",
    };

    const standardized = intakeMap[lowerIntake];
    if (standardized && standardized !== rawIntake) {
      suggestions.push({
        fieldName: "intake_type",
        originalValue: rawIntake,
        proposedValue: standardized,
        reason: "Standardize admission intake quota classification.",
        category: "academic",
        isHumanApprovalMandatory: true,
        isValid: true,
        confidence: "high",
      });
    }
  }

  // 7. Gender Normalization
  if (rawGender) {
    const lowerGender = rawGender.trim().toLowerCase();
    const genderMap: Record<string, string> = {
      m: "Male",
      male: "Male",
      f: "Female",
      female: "Female",
      o: "Other",
      other: "Other",
      transgender: "Other",
    };

    const standardized = genderMap[lowerGender];
    if (standardized && standardized !== rawGender) {
      suggestions.push({
        fieldName: "gender",
        originalValue: rawGender,
        proposedValue: standardized,
        reason: "Standardize gender code to Male, Female, or Other.",
        category: "formatting",
        isHumanApprovalMandatory: false,
        isValid: true,
        confidence: "high",
      });
    }
  }

  return suggestions;
}

// ── Concurrency & Conflict Detection ───────────────────────────────────────

/**
 * Validates whether a proposed correction conflicts with newer records,
 * pending requests, or duplicate student profiles in the registry.
 */
export function detectCorrectionConflicts(
  currentStudent: {
    id?: string | undefined;
    name?: string | null | undefined;
    dob?: string | null | undefined;
    apaar_id?: string | null | undefined;
    gender?: string | null | undefined;
    contact?: string | null | undefined;
    category?: string | null | undefined;
    programme_code?: string | null | undefined;
    intake_type?: string | null | undefined;
  },
  request: {
    field_name: CorrectableFieldName;
    current_value: string | null;
    proposed_value: string;
  },
  existingRequests: Array<{
    id: string;
    student_id: string;
    field_name: string;
    status: string;
  }> = [],
  allStudents: Array<{
    id: string;
    name: string;
    dob?: string | null | undefined;
    apaar_id?: string | null | undefined;
  }> = [],
): ConcurrencyConflictResult {
  const actualCurrentValue = (currentStudent as Record<string, unknown>)[request.field_name] as
    string | null | undefined;

  // 1. Record Concurrency Check: Was student modified after the request was opened?
  const normalizedActual = actualCurrentValue?.trim() ?? null;
  const normalizedExpected = request.current_value?.trim() ?? null;

  if (normalizedActual !== normalizedExpected) {
    return {
      hasConflict: true,
      conflictType: "value_mismatch",
      type: "stale_data",
      message: `Underlying student record has been updated since request creation. Expected "${request.current_value ?? "—"}", found "${actualCurrentValue ?? "—"}".`,
      description: `Student record was modified since this request was opened. Current registry value is '${actualCurrentValue ?? "null"}'.`,
      details: {
        expected: request.current_value,
        actual: actualCurrentValue,
      },
    };
  }

  // 2. Conflicting Pending Requests: Check if another request for this student & field is open
  const otherPending = existingRequests.find(
    (r) =>
      r.student_id === currentStudent.id &&
      r.field_name === request.field_name &&
      ["submitted", "under_review", "needs_information", "pending"].includes(r.status),
  );

  // If another pending request exists with a different ID
  if (otherPending) {
    return {
      hasConflict: true,
      conflictType: "pending_duplicate_request",
      type: "conflicting_request",
      message: `Another correction request (${otherPending.id}) for '${request.field_name}' is already pending review.`,
      description: `Another pending correction request already exists for this student on field '${request.field_name}'.`,
      details: { conflictingRequestId: otherPending.id },
    };
  }

  // 3. Duplicate Conflict Check on Factual Identity Changes (Name, DOB, APAAR)
  if (request.field_name === "name" || request.field_name === "dob") {
    const candidateName =
      request.field_name === "name"
        ? request.proposed_value.trim().toLowerCase()
        : currentStudent.name?.trim().toLowerCase();
    const candidateDob =
      request.field_name === "dob" ? request.proposed_value.trim() : currentStudent.dob?.trim();

    if (candidateName && candidateDob) {
      const duplicateStudent = allStudents.find(
        (s) =>
          s.id !== currentStudent.id &&
          s.name.trim().toLowerCase() === candidateName &&
          s.dob?.trim() === candidateDob,
      );

      if (duplicateStudent) {
        return {
          hasConflict: true,
          conflictType: "duplicate_student",
          type: "duplicate_collision",
          message: `Applying this correction would conflict with existing student '${duplicateStudent.name}' (DOB: ${duplicateStudent.dob}).`,
          description: `Proposed change matches an existing student profile (${duplicateStudent.name}) in the registry.`,
          details: { conflictingStudentId: duplicateStudent.id },
        };
      }
    }
  }

  return { hasConflict: false };
}

// ── Quality Recalculator ───────────────────────────────────────────────────

/**
 * Calculates pre- and post-correction quality metrics, documenting the exact
 * quality score delta achieved by applying an authorized correction.
 */
export function recalculateQualityAfterCorrection(
  currentStudent: {
    id: string;
    student_id?: string | null | undefined;
    name?: string | null | undefined;
    dob?: string | null | undefined;
    apaar_id?: string | null | undefined;
    gender?: string | null | undefined;
    contact?: string | null | undefined;
    category?: string | null | undefined;
    programme_code?: string | null | undefined;
    intake_type?: string | null | undefined;
    apaar_verify_status?: string | null | undefined;
  },
  fieldName: CorrectableFieldName,
  newValue: string,
): {
  oldReport: StudentQualityReport;
  previousReport: StudentQualityReport;
  newReport: StudentQualityReport;
  scoreDelta: number;
  resolvedIssuesCount: number;
  resolvedIssues: string[];
  summaryMessage: string;
} {
  const oldReport = evaluateStudentRecord({
    id: currentStudent.id,
    studentId: currentStudent.student_id,
    name: currentStudent.name,
    dob: currentStudent.dob,
    apaarId: currentStudent.apaar_id,
    gender: currentStudent.gender,
    contact: currentStudent.contact,
    category: currentStudent.category,
    programmeCode: currentStudent.programme_code,
    intakeType: currentStudent.intake_type,
    apaarVerifyStatus: currentStudent.apaar_verify_status,
  });

  const updatedStudent = {
    ...currentStudent,
    [fieldName]: newValue,
  };

  const newReport = evaluateStudentRecord({
    id: updatedStudent.id,
    studentId: updatedStudent.student_id,
    name: updatedStudent.name,
    dob: updatedStudent.dob,
    apaarId: updatedStudent.apaar_id,
    gender: updatedStudent.gender,
    contact: updatedStudent.contact,
    category: updatedStudent.category,
    programmeCode: updatedStudent.programme_code,
    intakeType: updatedStudent.intake_type,
    apaarVerifyStatus: updatedStudent.apaar_verify_status,
  });

  const scoreDelta = newReport.overallScore - oldReport.overallScore;
  const resolvedIssues = oldReport.issues
    .filter((oi) => !newReport.issues.some((ni) => ni.id === oi.id))
    .map((i) => i.id);
  const resolvedIssuesCount = Math.max(0, resolvedIssues.length);

  const summaryMessage =
    scoreDelta > 0
      ? `Quality score improved from ${oldReport.overallScore} to ${newReport.overallScore} (+${scoreDelta} pts). ${resolvedIssuesCount} issue(s) resolved.`
      : scoreDelta === 0
        ? `Quality score maintained at ${newReport.overallScore}/100.`
        : `Quality score adjusted to ${newReport.overallScore}/100 (${scoreDelta} pts).`;

  return {
    oldReport,
    previousReport: oldReport,
    newReport,
    scoreDelta,
    resolvedIssuesCount,
    resolvedIssues,
    summaryMessage,
  };
}
