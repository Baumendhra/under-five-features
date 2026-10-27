/**
 * rbac.test.ts
 *
 * Tests for the centralised RBAC guard functions in src/lib/rbac.ts.
 * Tests cover:
 *   - Each role's permitted and denied operations
 *   - Institution-level data isolation
 *   - Student access restricted to own record
 *   - Unauthorized imports and exports
 *   - Unauthorized APAAR verification
 *   - Duplicate resolution permissions
 *   - Audit log access restrictions
 *   - Server-function authorization helpers
 */
import { describe, it, expect } from "vitest";
import {
  requireRole,
  requireAicteAdmin,
  requireInstAdmin,
  requireStaff,
  requireExportPermission,
  requireApaarVerifyPermission,
  requireImportPermission,
  requireDuplicateResolvePermission,
  requireAuditAccess,
  requireOwnerOrStaff,
  applyStudentScope,
  type EduRole,
} from "@/lib/rbac";

// ── requireRole ───────────────────────────────────────────────────────────

describe("requireRole", () => {
  it("passes when role is in the allowed list", () => {
    expect(() => requireRole("aicte_admin", ["aicte_admin", "institution_admin"])).not.toThrow();
    expect(() => requireRole("officer", ["officer"])).not.toThrow();
  });

  it("throws when role is not in the allowed list", () => {
    expect(() => requireRole("student", ["aicte_admin"])).toThrow(/Forbidden/);
    expect(() => requireRole("officer", ["aicte_admin", "institution_admin"])).toThrow(/Forbidden/);
  });

  it("includes the action name in the error message", () => {
    expect(() => requireRole("student", ["aicte_admin"], "delete students")).toThrow(/delete students/);
  });
});

// ── requireAicteAdmin ─────────────────────────────────────────────────────

describe("requireAicteAdmin", () => {
  it("allows aicte_admin", () => {
    expect(() => requireAicteAdmin("aicte_admin")).not.toThrow();
  });

  it.each(["institution_admin", "officer", "student"] as EduRole[])(
    "blocks %s",
    (role) => {
      expect(() => requireAicteAdmin(role)).toThrow(/Forbidden/);
    },
  );
});

// ── requireInstAdmin ──────────────────────────────────────────────────────

describe("requireInstAdmin", () => {
  it.each(["aicte_admin", "institution_admin"] as EduRole[])(
    "allows %s",
    (role) => {
      expect(() => requireInstAdmin(role)).not.toThrow();
    },
  );

  it.each(["officer", "student"] as EduRole[])(
    "blocks %s",
    (role) => {
      expect(() => requireInstAdmin(role)).toThrow(/Forbidden/);
    },
  );
});

// ── requireStaff ──────────────────────────────────────────────────────────

describe("requireStaff", () => {
  it.each(["aicte_admin", "institution_admin", "officer"] as EduRole[])(
    "allows %s",
    (role) => {
      expect(() => requireStaff(role)).not.toThrow();
    },
  );

  it("blocks student", () => {
    expect(() => requireStaff("student")).toThrow(/Forbidden/);
  });
});

// ── Export permission ─────────────────────────────────────────────────────

describe("requireExportPermission", () => {
  it.each(["aicte_admin", "institution_admin", "officer"] as EduRole[])(
    "allows %s to export",
    (role) => {
      expect(() => requireExportPermission(role)).not.toThrow();
    },
  );

  it("blocks student from exporting", () => {
    expect(() => requireExportPermission("student")).toThrow(/Forbidden/);
  });
});

// ── APAAR verification permission ─────────────────────────────────────────

describe("requireApaarVerifyPermission", () => {
  it.each(["aicte_admin", "institution_admin", "officer"] as EduRole[])(
    "allows %s to verify APAAR",
    (role) => {
      expect(() => requireApaarVerifyPermission(role)).not.toThrow();
    },
  );

  it("blocks student from verifying APAAR", () => {
    expect(() => requireApaarVerifyPermission("student")).toThrow(/Forbidden/);
  });
});

// ── Import permission ─────────────────────────────────────────────────────

describe("requireImportPermission", () => {
  it.each(["aicte_admin", "institution_admin", "officer"] as EduRole[])(
    "allows %s to import",
    (role) => {
      expect(() => requireImportPermission(role)).not.toThrow();
    },
  );

  it("blocks student from importing", () => {
    expect(() => requireImportPermission("student")).toThrow(/Forbidden/);
  });
});

// ── Duplicate resolution permission ──────────────────────────────────────

describe("requireDuplicateResolvePermission", () => {
  describe("recommend (non-finalise)", () => {
    it.each(["aicte_admin", "institution_admin", "officer"] as EduRole[])(
      "allows %s to recommend",
      (role) => {
        expect(() => requireDuplicateResolvePermission(role, false)).not.toThrow();
      },
    );

    it("blocks student from recommending", () => {
      expect(() => requireDuplicateResolvePermission("student", false)).toThrow(/Forbidden/);
    });
  });

  describe("finalise (resolve/dismiss)", () => {
    it.each(["aicte_admin", "institution_admin"] as EduRole[])(
      "allows %s to finalise",
      (role) => {
        expect(() => requireDuplicateResolvePermission(role, true)).not.toThrow();
      },
    );

    it("blocks officer from finalising", () => {
      expect(() => requireDuplicateResolvePermission("officer", true)).toThrow(/Forbidden/);
    });

    it("blocks student from finalising", () => {
      expect(() => requireDuplicateResolvePermission("student", true)).toThrow(/Forbidden/);
    });
  });
});

