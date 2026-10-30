import { describe, expect, it } from "vitest";
import {
  jaroSimilarity,
  jaroWinklerSimilarity,
  levenshteinDistance,
  normalizedLevenshteinSimilarity,
  tokenSortSimilarity,
  soundex,
  compareNames,
  compareDob,
  compareContact,
  compareProgrammes,
  evaluateCompositeSimilarity,
  generateCandidatePairs,
  clusterDuplicateCandidates,
  maskSensitiveValue,
  type StudentIdentityRecord,
} from "@/lib/identity-resolution";

describe("Advanced Identity Resolution & Intelligent Duplicate Management", () => {
  // ── 1. Name Similarity Algorithms ──────────────────────────────────────────
  describe("Multi-Algorithm Name Similarity", () => {
    it("computes exact and close Jaro-Winkler similarity", () => {
      expect(jaroWinklerSimilarity("arjun patel", "arjun patel")).toBe(1.0);
      expect(jaroWinklerSimilarity("priya", "priyaa")).toBeGreaterThan(0.9);
      expect(jaroWinklerSimilarity("rohit", "ananya")).toBeLessThan(0.6);
    });

    it("computes normalized Levenshtein edit distance", () => {
      // 1 insertion / substitution
      const sim = normalizedLevenshteinSimilarity("vikram", "vikrom");
      expect(sim).toBeGreaterThanOrEqual(0.8);
      expect(levenshteinDistance("vikram", "vikrom")).toBe(1);

      // completely different
      expect(normalizedLevenshteinSimilarity("a", "zzzzz")).toBe(0);
    });

    it("detects reordered names using Token Sort & Set Similarity", () => {
      // "Sharma Aarav" vs "Aarav Sharma"
      const score = tokenSortSimilarity("sharma aarav", "aarav sharma");
      expect(score).toBe(1.0);

      // "Patel Priya Kumar" vs "Priya Patel"
      const partialOverlap = tokenSortSimilarity("patel priya kumar", "priya patel");
      expect(partialOverlap).toBeGreaterThanOrEqual(0.65);
    });

    it("evaluates phonetic Soundex representation", () => {
      // Indian name spelling variants
      expect(soundex("Pooja")).toBe(soundex("Puja"));
      expect(soundex("Vikas")).toBe(soundex("Vickas"));
      expect(soundex("Mehta")).toBe(soundex("Mata"));
    });

    it("combines multi-algorithm signals into an explainable name comparison", () => {
      const match = compareNames("Priya Rajesh Sharma", "Sharma Priya Rajesh");
      expect(match.score).toBeGreaterThanOrEqual(0.95);
      expect(match.tokenSimilarity).toBe(1.0);
      expect(match.explanation).toContain("reordered");
    });
  });

  // ── 2. Demographic Comparison (DOB, Contact, Programme) ────────────────────
  describe("Demographic Matching & Conflict Logic", () => {
    it("handles exact and transposed Date of Birth", () => {
      // Exact
      const exact = compareDob("2003-05-12", "2003-05-12");
      expect(exact.score).toBe(1.0);
      expect(exact.status).toBe("exact");

      // Transposed day and month: 2003-05-12 vs 2003-12-05
      const transposed = compareDob("2003-05-12", "2003-12-05");
      expect(transposed.score).toBe(0.85);
      expect(transposed.status).toBe("transposed");
      expect(transposed.detail).toContain("transposition");

      // Conflicting
      const conflict = compareDob("2003-05-12", "2001-11-20");
      expect(conflict.score).toBe(0.0);
      expect(conflict.status).toBe("mismatch");

      // Missing
      const missing = compareDob(null, "2003-05-12");
      expect(missing.score).toBe(0);
      expect(missing.status).toBe("missing");
    });

    it("compares 10-digit Indian contact numbers and masks output", () => {
      const match = compareContact("+91 98765-43210", "9876543210");
      expect(match.score).toBe(1.0);
      expect(match.status).toBe("exact");
      expect(match.detail).toContain("XXXXXX3210");

      const diff = compareContact("9876543210", "9123456789");
      expect(diff.score).toBe(0.0);
      expect(diff.status).toBe("mismatch");
    });

    it("evaluates matching and related academic programme codes", () => {
      const exact = compareProgrammes("BTECH-CSE", "btech_cse");
      expect(exact.score).toBe(1.0);
      expect(exact.status).toBe("exact");

      const related = compareProgrammes("BTECH-CSE", "BTECH-IT");
      expect(related.score).toBe(0.5);
      expect(related.status).toBe("related");

      const diff = compareProgrammes("BTECH-CSE", "MBA");
      expect(diff.score).toBe(0.0);
      expect(diff.status).toBe("mismatch");
    });
  });

  // ── 3. Explainable Composite Matching ──────────────────────────────────────
  describe("Composite Matching & Missing-Field Handling", () => {
    it("flags two identical records as HIGH_CONFIDENCE match", () => {
      const s1: StudentIdentityRecord = {
        id: "stu-1",
        studentId: "ROLL-101",
        name: "Aarav Sharma",
        dob: "2002-08-15",
        apaarId: "236665564211",
        contact: "9876543210",
        programmeCode: "BTECH-CSE",
        institutionId: "inst-1",
      };

      const s2: StudentIdentityRecord = {
        id: "stu-2",
        studentId: "ROLL-101",
        name: "Aarav Sharma",
        dob: "2002-08-15",
        apaarId: "236665564211",
        contact: "9876543210",
        programmeCode: "BTECH-CSE",
        institutionId: "inst-1",
      };

      const result = evaluateCompositeSimilarity(s1, s2);
      expect(result.confidence).toBe("HIGH_CONFIDENCE");
      expect(result.overallScore).toBeGreaterThanOrEqual(0.95);
      expect(result.matchingAttributes).toContain("Identical APAAR ID");
      expect(result.conflictingAttributes).toHaveLength(0);
    });

    it("explicitly handles missing fields without falsely penalizing available fields", () => {
      const s1: StudentIdentityRecord = {
        id: "stu-1",
        name: "Rohit Verma",
        dob: "2003-04-10",
        apaarId: null, // missing
        contact: null, // missing
      };

      const s2: StudentIdentityRecord = {
        id: "stu-2",
        name: "Rohit Verma",
        dob: "2003-04-10",
        apaarId: null, // missing
        contact: null, // missing
      };

      const result = evaluateCompositeSimilarity(s1, s2);
      // Available weights (Name + DOB) are 100% matched
      expect(result.overallScore).toBeGreaterThanOrEqual(0.9);
      expect(result.missingAttributes).toContain("Student A missing APAAR");
      expect(result.missingAttributes).toContain("Contact detail missing");
    });

    it("flags an IDENTIFIER COLLISION when distinct names share the same APAAR ID", () => {
      // Severe anomaly: Two completely different people share the same 12-digit APAAR
      const s1: StudentIdentityRecord = {
        id: "stu-1",
        name: "Vikram Malhotra",
        dob: "2001-01-10",
        apaarId: "236665564211",
      };

      const s2: StudentIdentityRecord = {
        id: "stu-2",
        name: "Sunita Deshmukh",
        dob: "2004-11-25",
        apaarId: "236665564211",
      };

      const result = evaluateCompositeSimilarity(s1, s2);
      expect(result.isExactCollision).toBe(true);
      expect(result.collisionType).toBe("apaar_collision");
      expect(result.explanation).toContain("IDENTIFIER COLLISION");
    });

    it("does not classify students with same name but completely different DOB as high confidence", () => {
      const s1: StudentIdentityRecord = {
        id: "stu-1",
        name: "Rahul Kumar",
        dob: "1998-05-10",
      };

      const s2: StudentIdentityRecord = {
        id: "stu-2",
        name: "Rahul Kumar",
        dob: "2005-12-25", // 7 years apart
      };

      const result = evaluateCompositeSimilarity(s1, s2);
      expect(result.confidence).not.toBe("HIGH_CONFIDENCE");
      expect(result.overallScore).toBeLessThanOrEqual(0.64);
      expect(result.conflictingAttributes.some((c) => c.includes("Mismatched DOB"))).toBe(true);
    });
  });

  // ── 4. Candidate Generation & Multi-Pass Blocking ──────────────────────────
  describe("Candidate Generation & Multi-Pass Blocking", () => {
    it("generates candidates using blocking keys without evaluating every unlinked pair", () => {
      const cohort: StudentIdentityRecord[] = [
        {
          id: "s1",
          name: "Deepak Sharma",
          dob: "2003-02-14",
          institutionId: "inst-1",
        },
        {
          id: "s2",
          name: "Deepak Sharma",
          dob: "2003-02-14",
          institutionId: "inst-1",
        },
        {
          id: "s3",
          name: "Ananya Iyer",
          dob: "2004-09-20",
          institutionId: "inst-1",
        },
        {
          id: "s4",
          name: "Zoya Akhtar",
          dob: "2001-07-04",
          institutionId: "inst-1",
        },
      ];

      const candidates = generateCandidatePairs(cohort);
      // Only s1 and s2 share blocking keys (DOB: 2003-02-14 and Name Prefix Dee_2003)
      expect(candidates.length).toBe(1);
      expect(candidates[0]!.studentA.id).toBe("s1");
      expect(candidates[0]!.studentB.id).toBe("s2");
    });

    it("respects institution boundary isolation by default", () => {
      const crossInstCohort: StudentIdentityRecord[] = [
        {
          id: "s1",
          name: "Aditya Roy",
          dob: "2002-06-18",
          institutionId: "inst-ALPHA",
        },
        {
          id: "s2",
          name: "Aditya Roy",
          dob: "2002-06-18",
          institutionId: "inst-BETA", // different institution
        },
      ];

      // Default: cross-institution candidate generation disabled for tenant security
      const scopedCandidates = generateCandidatePairs(crossInstCohort, {
        includeCrossInstitution: false,
      });
      expect(scopedCandidates).toHaveLength(0);

      // AICTE Admin mode: cross-institution candidate discovery enabled
      const nationalCandidates = generateCandidatePairs(crossInstCohort, {
        includeCrossInstitution: true,
      });
      expect(nationalCandidates).toHaveLength(1);
    });
  });

  // ── 5. Duplicate Clustering (Disjoint-Set Union) ───────────────────────────
  describe("Duplicate Candidate Clustering", () => {
    it("groups transitively linked duplicate pairs into coherent clusters", () => {
      const sA: StudentIdentityRecord = { id: "A", name: "Kunal Ghosh", dob: "2002-01-01" };
      const sB: StudentIdentityRecord = { id: "B", name: "Kunal Ghosh", dob: "2002-01-01" };
      const sC: StudentIdentityRecord = { id: "C", name: "Ghosh Kunal", dob: "2002-01-01" };

      const pairs = [
        {
          id: "A:B",
          studentA: sA,
          studentB: sB,
          match: evaluateCompositeSimilarity(sA, sB),
          blockingKey: "dob:2002-01-01",
        },
        {
          id: "B:C",
          studentA: sB,
          studentB: sC,
          match: evaluateCompositeSimilarity(sB, sC),
          blockingKey: "dob:2002-01-01",
        },
      ];

      const clusters = clusterDuplicateCandidates(pairs);
      expect(clusters).toHaveLength(1);
      expect(clusters[0]!.clusterSize).toBe(3);
      expect(clusters[0]!.studentIds).toContain("A");
      expect(clusters[0]!.studentIds).toContain("B");
      expect(clusters[0]!.studentIds).toContain("C");
    });

    it("separates disjoint duplicate pairs into distinct clusters", () => {
      const s1: StudentIdentityRecord = { id: "1", name: "Neha Sen", dob: "2003-03-03" };
      const s2: StudentIdentityRecord = { id: "2", name: "Neha Sen", dob: "2003-03-03" };
      const s3: StudentIdentityRecord = { id: "3", name: "Tariq Ali", dob: "2004-04-04" };
      const s4: StudentIdentityRecord = { id: "4", name: "Tariq Ali", dob: "2004-04-04" };

      const pairs = [
        {
          id: "1:2",
          studentA: s1,
          studentB: s2,
          match: evaluateCompositeSimilarity(s1, s2),
          blockingKey: "dob:2003-03-03",
        },
        {
          id: "3:4",
          studentA: s3,
          studentB: s4,
          match: evaluateCompositeSimilarity(s3, s4),
          blockingKey: "dob:2004-04-04",
        },
      ];

      const clusters = clusterDuplicateCandidates(pairs);
      expect(clusters).toHaveLength(2);
    });
  });

  // ── 6. Privacy & Sensitive Data Masking ───────────────────────────────────
  describe("Privacy & Data Protection", () => {
    it("masks 12-digit APAAR IDs while preserving last 4 digits for inspection", () => {
      expect(maskSensitiveValue("236665564211", "apaar")).toBe("XXXXXXXX4211");
      expect(maskSensitiveValue(null, "apaar")).toBe("—");
    });

    it("masks phone numbers and emails", () => {
      expect(maskSensitiveValue("9876543210", "contact")).toBe("XXXXXX3210");
      expect(maskSensitiveValue("student.test@institution.edu", "contact")).toBe(
        "s***t@institution.edu",
      );
    });
  });
});
