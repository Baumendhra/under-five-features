// Advanced Identity Resolution & Duplicate Detection Module
// Supports both legacy fast scanning and multi-algorithm composite identity resolution.
// No external dependencies — runs in browser and server environments.

export * from "@/lib/identity-resolution";

import {
  jaroWinklerSimilarity,
  normalizeText,
  compareNames,
  compareDob,
  maskSensitiveValue,
} from "@/lib/identity-resolution";

export type DuplicatePair = {
  indexA: number;
  indexB: number;
  reason: "apaar_exact" | "name_dob_exact" | "fuzzy_name_dob";
  score: number; // 0–1, higher = more similar
  detail: string;
};

export type StudentMinimal = {
  index: number; // position in array
  apaarId: string | null;
  name: string;
  dob: string | null;
  id?: string | undefined;
  contact?: string | null | undefined;
  programmeCode?: string | null | undefined;
  studentId?: string | null | undefined;
};

// ── Normalization helpers ──────────────────────────────────────────────────

function normName(name: string): string {
  return normalizeText(name);
}

function normApaar(id: string | null | undefined): string | null {
  if (!id) return null;
  const c = id.replace(/[^0-9]/g, "");
  return c.length === 12 ? c : null;
}

// ── Legacy Duplicate Detector (Preserved for Backwards Compatibility) ─────

const FUZZY_THRESHOLD = 0.88; // JW score ≥ this → probable duplicate

/**
 * Detect duplicate pairs in a list of students.
 * Preserved for backwards compatibility with existing views and tests.
 * Checks:
 *  1. Exact APAAR ID match
 *  2. Exact normalised name + DOB match
 *  3. Fuzzy name match (JW ≥ threshold) with same DOB
 */
export function detectDuplicates(students: StudentMinimal[]): DuplicatePair[] {
  const pairs: DuplicatePair[] = [];
  const seen = new Set<string>();

  for (let i = 0; i < students.length; i++) {
    for (let j = i + 1; j < students.length; j++) {
      const a = students[i]!;
      const b = students[j]!;
      const key = `${i}:${j}`;
      if (seen.has(key)) continue;

      // 1. Exact APAAR duplicate
      const apaarA = normApaar(a.apaarId);
      const apaarB = normApaar(b.apaarId);
      if (apaarA && apaarB && apaarA === apaarB) {
        pairs.push({
          indexA: i,
          indexB: j,
          reason: "apaar_exact",
          score: 1,
          detail: `Same APAAR ID: ${apaarA}`,
        });
        seen.add(key);
        continue;
      }

      // 2. Exact name + DOB
      const nameA = normName(a.name);
      const nameB = normName(b.name);
      if (nameA && nameB && a.dob && b.dob && nameA === nameB && a.dob === b.dob) {
        pairs.push({
          indexA: i,
          indexB: j,
          reason: "name_dob_exact",
          score: 1,
          detail: `Same name and DOB: ${a.name}, ${a.dob}`,
        });
        seen.add(key);
        continue;
      }

      // 3. Fuzzy name + same DOB
      if (a.dob && b.dob && a.dob === b.dob && nameA && nameB) {
        const score = jaroWinklerSimilarity(nameA, nameB);
        if (score >= FUZZY_THRESHOLD) {
          pairs.push({
            indexA: i,
            indexB: j,
            reason: "fuzzy_name_dob",
            score,
            detail: `Similar names (${(score * 100).toFixed(0)}% match) with same DOB: "${a.name}" vs "${b.name}"`,
          });
          seen.add(key);
        }
      }
    }
  }
  return pairs;
}

/**
 * Group duplicate pairs into clusters of related student indices.
 * Preserved for backwards compatibility.
 */
export function clusterDuplicates(pairs: DuplicatePair[]): Set<number>[] {
  const parent = new Map<number, number>();

  function find(x: number): number {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p !== x) {
      const root = find(p);
      parent.set(x, root);
      return root;
    }
    return x;
  }

  function union(a: number, b: number) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  for (const { indexA, indexB } of pairs) {
    union(indexA, indexB);
  }

  const clusters = new Map<number, Set<number>>();
  for (const [node] of parent) {
    const root = find(node);
    if (!clusters.has(root)) clusters.set(root, new Set());
    clusters.get(root)!.add(node);
  }
  return [...clusters.values()].filter((c) => c.size > 1);
}
