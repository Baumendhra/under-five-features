import { describe, expect, it } from "vitest";
import {
  canTransition,
  validateTransition,
  validateEvidenceFile,
  generateSmartSuggestions,
  detectCorrectionConflicts,
  recalculateQualityAfterCorrection,
  ALLOWED_EVIDENCE_MIME_TYPES,
  MAX_EVIDENCE_FILE_SIZE,
  type CorrectionState,
  type UserRole,
} from "@/lib/correction-engine";
import { evaluateStudentRecord, type StudentQualityInput } from "@/lib/data-quality";

describe("Automated Correction Workflow & Discrepancy Resolution", () => {
  // ── 1. State Machine & Role-based Transitions ──────────────────────────────
  describe("State Machine & Role Enforcement", () => {
    it("allows valid forward transitions for institution admins and officers", () => {
      // Officer reviewing and moving through lifecycle
      expect(canTransition("open", "submitted", "officer")).toBe(true);
      expect(canTransition("submitted", "under_review", "officer")).toBe(true);
      expect(canTransition("under_review", "approved", "officer")).toBe(true);
      expect(canTransition("approved", "applied", "officer")).toBe(true);

      // Institution Admin reviewing
      expect(canTransition("submitted", "needs_information", "institution_admin")).toBe(true);
      expect(canTransition("under_review", "rejected", "institution_admin")).toBe(true);
    });

    it("allows students to submit, respond to info requests, and cancel their own requests", () => {
      expect(canTransition("open", "submitted", "student")).toBe(true);
      expect(canTransition("needs_information", "submitted", "student")).toBe(true);
      expect(canTransition("open", "cancelled", "student")).toBe(true);
      expect(canTransition("submitted", "cancelled", "student")).toBe(true);
    });

    it("STRICTLY prevents students from approving or rejecting correction requests", () => {
      expect(canTransition("submitted", "approved", "student")).toBe(false);
      expect(canTransition("under_review", "approved", "student")).toBe(false);
      expect(canTransition("submitted", "rejected", "student")).toBe(false);
      expect(canTransition("under_review", "rejected", "student")).toBe(false);
      expect(canTransition("approved", "applied", "student")).toBe(false);
    });

    it("prevents transitions out of terminal states (applied, cancelled)", () => {
      expect(canTransition("applied", "under_review", "institution_admin")).toBe(false);
      expect(canTransition("applied", "rejected", "system")).toBe(false);
      expect(canTransition("cancelled", "approved", "officer")).toBe(false);
      expect(canTransition("cancelled", "submitted", "student")).toBe(false);
    });

    it("prevents invalid reverse state transitions", () => {
      expect(canTransition("approved", "submitted", "officer")).toBe(false);
      expect(canTransition("rejected", "under_review", "institution_admin")).toBe(false);
    });

    it("enforces mandatory rejection reasons of at least 5 characters", () => {
      // Rejecting without reason
      const noReason = validateTransition("under_review", "rejected", "officer", {});
      expect(noReason.valid).toBe(false);
      expect(noReason.error).toContain("mandatory rejection reason");

      // Rejecting with too short reason
      const shortReason = validateTransition("under_review", "rejected", "officer", {
        rejectionReason: "no",
      });
      expect(shortReason.valid).toBe(false);
      expect(shortReason.error).toContain("at least 5 characters");

      // Rejecting with valid comprehensive explanation
      const validRejection = validateTransition("under_review", "rejected", "officer", {
        rejectionReason: "Supporting mark sheet does not match the requested date of birth.",
      });
      expect(validRejection.valid).toBe(true);
    });
  });

  // ── 2. Smart Suggestion Generation & Normalization ────────────────────────
  describe("Smart Suggestion Engine", () => {
    it("suggests trimming leading and trailing whitespace from fields", () => {
      const student = {
        name: "  Aarav Sharma  ",
        contact: " 9876543210 ",
        category: " General ",
      };

      const suggestions = generateSmartSuggestions(student);
      const nameTrim = suggestions.find(
        (s) => s.fieldName === "name" && s.reason.includes("whitespace"),
      );
      expect(nameTrim).toBeDefined();
      expect(nameTrim?.proposedValue).toBe("Aarav Sharma");

      const contactTrim = suggestions.find(
        (s) => s.fieldName === "contact" && s.reason.includes("whitespace"),
      );
      expect(contactTrim).toBeDefined();
      expect(contactTrim?.proposedValue).toBe("9876543210");
    });

    it("suggests Title Case capitalization for all-caps student names", () => {
      const student = {
        name: "PRIYA RAJESH SHARMA",
      };

      const suggestions = generateSmartSuggestions(student);
      const nameCap = suggestions.find(
        (s) => s.fieldName === "name" && s.reason.includes("Title Case"),
      );
      expect(nameCap).toBeDefined();
      expect(nameCap?.proposedValue).toBe("Priya Rajesh Sharma");
    });

    it("normalizes diverse date formats to ISO YYYY-MM-DD", () => {
      // DD/MM/YYYY
      const s1 = generateSmartSuggestions({ dob: "15/08/2003" });
      const dob1 = s1.find((s) => s.fieldName === "dob" && s.proposedValue === "2003-08-15");
      expect(dob1).toBeDefined();
      expect(dob1?.isValid).toBe(true);

      // DD-MM-YYYY
      const s2 = generateSmartSuggestions({ dob: "25-12-2001" });
      const dob2 = s2.find((s) => s.fieldName === "dob" && s.proposedValue === "2001-12-25");
      expect(dob2).toBeDefined();

      // YYYY/MM/DD
      const s3 = generateSmartSuggestions({ dob: "2002/06/10" });
      const dob3 = s3.find((s) => s.fieldName === "dob" && s.proposedValue === "2002-06-10");
      expect(dob3).toBeDefined();
    });

    it("cleans up phone numbers with dashes, spaces and country code prefix", () => {
      const student = {
        contact: "+91 98765-43210",
      };

      const suggestions = generateSmartSuggestions(student);
      const contactClean = suggestions.find((s) => s.fieldName === "contact");
      expect(contactClean).toBeDefined();
      expect(contactClean?.proposedValue).toBe("9876543210");
      expect(contactClean?.isValid).toBe(true);
    });

    it("normalizes academic programme codes to uppercase standard notation", () => {
      const student = {
        programme_code: "btech_cse",
      };

      const suggestions = generateSmartSuggestions(student);
      const progClean = suggestions.find((s) => s.fieldName === "programme_code");
      expect(progClean).toBeDefined();
      expect(progClean?.proposedValue).toBe("BTECH-CSE");
    });

    it("standardizes social category abbreviations", () => {
      const s1 = generateSmartSuggestions({ category: "obc" });
      expect(s1.find((s) => s.fieldName === "category")?.proposedValue).toBe("OBC");

      const s2 = generateSmartSuggestions({ category: "obc-ncl" });
      expect(s2.find((s) => s.fieldName === "category")?.proposedValue).toBe("OBC-NCL");

      const s3 = generateSmartSuggestions({ category: "gen" });
      expect(s3.find((s) => s.fieldName === "category")?.proposedValue).toBe("General");
    });

    it("requires mandatory human approval for factual identity corrections (name, dob)", () => {
      const student = {
        name: "  PRIYA SHARMA  ",
        dob: "15/08/2003",
        contact: " 9876543210 ",
      };

      const suggestions = generateSmartSuggestions(student);

      const nameSuggestions = suggestions.filter((s) => s.fieldName === "name");
      for (const s of nameSuggestions) {
        expect(s.isHumanApprovalMandatory).toBe(true);
      }

      const dobSuggestions = suggestions.filter((s) => s.fieldName === "dob");
      for (const s of dobSuggestions) {
        expect(s.isHumanApprovalMandatory).toBe(true);
      }

      // Safe formatting on contact number does not require mandatory identity review
      const contactSuggestions = suggestions.filter((s) => s.fieldName === "contact");
      for (const s of contactSuggestions) {
        expect(s.isHumanApprovalMandatory).toBe(false);
      }
    });
  });

  // ── 3. Supporting Evidence Document Validation ─────────────────────────────
  describe("Supporting Evidence Validation", () => {
    it("accepts allowed document MIME types (PDF, PNG, JPEG, WEBP) within size limit", () => {
      for (const mime of ALLOWED_EVIDENCE_MIME_TYPES) {
        const result = validateEvidenceFile({
          fileName: `evidence_doc.${mime.split("/")[1]}`,
          fileType: mime,
          fileSize: 2 * 1024 * 1024, // 2MB
        });
        expect(result.valid).toBe(true);
        expect(result.error).toBeUndefined();
      }
    });

    it("rejects disallowed file types such as executables, zip archives, or scripts", () => {
      const disallowed = [
        "application/x-msdownload",
        "application/zip",
        "text/javascript",
        "application/vnd.microsoft.portable-executable",
      ];

      for (const mime of disallowed) {
        const result = validateEvidenceFile({
          fileName: "malicious.bin",
          fileType: mime,
          fileSize: 50 * 1024,
        });
        expect(result.valid).toBe(false);
        expect(result.error).toContain("Unsupported file type");
      }
    });

    it("rejects evidence documents exceeding the 5MB size limit", () => {
      const oversized = validateEvidenceFile({
        fileName: "large_scan.pdf",
        fileType: "application/pdf",
        fileSize: MAX_EVIDENCE_FILE_SIZE + 1024, // 5MB + 1KB
      });
      expect(oversized.valid).toBe(false);
      expect(oversized.error).toContain("exceeds the 5MB limit");
    });

    it("rejects blank or empty filenames", () => {
      const emptyName = validateEvidenceFile({
        fileName: "   ",
        fileType: "application/pdf",
        fileSize: 1024,
      });
      expect(emptyName.valid).toBe(false);
      expect(emptyName.error).toContain("A valid file name must be provided");
    });
  });

  // ── 4. Concurrency & Conflict Detection ────────────────────────────────────
  describe("Concurrency & Conflict Detection", () => {
    const baseStudent = {
      id: "student-101",
      name: "Rohit Verma",
      dob: "2003-04-12",
      contact: "9876543210",
      category: "General",
    };

    it("detects stale records when the student record was modified after request was created", () => {
      // In DB, student's contact is now '9123456789', but the request was created when it was '9876543210'
      const conflict = detectCorrectionConflicts(
        { ...baseStudent, contact: "9123456789" },
        {
          field_name: "contact",
          current_value: "9876543210",
          proposed_value: "9999999999",
        },
      );

      expect(conflict.hasConflict).toBe(true);
      expect(conflict.type).toBe("stale_data");
      expect(conflict.description).toContain("modified since this request was opened");
    });

    it("reports no conflict when actual database value matches expected current value", () => {
      const conflict = detectCorrectionConflicts(baseStudent, {
        field_name: "contact",
        current_value: "9876543210",
        proposed_value: "9999999999",
      });

      expect(conflict.hasConflict).toBe(false);
    });

    it("detects conflicting concurrent pending requests on the same field", () => {
      const existingPending = [
        {
          id: "req-999",
          student_id: "student-101",
          field_name: "dob",
          status: "pending",
        },
      ];

      const conflict = detectCorrectionConflicts(
        baseStudent,
        {
          field_name: "dob",
          current_value: "2003-04-12",
          proposed_value: "2003-04-15",
        },
        existingPending,
      );

      expect(conflict.hasConflict).toBe(true);
      expect(conflict.type).toBe("conflicting_request");
      expect(conflict.description).toContain("Another pending correction request already exists");
    });

    it("detects duplicate collisions when proposed name and DOB collide with another student", () => {
      const otherStudents = [
        {
          id: "student-202", // different student
          name: "Ananya Roy",
          dob: "2002-11-20",
        },
      ];

      // Proposing to change Rohit Verma's name to "Ananya Roy" with DOB 2002-11-20
      const conflict = detectCorrectionConflicts(
        { ...baseStudent, dob: "2002-11-20" },
        {
          field_name: "name",
          current_value: "Rohit Verma",
          proposed_value: "Ananya Roy",
        },
        [],
        otherStudents,
      );

      expect(conflict.hasConflict).toBe(true);
      expect(conflict.type).toBe("duplicate_collision");
      expect(conflict.description).toContain("matches an existing student");
    });
  });

  // ── 5. Post-Correction Quality Recalculation ────────────────────────────────
  describe("Post-Correction Quality Recalculation", () => {
    it("recalculates student data quality score and produces a positive score delta", () => {
      // Student with missing DOB and malformed contact
      const studentWithDefects = {
        id: "stu-qual-1",
        student_id: "STU-001",
        name: "Vikram Malhotra",
        dob: null, // missing DOB
        contact: "123", // invalid contact
        category: "General",
        programme_code: "BTECH-CSE",
        intake_type: "Regular",
        gender: "Male",
        apaar_id: null,
      };

      const beforeReport = evaluateStudentRecord({
        id: studentWithDefects.id,
        studentId: studentWithDefects.student_id,
        name: studentWithDefects.name,
        dob: studentWithDefects.dob,
        apaarId: studentWithDefects.apaar_id,
        contact: studentWithDefects.contact,
        category: studentWithDefects.category,
        programmeCode: studentWithDefects.programme_code,
        intakeType: studentWithDefects.intake_type,
        gender: studentWithDefects.gender,
      });

      // Apply correction for DOB: "2002-09-18"
      const recalcResult = recalculateQualityAfterCorrection(
        studentWithDefects,
        "dob",
        "2002-09-18",
      );

      expect(recalcResult.previousReport.overallScore).toBe(beforeReport.overallScore);
      expect(recalcResult.newReport.overallScore).toBeGreaterThan(beforeReport.overallScore);
      expect(recalcResult.scoreDelta).toBeGreaterThan(0);
      expect(recalcResult.resolvedIssues).toContain("dob_missing");
      expect(recalcResult.newReport.completenessScore).toBeGreaterThan(
        beforeReport.completenessScore,
      );
    });
  });
});
