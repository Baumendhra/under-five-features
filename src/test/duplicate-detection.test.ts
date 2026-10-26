import { describe, expect, it } from "vitest";
import { detectDuplicates, clusterDuplicates } from "@/lib/duplicate-detection";
import type { StudentMinimal } from "@/lib/duplicate-detection";

const makeStudent = (partial: Partial<StudentMinimal> & { index: number }): StudentMinimal => ({
  apaarId: null,
  name: "Test Student",
  dob: null,
  ...partial,
});

describe("detectDuplicates — exact APAAR match", () => {
  it("flags two students with the same valid 12-digit APAAR ID", () => {
    const students = [
      makeStudent({ index: 0, apaarId: "123456789012", name: "Alice" }),
      makeStudent({ index: 1, apaarId: "123456789012", name: "Alicia" }),
    ];
    const pairs = detectDuplicates(students);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.reason).toBe("apaar_exact");
    expect(pairs[0]!.score).toBe(1);
  });

  it("does not flag students with different APAAR IDs", () => {
    const students = [
      makeStudent({ index: 0, apaarId: "123456789012" }),
      makeStudent({ index: 1, apaarId: "987654321098" }),
    ];
    expect(detectDuplicates(students)).toHaveLength(0);
  });

  it("ignores null or invalid-format APAAR IDs for APAAR-based matching", () => {
    const students = [
      makeStudent({ index: 0, apaarId: null }),
      makeStudent({ index: 1, apaarId: null }),
    ];
    expect(detectDuplicates(students)).toHaveLength(0);
  });

  it("strips prefixes and spaces before comparing APAAR IDs", () => {
    const students = [
      makeStudent({ index: 0, apaarId: "APAAR123456789012" }), // non-numeric prefix → invalid
      makeStudent({ index: 1, apaarId: "123456789012" }),
    ];
    // Both resolve to same 12 digits "123456789012"
    const pairs = detectDuplicates(students);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.reason).toBe("apaar_exact");
  });
});

describe("detectDuplicates — exact name + DOB match", () => {
  it("flags same name and DOB even without APAAR IDs", () => {
    const students = [
      makeStudent({ index: 0, name: "Ananya Iyer", dob: "2005-03-14" }),
      makeStudent({ index: 1, name: "Ananya Iyer", dob: "2005-03-14" }),
    ];
    const pairs = detectDuplicates(students);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.reason).toBe("name_dob_exact");
  });

  it("is case-insensitive for name matching", () => {
    const students = [
      makeStudent({ index: 0, name: "ANANYA IYER", dob: "2005-03-14" }),
      makeStudent({ index: 1, name: "ananya iyer", dob: "2005-03-14" }),
    ];
    const pairs = detectDuplicates(students);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.reason).toBe("name_dob_exact");
  });

  it("does not flag same name with different DOB", () => {
    const students = [
      makeStudent({ index: 0, name: "Ananya Iyer", dob: "2005-03-14" }),
      makeStudent({ index: 1, name: "Ananya Iyer", dob: "2006-05-20" }),
    ];
    expect(detectDuplicates(students)).toHaveLength(0);
  });
});

describe("detectDuplicates — fuzzy name match", () => {
  it("flags very similar names with same DOB", () => {
    const students = [
      makeStudent({ index: 0, name: "Johnathan Smith", dob: "2005-01-01" }),
      makeStudent({ index: 1, name: "Jonathan Smith", dob: "2005-01-01" }),
    ];
    const pairs = detectDuplicates(students);
    expect(pairs).toHaveLength(1);
    expect(pairs[0]!.reason).toBe("fuzzy_name_dob");
    expect(pairs[0]!.score).toBeGreaterThanOrEqual(0.88);
  });

  it("does not flag completely different names", () => {
    const students = [
      makeStudent({ index: 0, name: "Arjun Patel", dob: "2005-01-01" }),
      makeStudent({ index: 1, name: "Priya Kumar", dob: "2005-01-01" }),
    ];
    expect(detectDuplicates(students)).toHaveLength(0);
  });
});

describe("clusterDuplicates", () => {
  it("groups transitively linked pairs into one cluster", () => {
    const pairs = [
      { indexA: 0, indexB: 1, reason: "apaar_exact" as const, score: 1, detail: "x" },
      { indexA: 1, indexB: 2, reason: "apaar_exact" as const, score: 1, detail: "x" },
    ];
    const clusters = clusterDuplicates(pairs);
    expect(clusters).toHaveLength(1);
    expect(clusters[0]!.size).toBe(3);
    expect(clusters[0]!.has(0)).toBe(true);
    expect(clusters[0]!.has(2)).toBe(true);
  });

  it("produces separate clusters for unrelated pairs", () => {
    const pairs = [
      { indexA: 0, indexB: 1, reason: "apaar_exact" as const, score: 1, detail: "x" },
      { indexA: 3, indexB: 4, reason: "name_dob_exact" as const, score: 1, detail: "y" },
    ];
    const clusters = clusterDuplicates(pairs);
    expect(clusters).toHaveLength(2);
  });
});
