/**
 * rbac.ts – centralised server-side role helpers.
 *
 * All server functions MUST call the relevant guard before touching data.
 * These helpers throw a plain Error (which TanStack Start converts to a 4xx)
 * so the frontend never receives unauthorised payloads.
 *
 * IMPORTANT: roles come from the JWT / user_profiles row that is fetched
 * server-side inside requireSupabaseAuth. They are NEVER supplied by the
 * frontend; the frontend cannot bypass these checks.
 */

export type EduRole = "aicte_admin" | "institution_admin" | "officer" | "student";

/** Roles that can manage students (import, edit, verify APAAR). */
const STAFF_ROLES: EduRole[] = ["aicte_admin", "institution_admin", "officer"];

/** Throw unless the caller has one of the listed roles. */
export function requireRole(
  actualRole: string,
  allowed: EduRole[],
  action = "perform this action",
): void {
  if (!(allowed as string[]).includes(actualRole)) {
    throw new Error(`Forbidden: role '${actualRole}' is not allowed to ${action}.`);
  }
}

/** AICTE Admin only. */
export function requireAicteAdmin(role: string): void {
  requireRole(role, ["aicte_admin"], "access AICTE-admin-only resources");
}

/** Institution Admin or above. */
export function requireInstAdmin(role: string): void {
  requireRole(role, ["aicte_admin", "institution_admin"], "manage institution resources");
}

/** Any staff member (not student). */
export function requireStaff(role: string): void {
  requireRole(role, STAFF_ROLES, "perform staff operations");
}

export type FilterableQuery<T> = T & {
  eq: (column: string, value: unknown) => T;
};

/**
 * Returns a Supabase `.eq()` / `.or()` scope string that restricts
 * a student query to rows the caller is authorised to see.
 *
 * Applies the filter directly to the provided Supabase query builder
 * and returns the modified builder.
 */
export function applyStudentScope<T>(
  query: FilterableQuery<T>,
  role: string,
  userId: string,
  institutionId: string | null,
): FilterableQuery<T> {
  if (role === "aicte_admin") {
    // Can see all rows
    return query;
  }
  if (institutionId) {
    // institution_admin / officer: own institution
    return query.eq("institution_id", institutionId) as FilterableQuery<T>;
  }
  // Student / fallback: own rows only
  return query.eq("user_id", userId) as FilterableQuery<T>;
}

/**
 * Guard for export operations.
 * Students cannot export anything; officers/admins can export their scope.
 */
export function requireExportPermission(role: string): void {
  requireRole(role, ["aicte_admin", "institution_admin", "officer"], "export student records");
}

/**
 * Guard for APAAR verification operations.
 * Only staff may trigger verification.
 */
export function requireApaarVerifyPermission(role: string): void {
  requireStaff(role);
}

/**
 * Guard for import operations.
 * Only staff may import student records.
 */
export function requireImportPermission(role: string): void {
  requireStaff(role);
}

/**
 * Guard for duplicate case resolution.
 * Officers can recommend; institution_admin and above can finalise.
 */
export function requireDuplicateResolvePermission(role: string, finalise: boolean): void {
  if (finalise) {
    requireRole(role, ["aicte_admin", "institution_admin"], "finalise duplicate resolution");
  } else {
    requireStaff(role);
  }
}

/**
 * Guard for audit log access.
 * Students have no access to audit logs.
 */
export function requireAuditAccess(role: string): void {
  requireRole(role, ["aicte_admin", "institution_admin", "officer"], "view audit logs");
}

/**
 * Guard ensuring a student can only access their own record.
 * For staff, always passes.
 */
export function requireOwnerOrStaff(role: string, userId: string, recordUserId: string): void {
  if ((STAFF_ROLES as string[]).includes(role)) return;
  if (userId !== recordUserId) {
    throw new Error("Forbidden: students may only access their own record.");
  }
}
