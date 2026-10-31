import { describe, it, expect } from "vitest";
import {
  extractEvidenceEntitiesAI,
  PRELOADED_EVIDENCE_DOCS,
  type EvidenceVerificationResult,
} from "../lib/evidence-ai";

describe("Evidence AI Document Verification Engine", () => {
  it("extracts APAAR ID, validates Verhoeff checksum, and confirms match", () => {
    const doc = PRELOADED_EVIDENCE_DOCS["sita-apaar"];
    expect(doc).toBeDefined();

    const result = extractEvidenceEntitiesAI(
      doc.rawText,
      "apaar_id",
      "123456789012", // current invalid
      "123456789010", // requested valid
    );

    expect(result.status).toBe("MATCH_CONFIRMED");
    expect(result.checksumValidated).toBe(true);
    expect(result.confidenceScore).toBeGreaterThanOrEqual(99);
    expect(result.entities.apaarId).toBe("123456789010");
    expect(result.entities.studentName).toBe("Sita Devi");
    expect(result.fieldSuggestedValue).toBe("123456789010");
  });

  it("flags discrepancy when extracted APAAR differs from requested value", () => {
    const doc = PRELOADED_EVIDENCE_DOCS["sita-apaar"];
    const result = extractEvidenceEntitiesAI(
      doc.rawText,
      "apaar_id",
      "123456789012",
      "999999999999", // wrong requested value
    );

    expect(result.status).toBe("DISCREPANCY_FLAGGED");
    expect(result.entities.apaarId).toBe("123456789010");
    expect(result.fieldSuggestedValue).toBe("123456789010");
  });

  it("extracts date of birth from CBSE Class X certificate", () => {
    const doc = PRELOADED_EVIDENCE_DOCS["anita-dob"];
    const result = extractEvidenceEntitiesAI(doc.rawText, "dob", "2005-04-12", "2005-04-21");

    expect(result.status).toBe("MATCH_CONFIRMED");
    expect(result.entities.dob).toBe("2005-04-21");
    expect(result.documentType).toBe("BOARD_MARKSHEET");
  });

  it("extracts verified contact number from notarized affidavit", () => {
    const doc = PRELOADED_EVIDENCE_DOCS["ravi-contact"];
    const result = extractEvidenceEntitiesAI(doc.rawText, "contact", "9123456780", "9876501234");

    expect(result.status).toBe("MATCH_CONFIRMED");
    expect(result.entities.contact).toBe("9876501234");
    expect(result.documentType).toBe("AFFIDAVIT");
  });

  it("handles freeform user uploaded text and extracts phone/APAAR gracefully", () => {
    const freeform = `Government Identity Slip\nCandidate: John Doe\nMobile: 9871234567\nAPAAR: 236665564211`;
    const result = extractEvidenceEntitiesAI(freeform, "apaar_id", "empty", "236665564211");

    expect(result.status).toBe("MATCH_CONFIRMED");
    expect(result.entities.apaarId).toBe("236665564211");
    expect(result.entities.contact).toBe("9871234567");
    expect(result.checksumValidated).toBe(true);
  });
});