// ── Audit log access ──────────────────────────────────────────────────────

describe("requireAuditAccess", () => {
  it.each(["aicte_admin", "institution_admin", "officer"] as EduRole[])(
    "allows %s to view audit logs",
    (role) => {
      expect(() => requireAuditAccess(role)).not.toThrow();
    },
  );

  it("blocks student from audit logs", () => {
    expect(() => requireAuditAccess("student")).toThrow(/Forbidden/);
  });
});

// ── requireOwnerOrStaff ───────────────────────────────────────────────────

describe("requireOwnerOrStaff", () => {
  const userId = "user-123";
  const otherId = "user-999";

  it("allows staff regardless of owner", () => {
    expect(() => requireOwnerOrStaff("aicte_admin", userId, otherId)).not.toThrow();
    expect(() => requireOwnerOrStaff("institution_admin", userId, otherId)).not.toThrow();
    expect(() => requireOwnerOrStaff("officer", userId, otherId)).not.toThrow();
  });

  it("allows student to access their own record", () => {
    expect(() => requireOwnerOrStaff("student", userId, userId)).not.toThrow();
  });

  it("blocks student from accessing another user's record", () => {
    expect(() => requireOwnerOrStaff("student", userId, otherId)).toThrow(/Forbidden/);
  });
});

// ── applyStudentScope ─────────────────────────────────────────────────────

describe("applyStudentScope", () => {
  function makeQuery() {
    const calls: { method: string; args: unknown[] }[] = [];
    const query = {
      eq: (...args: unknown[]) => {
        calls.push({ method: "eq", args });
        return query;
      },
      _calls: calls,
    };
    return query;
  }

  it("does not apply any filter for aicte_admin", () => {
    const q = makeQuery();
    applyStudentScope(q as any, "aicte_admin", "u1", "inst-1");
    expect(q._calls).toHaveLength(0);
  });

  it("scopes by institution_id for institution_admin with institution", () => {
    const q = makeQuery();
    applyStudentScope(q as any, "institution_admin", "u1", "inst-abc");
    expect(q._calls).toHaveLength(1);
    expect(q._calls[0]).toEqual({ method: "eq", args: ["institution_id", "inst-abc"] });
  });

  it("scopes by institution_id for officer with institution", () => {
    const q = makeQuery();
    applyStudentScope(q as any, "officer", "u1", "inst-xyz");
    expect(q._calls).toHaveLength(1);
    expect(q._calls[0]).toEqual({ method: "eq", args: ["institution_id", "inst-xyz"] });
  });

  it("scopes by user_id when no institution_id (student / fallback)", () => {
    const q = makeQuery();
    applyStudentScope(q as any, "student", "user-abc", null);
    expect(q._calls).toHaveLength(1);
    expect(q._calls[0]).toEqual({ method: "eq", args: ["user_id", "user-abc"] });
  });

  it("scopes by user_id for institution_admin with no institution_id set", () => {
    const q = makeQuery();
    applyStudentScope(q as any, "institution_admin", "u1", null);
    expect(q._calls).toHaveLength(1);
    expect(q._calls[0]).toEqual({ method: "eq", args: ["user_id", "u1"] });
  });
});

// ── Permission matrix summary ─────────────────────────────────────────────

describe("RBAC permission matrix", () => {
  const roles: EduRole[] = ["aicte_admin", "institution_admin", "officer", "student"];

  const permissions: { name: string; fn: (r: EduRole) => void; allowedRoles: EduRole[] }[] = [
    {
      name: "create institution",
      fn: (r) => requireAicteAdmin(r),
      allowedRoles: ["aicte_admin"],
    },
    {
      name: "manage programmes",
      fn: (r) => requireInstAdmin(r),
      allowedRoles: ["aicte_admin", "institution_admin"],
    },
    {
      name: "import students",
      fn: (r) => requireImportPermission(r),
      allowedRoles: ["aicte_admin", "institution_admin", "officer"],
    },
    {
      name: "export students",
      fn: (r) => requireExportPermission(r),
      allowedRoles: ["aicte_admin", "institution_admin", "officer"],
    },
    {
      name: "verify APAAR",
      fn: (r) => requireApaarVerifyPermission(r),
      allowedRoles: ["aicte_admin", "institution_admin", "officer"],
    },
    {
      name: "view audit logs",
      fn: (r) => requireAuditAccess(r),
      allowedRoles: ["aicte_admin", "institution_admin", "officer"],
    },
    {
      name: "recommend duplicate resolution",
      fn: (r) => requireDuplicateResolvePermission(r, false),
      allowedRoles: ["aicte_admin", "institution_admin", "officer"],
    },
    {
      name: "finalise duplicate resolution",
      fn: (r) => requireDuplicateResolvePermission(r, true),
      allowedRoles: ["aicte_admin", "institution_admin"],
    },
  ];

  for (const perm of permissions) {
    describe(`Permission: ${perm.name}`, () => {
      for (const role of roles) {
        const shouldAllow = perm.allowedRoles.includes(role);
        it(`${shouldAllow ? "✓ allows" : "✗ blocks"} ${role}`, () => {
          if (shouldAllow) {
            expect(() => perm.fn(role)).not.toThrow();
          } else {
            expect(() => perm.fn(role)).toThrow(/Forbidden/);
          }
        });
      }
    });
  }
});
