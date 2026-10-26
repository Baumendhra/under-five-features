import { describe, expect, it } from "vitest";
import {
  apaarStatus,
  isDefaultSelected,
  normalizeDob,
  parseStudentsCsv,
  reviewStudents,
} from "@/lib/student-import";

describe("APAAR ID checks", () => {
  it("accepts a 12-digit APAAR ID as verified", () => {
    expect(apaarStatus("345678901234")).toBe("verified");
  });

  it("treats an empty APAAR ID as missing", () => {
    expect(apaarStatus(null)).toBe("missing");
    expect(apaarStatus("")).toBe("missing");
  });

  it("flags an APAAR ID that is not 12 digits as invalid", () => {
    expect(apaarStatus("12345")).toBe("invalid");
    expect(apaarStatus("3456789012340")).toBe("invalid");
    expect(apaarStatus("abcd56789012")).toBe("invalid");
  });
});

describe("duplicate detection", () => {
  it("flags a row whose APAAR ID matches a saved student as duplicate_db", () => {
    const [reviewed] = reviewStudents(
      [
        {
          rowNumber: 2,
          studentId: "S00001",
          apaarId: "345678901234",
          name: "Ananya Iyer",
          dob: "2005-03-14",
          programmeCode: "CSE",
          category: "GEN",
          intakeType: "regular",
          contact: null,
        },
      ],
      [{ apaar_id: "345678901234", name: "Someone Else", dob: null }],
    );
    expect(reviewed!.status).toBe("duplicate_db");
  });

  it("flags same name plus date of birth as a duplicate even without an APAAR ID", () => {
    const [reviewed] = reviewStudents(
      [
        {
          rowNumber: 2,
          studentId: null,
          apaarId: null,
          name: "Ananya Iyer",
          dob: "2005-03-14",
          programmeCode: null,
          category: null,
          intakeType: null,
          contact: null,
        },
      ],
      [{ apaar_id: null, name: "ananya iyer", dob: "2005-03-14" }],
    );
    expect(reviewed!.status).toBe("duplicate_db");
  });

  it("flags the second occurrence of the same student inside one file", () => {
    const rows = reviewStudents(
      [
        {
          rowNumber: 2,
          studentId: null,
          apaarId: "345678901234",
          name: "Ananya Iyer",
          dob: null,
          programmeCode: null,
          category: null,
          intakeType: null,
          contact: null,
        },
        {
          rowNumber: 3,
          studentId: null,
          apaarId: "345678901234",
          name: "Ananya Iyer",
          dob: null,
          programmeCode: null,
          category: null,
          intakeType: null,
          contact: null,
        },
      ],
      [],
    );
    expect(rows[0]!.status).toBe("duplicate_file");
    expect(rows[1]!.status).toBe("duplicate_file");
  });
});

describe("import pre-selection", () => {
  it("pre-selects ready, missing-APAAR and invalid-APAAR rows", () => {
    expect(isDefaultSelected("valid")).toBe(true);
    expect(isDefaultSelected("missing_apaar")).toBe(true);
    expect(isDefaultSelected("invalid_apaar")).toBe(true);
  });

  it("never pre-selects duplicates or rows without a name", () => {
    expect(isDefaultSelected("duplicate_db")).toBe(false);
    expect(isDefaultSelected("duplicate_file")).toBe(false);
    expect(isDefaultSelected("missing_name")).toBe(false);
  });
});

describe("CSV parsing and DOB normalisation", () => {
  it("maps the sample header columns", () => {
    const result = parseStudentsCsv(
      "StudentID,APAAR_ID,Name,DOB,ProgrammeCode,Category,IntakeType,Contact\nS00001,345678901234,Ananya Iyer,2005-03-14,CSE,GEN,regular,ananya@example.edu\n",
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.students[0]).toMatchObject({
      studentId: "S00001",
      apaarId: "345678901234",
      name: "Ananya Iyer",
      dob: "2005-03-14",
      programmeCode: "CSE",
    });
  });

  it("reads dd/mm/yyyy and dd-mm-yyyy dates", () => {
    expect(normalizeDob("14/03/2005")).toBe("2005-03-14");
    expect(normalizeDob("14-03-2005")).toBe("2005-03-14");
    expect(normalizeDob("2005-03-14")).toBe("2005-03-14");
    expect(normalizeDob("not a date")).toBe(null);
  });

  it("rejects a file without a Name column", () => {
    const result = parseStudentsCsv("StudentID,APAAR_ID\nS00001,345678901234\n");
    expect(result.ok).toBe(false);
  });
});
