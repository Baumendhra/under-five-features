// Fuzzy duplicate detection module using Jaro-Winkler similarity.
// No external dependencies — runs in browser and server environments.

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
};

// ── Jaro-Winkler similarity ────────────────────────────────────────────────

function jaro(s1: string, s2: string): number {
  if (s1 === s2) return 1;
  const len1 = s1.length;
  const len2 = s2.length;
  if (len1 === 0 || len2 === 0) return 0;
  const matchDist = Math.floor(Math.max(len1, len2) / 2) - 1;
  const s1Matches = new Array<boolean>(len1).fill(false);
  const s2Matches = new Array<boolean>(len2).fill(false);
  let matches = 0;
  let transpositions = 0;
  for (let i = 0; i < len1; i++) {
    const lo = Math.max(0, i - matchDist);
    const hi = Math.min(i + matchDist + 1, len2);
    for (let j = lo; j < hi; j++) {
      if (s2Matches[j] || s1[i] !== s2[j]) continue;
      s1Matches[i] = true;
      s2Matches[j] = true;
      matches++;
      break;
    }
  }
  if (matches === 0) return 0;
  let k = 0;
  for (let i = 0; i < len1; i++) {
    if (!s1Matches[i]) continue;
    while (!s2Matches[k]) k++;
    if (s1[i] !== s2[k]) transpositions++;
    k++;
  }
  return (matches / len1 + matches / len2 + (matches - transpositions / 2) / matches) / 3;
}

function jaroWinkler(s1: string, s2: string, p = 0.1): number {
  const jaroScore = jaro(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaroScore + prefix * p * (1 - jaroScore);
}

// ── Normalization helpers ──────────────────────────────────────────────────

function normName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normApaar(id: string | null): string | null {
  if (!id) return null;
  const c = id.replace(/[^0-9]/g, "");
  return c.length === 12 ? c : null;
}

// ── Core duplicate detector ────────────────────────────────────────────────

const FUZZY_THRESHOLD = 0.88; // JW score ≥ this → probable duplicate

/**
 * Detect duplicate pairs in a list of students.
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
        const score = jaroWinkler(nameA, nameB);
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
 * Useful for showing "review groups" in the UI.
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
