/**
 * Advanced Identity Resolution & Multi-Algorithm Duplicate Management Engine
 * for EduTrace (SIH26263).
 *
 * Implements:
 * 1. Multi-pass candidate blocking (avoiding O(N^2) combinatorial explosion).
 * 2. Multi-algorithm name similarity (Jaro-Winkler, Normalized Levenshtein, Token Sort, Phonetic).
 * 3. Explainable composite matching with transparent field scores & missing-value handling.
 * 4. Identifier collision alerts (e.g. distinct identities sharing the same APAAR ID).
 * 5. Disjoint-Set Union (DSU) duplicate clustering.
 * 6. Privacy-preserving sensitive data masking.
 */

// ── Types & Interfaces ─────────────────────────────────────────────────────

export type ConfidenceCategory =
  "HIGH_CONFIDENCE" | "REVIEW_RECOMMENDED" | "LOW_CONFIDENCE" | "NO_MATCH";

export interface StudentIdentityRecord {
  id: string;
  studentId?: string | null | undefined; // institution-scoped roll number
  apaarId?: string | null | undefined;
  name: string;
  dob?: string | null | undefined;
  gender?: string | null | undefined;
  contact?: string | null | undefined;
  category?: string | null | undefined;
  programmeCode?: string | null | undefined;
  admissionYear?: number | string | null | undefined;
  institutionId?: string | null | undefined;
}

export interface FieldComparisonResult {
  score: number; // 0.0 to 1.0
  weight: number; // Configured weight
  isAvailable: boolean; // False if either record lacks this field
  detail: string;
}

export interface CompositeMatchResult {
  overallScore: number; // 0.0 to 1.0
  percentage: number; // 0 to 100
  confidence: ConfidenceCategory;
  fieldScores: {
    name: FieldComparisonResult & {
      jaroWinkler: number;
      levenshtein: number;
      tokenSimilarity: number;
      phoneticMatch: boolean;
    };
    dob: FieldComparisonResult & {
      status: "exact" | "transposed" | "adjacent_day" | "mismatch" | "missing";
    };
    identifier: FieldComparisonResult & {
      status: "exact_apaar" | "exact_roll" | "mismatch" | "missing";
    };
    contact: FieldComparisonResult & {
      status: "exact" | "mismatch" | "missing";
    };
    programme: FieldComparisonResult & {
      status: "exact" | "related" | "mismatch" | "missing";
    };
  };
  matchingAttributes: string[];
  conflictingAttributes: string[];
  missingAttributes: string[];
  explanation: string;
  isExactCollision: boolean;
  collisionType?: "apaar_collision" | "roll_collision" | undefined;
}

export interface ScoredDuplicatePair {
  id: string; // unique pair id e.g. "stu1:stu2"
  studentA: StudentIdentityRecord;
  studentB: StudentIdentityRecord;
  match: CompositeMatchResult;
  blockingKey: string;
}

export interface DuplicateCluster {
  clusterId: string;
  studentIds: string[];
  records: StudentIdentityRecord[];
  pairs: ScoredDuplicatePair[];
  clusterSize: number;
  highestConfidence: ConfidenceCategory;
  summary: string;
}

export interface CompositeWeights {
  name: number;
  dob: number;
  identifier: number;
  contact: number;
  programme: number;
}

export const DEFAULT_COMPOSITE_WEIGHTS: CompositeWeights = {
  name: 0.4,
  dob: 0.3,
  identifier: 0.15,
  contact: 0.1,
  programme: 0.05,
};

// ── Privacy Masking ────────────────────────────────────────────────────────

/**
 * Masks sensitive identifiers to preserve privacy in UI and logs.
 * APAAR: XXXXXXXX1234
 * Phone: XXXXXX4321
 */
export function maskSensitiveValue(
  value: string | null | undefined,
  type: "apaar" | "contact" | "generic" = "generic",
): string {
  if (!value) return "—";
  const cleaned = value.trim();
  if (type === "apaar") {
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length === 12) {
      return `XXXXXXXX${digits.slice(8)}`;
    }
  }
  if (type === "contact") {
    if (cleaned.includes("@")) {
      const [user, domain] = cleaned.split("@");
      if (user && domain) {
        const maskedUser =
          user.length <= 2 ? `${user[0]}*` : `${user[0]}***${user[user.length - 1]}`;
        return `${maskedUser}@${domain}`;
      }
    }
    const digits = cleaned.replace(/\D/g, "");
    if (digits.length >= 10) {
      return `XXXXXX${digits.slice(-4)}`;
    }
  }
  if (cleaned.length <= 4) return "****";
  return `${cleaned.slice(0, 2)}***${cleaned.slice(-2)}`;
}

