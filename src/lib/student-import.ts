// Client-safe student import helpers: CSV parsing, APAAR validation and
// duplicate detection. No browser APIs — usable from any route or test.

export type ParsedStudent = {
  rowNumber: number;
  studentId: string | null;
  apaarId: string | null;
  name: string;
  dob: string | null;
  programmeCode: string | null;
  category: string | null;
  intakeType: string | null;
  contact: string | null;
};

export type ImportStatus =
  | "valid"
  | "duplicate_db"
  | "duplicate_file"
  | "missing_apaar"
  | "invalid_apaar"
  | "missing_name";

export type ReviewedStudent = ParsedStudent & {
  status: ImportStatus;
  detail: string;
};

export type ExistingStudentRef = {
  apaar_id: string | null;
  name: string;
  dob: string | null;
};

const APAAR_RE = /^\d{12}$/;

export function normalizeApaar(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const cleaned = raw.replace(/[\s-]/g, "");
  return cleaned === "" ? null : cleaned;
}

/** verified = 12 digits; missing = empty; invalid = present but wrong format */
export function apaarStatus(raw: string | null | undefined): "verified" | "missing" | "invalid" {
  const normalized = normalizeApaar(raw);
  if (normalized === null) return "missing";
  return APAAR_RE.test(normalized) ? "verified" : "invalid";
}

function clean(value: string | undefined): string | null {
  if (value === undefined) return null;
  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

export function normalizeName(name: string | null | undefined): string {
  if (!name) return "";
  return name.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Accepts yyyy-mm-dd, dd/mm/yyyy, dd-mm-yyyy; returns yyyy-mm-dd or null. */
export function normalizeDob(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const value = raw.trim();
  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  m = /^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/.exec(value);
  if (m) return `${m[3]}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`;
  return null;
}

/** RFC-4180-ish CSV parser: quoted fields, escaped quotes, CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else if (ch !== "\r") {
      field += ch;
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => r.some((cell) => cell.trim() !== ""));
}

function canonicalHeader(header: string): string {
  return header.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const HEADER_MAP: Record<string, keyof Omit<ParsedStudent, "rowNumber">> = {
  studentid: "studentId",
  studentno: "studentId",
  rollno: "studentId",
  rollnumber: "studentId",
  apaarid: "apaarId",
  apaaridnumber: "apaarId",
  apaar: "apaarId",
  name: "name",
  studentname: "name",
  fullname: "name",
  dob: "dob",
  dateofbirth: "dob",
  programmecode: "programmeCode",
  programme: "programmeCode",
  programcode: "programmeCode",
  program: "programmeCode",
  branch: "programmeCode",
  category: "category",
  caste: "category",
  intake: "intakeType",
  intaketype: "intakeType",
  admissiontype: "intakeType",
  contact: "contact",
  email: "contact",
  phone: "contact",
};

export type CsvParseResult =
  | { ok: true; students: ParsedStudent[] }
  | { ok: false; error: string };

export function parseStudentsCsv(text: string): CsvParseResult {
  const rows = parseCsv(text);
  if (rows.length < 2) {
    return { ok: false, error: "The file needs a header row and at least one student row." };
  }
  const headers = rows[0]!.map(canonicalHeader);
  const indexes = new Map<number, keyof Omit<ParsedStudent, "rowNumber">>();
  headers.forEach((header, i) => {
    const mapped = HEADER_MAP[header];
    if (mapped && ![...indexes.values()].includes(mapped)) indexes.set(i, mapped);
  });
  if (!indexes.has(1 /* name */)) {
    return { ok: false, error: "Could not find a Name column in the header row." };
  }

  const students: ParsedStudent[] = [];
  for (let r = 1; r < rows.length; r++) {
    const cells = rows[r]!;
    const student: ParsedStudent = {
      rowNumber: r + 1,
      studentId: null,
      apaarId: null,
      name: "",
      dob: null,
      programmeCode: null,
      category: null,
      intakeType: null,
      contact: null,
    };
    indexes.forEach((field, colIndex) => {
      const value = clean(cells[colIndex]);
      if (value === null) return;
      if (field === "name") student.name = value;
      else if (field === "dob") student.dob = value;
      else if (field === "apaarId") student.apaarId = value;
      else student[field] = value;
    });
    if (student.name === "" && cells.every((c) => c.trim() === "")) continue;
    students.push(student);
  }
  if (students.length === 0) {
    return { ok: false, error: "No student rows were found in the file." };
  }
  return { ok: true, students };
}

function duplicateKey(student: ParsedStudent): string | null {
  const apaar = normalizeApaar(student.apaarId);
  if (apaar && APAAR_RE.test(apaar)) return `apaar:${apaar}`;
  const dob = normalizeDob(student.dob);
  const name = normalizeName(student.name);
  if (name && dob) return `person:${name}|${dob}`;
  return null;
}

const STATUS_DETAIL: Record<ImportStatus, string> = {
  valid: "Ready to import",
  duplicate_db: "Already in your records",
  duplicate_file: "Repeated in this file",
  missing_apaar: "No APAAR ID — import flagged for follow-up",
  invalid_apaar: "APAAR ID is not 12 digits — check the entry",
  missing_name: "Name is missing — row skipped",
};

/** Flags every row: duplicates (against saved records and within the file),
 * missing/invalid APAAR IDs, and rows without a name. */
export function reviewStudents(
  students: ParsedStudent[],
  existing: ExistingStudentRef[],
): ReviewedStudent[] {
  const dbKeys = new Set<string>();
  for (const row of existing) {
    const key = duplicateKey({
      rowNumber: 0,
      studentId: null,
      apaarId: row.apaar_id,
      name: row.name,
      dob: row.dob,
      programmeCode: null,
      category: null,
      intakeType: null,
      contact: null,
    });
    if (key) dbKeys.add(key);
  }

  const fileKeys = new Map<string, number>();
  for (const student of students) {
    const key = duplicateKey(student);
    if (key) fileKeys.set(key, (fileKeys.get(key) ?? 0) + 1);
  }

  return students.map((student) => {
    if (student.name === "") {
      return { ...student, status: "missing_name" as const, detail: STATUS_DETAIL.missing_name };
    }
    const key = duplicateKey(student);
    if (key) {
      if (dbKeys.has(key)) {
        return { ...student, status: "duplicate_db" as const, detail: STATUS_DETAIL.duplicate_db };
      }
      if ((fileKeys.get(key) ?? 0) > 1) {
        return {
          ...student,
          status: "duplicate_file" as const,
          detail: STATUS_DETAIL.duplicate_file,
        };
      }
    }
    const apaar = apaarStatus(student.apaarId);
    if (apaar === "missing") {
      return { ...student, status: "missing_apaar" as const, detail: STATUS_DETAIL.missing_apaar };
    }
    if (apaar === "invalid") {
      return { ...student, status: "invalid_apaar" as const, detail: STATUS_DETAIL.invalid_apaar };
    }
    return { ...student, status: "valid" as const, detail: STATUS_DETAIL.valid };
  });
}

/** Rows the import starts with pre-selected: everything except duplicates and
 * rows without a name. */
export function isDefaultSelected(status: ImportStatus): boolean {
  return status !== "duplicate_db" && status !== "duplicate_file" && status !== "missing_name";
}

export const STATUS_LABEL: Record<ImportStatus, string> = {
  valid: "Ready",
  duplicate_db: "Already saved",
  duplicate_file: "Repeat in file",
  missing_apaar: "No APAAR ID",
  invalid_apaar: "Bad APAAR ID",
  missing_name: "No name",
};