// ── String & Normalization Algorithms ──────────────────────────────────────

export function normalizeText(text: string | null | undefined): string {
  if (!text) return "";
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Strips common Indian honorifics and prefixes to prevent skewed name distances.
 */
export function stripHonorifics(name: string): string {
  const honorifics = [
    "mr",
    "mr.",
    "mrs",
    "mrs.",
    "ms",
    "ms.",
    "miss",
    "sh",
    "sh.",
    "shri",
    "smt",
    "smt.",
    "dr",
    "dr.",
    "prof",
    "prof.",
  ];
  const tokens = name.toLowerCase().split(/\s+/);
  const filtered = tokens.filter((t) => !honorifics.includes(t.replace(/[^a-z]/g, "")));
  return filtered.join(" ").trim();
}

// 1. Jaro & Jaro-Winkler Similarity
export function jaroSimilarity(s1: string, s2: string): number {
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

export function jaroWinklerSimilarity(s1: string, s2: string, prefixScale = 0.1): number {
  const jaroScore = jaroSimilarity(s1, s2);
  let prefix = 0;
  for (let i = 0; i < Math.min(4, Math.min(s1.length, s2.length)); i++) {
    if (s1[i] === s2[i]) prefix++;
    else break;
  }
  return jaroScore + prefix * prefixScale * (1 - jaroScore);
}

// 2. Levenshtein Distance & Normalized Score
export function levenshteinDistance(s1: string, s2: string): number {
  if (s1 === s2) return 0;
  if (s1.length === 0) return s2.length;
  if (s2.length === 0) return s1.length;

  let v0 = new Int32Array(s2.length + 1);
  let v1 = new Int32Array(s2.length + 1);

  for (let i = 0; i <= s2.length; i++) {
    v0[i] = i;
  }

  for (let i = 0; i < s1.length; i++) {
    v1[0] = i + 1;
    for (let j = 0; j < s2.length; j++) {
      const cost = s1[i] === s2[j] ? 0 : 1;
      v1[j + 1] = Math.min(v1[j]! + 1, v0[j + 1]! + 1, v0[j]! + cost);
    }
    const temp = v0;
    v0 = v1;
    v1 = temp;
  }

  return v0[s2.length]!;
}

export function normalizedLevenshteinSimilarity(s1: string, s2: string): number {
  const maxLen = Math.max(s1.length, s2.length);
  if (maxLen === 0) return 1.0;
  const dist = levenshteinDistance(s1, s2);
  return Math.max(0, 1 - dist / maxLen);
}

// 3. Token-based Sort & Set Similarity (Handles Reordered Names)
export function tokenSortSimilarity(s1: string, s2: string): number {
  const tokens1 = s1.split(/\s+/).filter(Boolean).sort().join(" ");
  const tokens2 = s2.split(/\s+/).filter(Boolean).sort().join(" ");

  if (tokens1 === tokens2) return 1.0;

  // Compute Jaro-Winkler on sorted strings
  const jwSorted = jaroWinklerSimilarity(tokens1, tokens2);

  // Compute Token Jaccard overlap
  const set1 = new Set(s1.split(/\s+/).filter(Boolean));
  const set2 = new Set(s2.split(/\s+/).filter(Boolean));
  let intersection = 0;
  for (const t of set1) {
    if (set2.has(t)) intersection++;
  }
  const union = new Set([...set1, ...set2]).size;
  const jaccard = union === 0 ? 0 : intersection / union;

  return Math.max(jwSorted, jaccard);
}

// 4. Phonetic Encoding (Soundex)
export function soundex(text: string): string {
  const clean = text.toUpperCase().replace(/[^A-Z]/g, "");
  if (!clean) return "0000";

  const charMap: Record<string, string> = {
    B: "1",
    F: "1",
    P: "1",
    V: "1",
    C: "2",
    G: "2",
    J: "2",
    K: "2",
    Q: "2",
    S: "2",
    X: "2",
    Z: "2",
    D: "3",
    T: "3",
    L: "4",
    M: "5",
    N: "5",
    R: "6",
  };

  let result = clean[0]!;
  let prevCode = charMap[clean[0]!] ?? "0";

  for (let i = 1; i < clean.length && result.length < 4; i++) {
    const ch = clean[i]!;
    const code = charMap[ch] ?? "0";

    if (code !== "0" && code !== prevCode) {
      result += code;
    }
    prevCode = code;
  }

  return result.padEnd(4, "0");
}

// ── Multi-Algorithm Name Comparison ────────────────────────────────────────

export function compareNames(
  nameA: string,
  nameB: string,
): {
  score: number;
  jaroWinkler: number;
  levenshtein: number;
  tokenSimilarity: number;
  phoneticMatch: boolean;
  explanation: string;
} {
  const cleanA = stripHonorifics(normalizeText(nameA));
  const cleanB = stripHonorifics(normalizeText(nameB));

  if (!cleanA || !cleanB) {
    return {
      score: 0,
      jaroWinkler: 0,
      levenshtein: 0,
      tokenSimilarity: 0,
      phoneticMatch: false,
      explanation: "One or both student names are missing.",
    };
  }

  if (cleanA === cleanB) {
    return {
      score: 1.0,
      jaroWinkler: 1.0,
      levenshtein: 1.0,
      tokenSimilarity: 1.0,
      phoneticMatch: true,
      explanation: "Exact normalized name match.",
    };
  }

  const jw = jaroWinklerSimilarity(cleanA, cleanB);
  const lev = normalizedLevenshteinSimilarity(cleanA, cleanB);
  const tokenSim = tokenSortSimilarity(cleanA, cleanB);

  // Phonetic check on first and last tokens
  const tokensA = cleanA.split(" ");
  const tokensB = cleanB.split(" ");
  const soundexAFirst = soundex(tokensA[0] ?? "");
  const soundexBFirst = soundex(tokensB[0] ?? "");
  const soundexALast = soundex(tokensA[tokensA.length - 1] ?? "");
  const soundexBLast = soundex(tokensB[tokensB.length - 1] ?? "");
  const phoneticMatch =
    (soundexAFirst === soundexBFirst && soundexAFirst !== "0000") ||
    (soundexALast === soundexBLast && soundexALast !== "0000");

  // Composite name score: Maximize reordering signal if tokens match
  let compositeNameScore = Math.max(jw, tokenSim);

  // If token similarity is very high (reordered name like "Patel Aarav" vs "Aarav Patel")
  if (tokenSim >= 0.95) {
    compositeNameScore = tokenSim;
  } else {
    // Weighted blend of JW, Levenshtein, and Token
    compositeNameScore = jw * 0.5 + lev * 0.25 + tokenSim * 0.25;
  }

  // Small auxiliary boost if phonetic matches and score is already moderate
  if (phoneticMatch && compositeNameScore >= 0.7 && compositeNameScore < 0.95) {
    compositeNameScore = Math.min(1.0, compositeNameScore + 0.05);
  }

  const roundedScore = Math.round(compositeNameScore * 100) / 100;

  let explanation = `Name similarity: ${(roundedScore * 100).toFixed(0)}%`;
  if (tokenSim > jw && tokenSim >= 0.9) {
    explanation += " (Name tokens appear reordered or inverted)";
  } else if (phoneticMatch) {
    explanation += " (Phonetically similar components detected)";
  }

  return {
    score: roundedScore,
    jaroWinkler: Math.round(jw * 100) / 100,
    levenshtein: Math.round(lev * 100) / 100,
    tokenSimilarity: Math.round(tokenSim * 100) / 100,
    phoneticMatch,
    explanation,
  };
}

// ── Demographic Comparison ─────────────────────────────────────────────────

export function compareDob(
  dobA: string | null | undefined,
  dobB: string | null | undefined,
): {
  score: number;
  status: "exact" | "transposed" | "adjacent_day" | "mismatch" | "missing";
  detail: string;
} {
  if (!dobA || !dobB) {
    return {
      score: 0,
      status: "missing",
      detail: "Date of birth missing on one or both records.",
    };
  }

  const cleanA = dobA.trim().slice(0, 10);
  const cleanB = dobB.trim().slice(0, 10);

  if (cleanA === cleanB) {
    return {
      score: 1.0,
      status: "exact",
      detail: `Exact matching date of birth: ${cleanA}`,
    };
  }

  // Check day-month transposition: e.g. YYYY-MM-DD vs YYYY-DD-MM
  const partsA = cleanA.split(/[-/]/);
  const partsB = cleanB.split(/[-/]/);

  if (partsA.length === 3 && partsB.length === 3) {
    const [yA, mA, dA] = partsA;
    const [yB, mB, dB] = partsB;

    if (yA === yB && mA === dB && dA === mB) {
      return {
        score: 0.85,
        status: "transposed",
        detail: `Likely date transposition (day/month flipped): ${cleanA} vs ${cleanB}`,
      };
    }

    // Check adjacent day within same month and year
    if (yA === yB && mA === mB) {
      const diffDays = Math.abs(parseInt(dA ?? "0", 10) - parseInt(dB ?? "0", 10));
      if (diffDays === 1) {
        return {
          score: 0.7,
          status: "adjacent_day",
          detail: `Close date (1 day difference): ${cleanA} vs ${cleanB}`,
        };
      }
    }
  }

  return {
    score: 0.0,
    status: "mismatch",
    detail: `Conflicting dates of birth: ${cleanA} vs ${cleanB}`,
  };
}

export function compareContact(
  contactA: string | null | undefined,
  contactB: string | null | undefined,
): {
  score: number;
  status: "exact" | "mismatch" | "missing";
  detail: string;
} {
  if (!contactA || !contactB) {
    return {
      score: 0,
      status: "missing",
      detail: "Contact detail missing on one or both records.",
    };
  }

  const digitsA = contactA.replace(/\D/g, "").slice(-10);
  const digitsB = contactB.replace(/\D/g, "").slice(-10);

  if (digitsA.length === 10 && digitsB.length === 10) {
    if (digitsA === digitsB) {
      return {
        score: 1.0,
        status: "exact",
        detail: `Exact matching 10-digit mobile: ${maskSensitiveValue(digitsA, "contact")}`,
      };
    }
    return {
      score: 0.0,
      status: "mismatch",
      detail: `Different mobile numbers: ${maskSensitiveValue(digitsA, "contact")} vs ${maskSensitiveValue(digitsB, "contact")}`,
    };
  }

  // Fallback for email comparison
  if (contactA.includes("@") && contactB.includes("@")) {
    const isSameEmail = contactA.trim().toLowerCase() === contactB.trim().toLowerCase();
    return {
      score: isSameEmail ? 1.0 : 0.0,
      status: isSameEmail ? "exact" : "mismatch",
      detail: isSameEmail
        ? `Exact matching email: ${maskSensitiveValue(contactA, "contact")}`
        : `Different email addresses: ${maskSensitiveValue(contactA, "contact")} vs ${maskSensitiveValue(contactB, "contact")}`,
    };
  }

  return {
    score: 0.0,
    status: "mismatch",
    detail: "Non-matching contact formats.",
  };
}

export function compareProgrammes(
  progA: string | null | undefined,
  progB: string | null | undefined,
): {
  score: number;
  status: "exact" | "related" | "mismatch" | "missing";
  detail: string;
} {
  if (!progA || !progB) {
    return {
      score: 0,
      status: "missing",
      detail: "Programme code missing on one or both records.",
    };
  }

  const pA = progA
    .trim()
    .toUpperCase()
    .replace(/[\s._-]+/g, "");
  const pB = progB
    .trim()
    .toUpperCase()
    .replace(/[\s._-]+/g, "");

  if (pA === pB) {
    return {
      score: 1.0,
      status: "exact",
      detail: `Same academic programme: ${progA}`,
    };
  }

  // Related branch check (e.g. BTECHCSE vs BTECHIT)
  if (
    (pA.startsWith("BTECH") && pB.startsWith("BTECH")) ||
    (pA.startsWith("BE") && pB.startsWith("BE"))
  ) {
    return {
      score: 0.5,
      status: "related",
      detail: `Related technical branches: ${progA} vs ${progB}`,
    };
  }

  return {
    score: 0.0,
    status: "mismatch",
    detail: `Different programmes: ${progA} vs ${progB}`,
  };
}

// ── Composite Matching Engine ──────────────────────────────────────────────

export function evaluateCompositeSimilarity(
  studentA: StudentIdentityRecord,
  studentB: StudentIdentityRecord,
  customWeights: Partial<CompositeWeights> = {},
): CompositeMatchResult {
  const weights: CompositeWeights = {
    ...DEFAULT_COMPOSITE_WEIGHTS,
    ...customWeights,
  };

  const matchingAttributes: string[] = [];
  const conflictingAttributes: string[] = [];
  const missingAttributes: string[] = [];

  // 1. Exact Identifier Comparison (APAAR & Institutional Roll)
  const normApaarA = studentA.apaarId?.replace(/\D/g, "") ?? "";
  const normApaarB = studentB.apaarId?.replace(/\D/g, "") ?? "";
  const isApaarMatch =
    normApaarA.length === 12 && normApaarB.length === 12 && normApaarA === normApaarB;

  const rollA = studentA.studentId?.trim().toLowerCase() ?? "";
  const rollB = studentB.studentId?.trim().toLowerCase() ?? "";
  const isRollMatch = rollA && rollB && rollA === rollB;

  let identifierScore = 0;
  let identifierStatus: "exact_apaar" | "exact_roll" | "mismatch" | "missing" = "missing";
  let identifierDetail = "No institutional identifiers provided.";
  let hasIdentifier = false;

  if (isApaarMatch) {
    identifierScore = 1.0;
    identifierStatus = "exact_apaar";
    identifierDetail = `Exact APAAR ID collision: ${maskSensitiveValue(normApaarA, "apaar")}`;
    hasIdentifier = true;
    matchingAttributes.push("Identical APAAR ID");
  } else if (isRollMatch) {
    identifierScore = 1.0;
    identifierStatus = "exact_roll";
    identifierDetail = `Exact Institutional Student ID / Roll: ${studentA.studentId}`;
    hasIdentifier = true;
    matchingAttributes.push("Identical Student Roll Number");
  } else if (normApaarA.length === 12 && normApaarB.length === 12 && normApaarA !== normApaarB) {
    identifierScore = 0.0;
    identifierStatus = "mismatch";
    identifierDetail = `Different APAAR IDs: ${maskSensitiveValue(normApaarA, "apaar")} vs ${maskSensitiveValue(normApaarB, "apaar")}`;
    hasIdentifier = true;
    conflictingAttributes.push("Conflicting APAAR IDs");
  } else {
    if (!normApaarA) missingAttributes.push("Student A missing APAAR");
    if (!normApaarB) missingAttributes.push("Student B missing APAAR");
  }

  // 2. Name Comparison
  const nameComparison = compareNames(studentA.name, studentB.name);
  if (nameComparison.score >= 0.88) {
    matchingAttributes.push(`Name similarity (${(nameComparison.score * 100).toFixed(0)}%)`);
  } else if (nameComparison.score < 0.4) {
    conflictingAttributes.push(`Distinct student names: "${studentA.name}" vs "${studentB.name}"`);
  }

  // 3. Date of Birth Comparison
  const dobComparison = compareDob(studentA.dob, studentB.dob);
  if (dobComparison.status === "exact") {
    matchingAttributes.push(`Identical DOB (${studentA.dob})`);
  } else if (dobComparison.status === "transposed") {
    matchingAttributes.push("Transposed DOB (day/month inverted)");
  } else if (dobComparison.status === "mismatch") {
    conflictingAttributes.push(`Mismatched DOB: ${studentA.dob} vs ${studentB.dob}`);
  } else {
    missingAttributes.push("Date of birth not recorded on one or both records");
  }

  // 4. Contact Comparison
  const contactComparison = compareContact(studentA.contact, studentB.contact);
  if (contactComparison.status === "exact") {
    matchingAttributes.push("Identical contact number");
  } else if (contactComparison.status === "mismatch") {
    conflictingAttributes.push("Different contact numbers");
  } else {
    missingAttributes.push("Contact detail missing");
  }

  // 5. Programme Comparison
  const progComparison = compareProgrammes(studentA.programmeCode, studentB.programmeCode);
  if (progComparison.status === "exact") {
    matchingAttributes.push(`Same programme (${studentA.programmeCode})`);
  } else if (progComparison.status === "mismatch") {
    conflictingAttributes.push(
      `Different programme codes: ${studentA.programmeCode} vs ${studentB.programmeCode}`,
    );
  }

  // ── Severe Identifier Collision Check ──────────────────────────────────────
  // If two records share an identical unique identifier (APAAR or Roll) but have
  // conflicting DOBs or substantially distinct names, this represents an anomaly/collision,
  // NOT a valid duplicate person!
  const isSevereCollision: boolean = Boolean(
    (isApaarMatch || isRollMatch) &&
    (dobComparison.status === "mismatch" || nameComparison.score < 0.65) &&
    nameComparison.score < 0.8,
  );

  // ── Calculate Weighted Composite Score ─────────────────────────────────────
  // Explicit missing-value handling: calculate effective available weight
  let totalAvailableWeight = 0;
  let earnedScore = 0;

  // Name (always present in valid student records)
  totalAvailableWeight += weights.name;
  earnedScore += weights.name * nameComparison.score;

  // DOB
  if (dobComparison.status !== "missing") {
    totalAvailableWeight += weights.dob;
    earnedScore += weights.dob * dobComparison.score;
  }

  // Identifier
  if (hasIdentifier) {
    totalAvailableWeight += weights.identifier;
    earnedScore += weights.identifier * identifierScore;
  }

  // Contact
  if (contactComparison.status !== "missing") {
    totalAvailableWeight += weights.contact;
    earnedScore += weights.contact * contactComparison.score;
  }

  // Programme
  if (progComparison.status !== "missing") {
    totalAvailableWeight += weights.programme;
    earnedScore += weights.programme * progComparison.score;
  }

  // Normalized overall score across available dimensions
  let overallScore = totalAvailableWeight > 0 ? earnedScore / totalAvailableWeight : 0;

  // Exact APAAR match on consistent names overrides to high match
  if (isApaarMatch && nameComparison.score >= 0.6) {
    overallScore = Math.max(overallScore, 0.98);
  }

  // Exact Name + Exact DOB overrides to high match
  if (nameComparison.score >= 0.98 && dobComparison.status === "exact") {
    overallScore = Math.max(overallScore, 0.95);
  }

  // Penalty if critical DOB is conflicting
  if (dobComparison.status === "mismatch" && !isApaarMatch) {
    overallScore = Math.min(overallScore, 0.64);
  }

  // Identifier collision override
  if (isSevereCollision) {
    overallScore = 0.5; // flagged as collision, not resolved duplicate
  }

  const roundedOverall = Math.round(overallScore * 100) / 100;
  const percentage = Math.round(roundedOverall * 100);

  // Confidence Category Assignment
  let confidence: ConfidenceCategory = "NO_MATCH";
  if (isSevereCollision) {
    confidence = "REVIEW_RECOMMENDED";
  } else if (roundedOverall >= 0.85 || isApaarMatch) {
    confidence = "HIGH_CONFIDENCE";
  } else if (roundedOverall >= 0.65) {
    confidence = "REVIEW_RECOMMENDED";
  } else if (roundedOverall >= 0.45) {
    confidence = "LOW_CONFIDENCE";
  } else {
    confidence = "NO_MATCH";
  }

  let explanation = "";
  if (isSevereCollision) {
    explanation = `IDENTIFIER COLLISION: Both records share identical ${isApaarMatch ? "APAAR ID" : "Roll Number"}, but possess completely distinct personal demographic names ("${studentA.name}" vs "${studentB.name}"). Potential administrative or import mistake.`;
  } else if (confidence === "HIGH_CONFIDENCE") {
    explanation = `Strong duplicate candidate (${percentage}%). ${matchingAttributes.join(", ")}. Human verification recommended before linking.`;
  } else if (confidence === "REVIEW_RECOMMENDED") {
    explanation = `Probable duplicate requiring institutional review (${percentage}%). ${matchingAttributes.length > 0 ? `Matches: ${matchingAttributes.join(", ")}. ` : ""}${conflictingAttributes.length > 0 ? `Conflicts: ${conflictingAttributes.join(", ")}.` : ""}`;
  } else if (confidence === "LOW_CONFIDENCE") {
    explanation = `Weak similarity (${percentage}%). Shared common traits but conflicting key demographic fields.`;
  } else {
    explanation = `No significant identity match (${percentage}%). Records appear to represent distinct students.`;
  }

  return {
    overallScore: roundedOverall,
    percentage,
    confidence,
    fieldScores: {
      name: {
        score: nameComparison.score,
        weight: weights.name,
        isAvailable: true,
        detail: nameComparison.explanation,
        jaroWinkler: nameComparison.jaroWinkler,
        levenshtein: nameComparison.levenshtein,
        tokenSimilarity: nameComparison.tokenSimilarity,
        phoneticMatch: nameComparison.phoneticMatch,
      },
      dob: {
        score: dobComparison.score,
        weight: weights.dob,
        isAvailable: dobComparison.status !== "missing",
        detail: dobComparison.detail,
        status: dobComparison.status,
      },
      identifier: {
        score: identifierScore,
        weight: weights.identifier,
        isAvailable: hasIdentifier,
        detail: identifierDetail,
        status: identifierStatus,
      },
      contact: {
        score: contactComparison.score,
        weight: weights.contact,
        isAvailable: contactComparison.status !== "missing",
        detail: contactComparison.detail,
        status: contactComparison.status,
      },
      programme: {
        score: progComparison.score,
        weight: weights.programme,
        isAvailable: progComparison.status !== "missing",
        detail: progComparison.detail,
        status: progComparison.status,
      },
    },
    matchingAttributes,
    conflictingAttributes,
    missingAttributes,
    explanation,
    isExactCollision: isSevereCollision,
    collisionType: isSevereCollision
      ? isApaarMatch
        ? "apaar_collision"
        : "roll_collision"
      : undefined,
  };
}

// ── Multi-Pass Candidate Generation & Blocking ─────────────────────────────

export interface BlockingOptions {
  maxBlockSize?: number;
  includeCrossInstitution?: boolean;
}

/**
 * Generates candidate student pairs using multi-pass blocking keys.
 * Reduces O(N^2) pairwise comparisons by partitioning records into candidate buckets.
 */
export function generateCandidatePairs(
  students: StudentIdentityRecord[],
  options: BlockingOptions = {},
): ScoredDuplicatePair[] {
  const maxBlock = options.maxBlockSize ?? 250;
  const blocks = new Map<string, StudentIdentityRecord[]>();

  function addToBlock(key: string, record: StudentIdentityRecord) {
    if (!key || key.endsWith(":") || key.endsWith("_")) return;
    if (!blocks.has(key)) blocks.set(key, []);
    blocks.get(key)!.push(record);
  }

  // 1. Assign multiple blocking keys to each student
  for (const s of students) {
    const normName = stripHonorifics(normalizeText(s.name));
    const tokens = normName.split(" ").filter(Boolean);
    const prefix3 = tokens[0]?.slice(0, 3) ?? "";
    const cleanDob = s.dob?.trim().slice(0, 10);
    const birthYear = cleanDob?.split(/[-/]/)[0] ?? "";

    // Key 1: Exact APAAR
    const apaarDigits = s.apaarId?.replace(/\D/g, "");
    if (apaarDigits && apaarDigits.length === 12) {
      addToBlock(`apaar:${apaarDigits}`, s);
    }

    // Key 2: Exact DOB
    if (cleanDob && cleanDob.length >= 8) {
      addToBlock(`dob:${cleanDob}`, s);
    }

    // Key 3: First 3 letters of Name + Birth Year
    if (prefix3.length >= 3 && birthYear.length === 4) {
      addToBlock(`name_by:${prefix3}_${birthYear}`, s);
    }

    // Key 4: Soundex of First Name + Programme Code
    if (tokens[0] && s.programmeCode) {
      const sndx = soundex(tokens[0]);
      const progClean = s.programmeCode
        .trim()
        .toUpperCase()
        .replace(/[\s._-]+/g, "");
      addToBlock(`sndx_prog:${sndx}_${progClean}`, s);
    }

    // Key 5: Exact Institutional Roll Number
    if (s.studentId && s.studentId.trim().length > 2) {
      addToBlock(`roll:${s.studentId.trim().toLowerCase()}`, s);
    }

    // Key 6: Last 8 digits of Contact
    if (s.contact) {
      const contactDigits = s.contact.replace(/\D/g, "");
      if (contactDigits.length >= 8) {
        addToBlock(`contact:${contactDigits.slice(-8)}`, s);
      }
    }
  }

  // 2. Evaluate candidate pairs within candidate blocks
  const evaluatedPairs = new Map<string, ScoredDuplicatePair>();

  for (const [blockKey, members] of blocks) {
    // Prevent combinatorial explosion on degenerate blocks
    if (members.length > maxBlock) continue;
    if (members.length < 2) continue;

    for (let i = 0; i < members.length; i++) {
      for (let j = i + 1; j < members.length; j++) {
        const studentA = members[i]!;
        const studentB = members[j]!;

        // Check institution isolation unless cross-institution is requested
        if (
          !options.includeCrossInstitution &&
          studentA.institutionId &&
          studentB.institutionId &&
          studentA.institutionId !== studentB.institutionId
        ) {
          continue;
        }

        // Canonical pair key to avoid duplicate evaluations
        const pairId =
          studentA.id < studentB.id
            ? `${studentA.id}:${studentB.id}`
            : `${studentB.id}:${studentA.id}`;

        if (evaluatedPairs.has(pairId)) continue;

        const match = evaluateCompositeSimilarity(studentA, studentB);

        // Filter out records with no meaningful match
        if (match.confidence !== "NO_MATCH" || match.isExactCollision) {
          evaluatedPairs.set(pairId, {
            id: pairId,
            studentA,
            studentB,
            match,
            blockingKey: blockKey,
          });
        }
      }
    }
  }

  return Array.from(evaluatedPairs.values()).sort(
    (a, b) => b.match.overallScore - a.match.overallScore,
  );
}

// ── Disjoint-Set Union (DSU) Duplicate Clustering ──────────────────────────

/**
 * Groups scored duplicate candidate pairs into interconnected duplicate clusters.
 * Avoids assuming every transitive link is identical while preserving pair-level evidence.
 */
export function clusterDuplicateCandidates(pairs: ScoredDuplicatePair[]): DuplicateCluster[] {
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    const p = parent.get(x)!;
    if (p !== x) {
      const root = find(p);
      parent.set(x, root);
      return root;
    }
    return x;
  }

  function union(a: string, b: string) {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  }

  // Only cluster pairs that are HIGH_CONFIDENCE or REVIEW_RECOMMENDED
  const meaningfulPairs = pairs.filter(
    (p) =>
      p.match.confidence === "HIGH_CONFIDENCE" ||
      p.match.confidence === "REVIEW_RECOMMENDED" ||
      p.match.isExactCollision,
  );

  for (const pair of meaningfulPairs) {
    union(pair.studentA.id, pair.studentB.id);
  }

  const clustersMap = new Map<string, { studentIds: Set<string>; pairs: ScoredDuplicatePair[] }>();
  const studentsMap = new Map<string, StudentIdentityRecord>();

  for (const pair of meaningfulPairs) {
    studentsMap.set(pair.studentA.id, pair.studentA);
    studentsMap.set(pair.studentB.id, pair.studentB);

    const root = find(pair.studentA.id);
    if (!clustersMap.has(root)) {
      clustersMap.set(root, { studentIds: new Set(), pairs: [] });
    }
    const cluster = clustersMap.get(root)!;
    cluster.studentIds.add(pair.studentA.id);
    cluster.studentIds.add(pair.studentB.id);
    cluster.pairs.push(pair);
  }

  const result: DuplicateCluster[] = [];

  for (const [rootId, data] of clustersMap) {
    if (data.studentIds.size < 2) continue;

    const studentList = Array.from(data.studentIds).map((id) => studentsMap.get(id)!);

    // Determine highest confidence
    let highestConfidence: ConfidenceCategory = "REVIEW_RECOMMENDED";
    if (data.pairs.some((p) => p.match.confidence === "HIGH_CONFIDENCE")) {
      highestConfidence = "HIGH_CONFIDENCE";
    }

    const hasCollision = data.pairs.some((p) => p.match.isExactCollision);

    const summary = hasCollision
      ? `Cluster of ${data.studentIds.size} records containing an identifier collision alert.`
      : `Cluster of ${data.studentIds.size} linked records with ${highestConfidence.replace(/_/g, " ").toLowerCase()} matches.`;

    result.push({
      clusterId: `cluster-${rootId.slice(0, 8)}`,
      studentIds: Array.from(data.studentIds),
      records: studentList,
      pairs: data.pairs,
      clusterSize: data.studentIds.size,
      highestConfidence,
      summary,
    });
  }

  return result.sort((a, b) => b.clusterSize - a.clusterSize);
}
