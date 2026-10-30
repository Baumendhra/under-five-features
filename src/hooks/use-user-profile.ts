/**
 * useUserProfile – fetches the current user's profile (role, institution_id)
 * from the user_profiles table via the existing getUserProfile server function.
 *
 * When the current pathname starts with /demo, the hook returns a fully-capable
 * admin profile driven by the reactive demo-role-store (so the role-switcher
 * dropdown in the demo banner immediately updates every page that calls this hook).
 *
 * Role capabilities:
 *   aicte_admin        – global read/write access to all institutions
 *   institution_admin  – full access to their own institution
 *   officer            – student verification/import within their institution
 *   student            – read-only access to their own record
 */
import { useQuery } from "@tanstack/react-query";
import { userProfileQueryOptions } from "@/lib/edutrace.functions";
import type { UserProfile } from "@/lib/edutrace.functions";
import { useDemoRole } from "@/lib/demo-role-store";

export type Role = "aicte_admin" | "institution_admin" | "officer" | "student";

export interface RbacContext {
  profile: UserProfile | null | undefined;
  role: Role;
  institutionId: string | null;
  isLoading: boolean;

  // Capability helpers
  isAicteAdmin: boolean;
  isInstitutionAdmin: boolean;
  isOfficer: boolean;
  isStudent: boolean;

  /** Can manage institutions globally (create/edit institutions) */
  canManageInstitutions: boolean;
  /** Can manage programmes */
  canManageProgrammes: boolean;
  /** Can import/edit students */
  canImportStudents: boolean;
  /** Can trigger APAAR verification */
  canVerifyApaar: boolean;
  /** Can review duplicate cases */
  canReviewDuplicates: boolean;
  /** Can export student data */
  canExport: boolean;
  /** Can view audit logs */
  canViewAudit: boolean;
}

export function useUserProfile(): RbacContext {
  // Detect demo mode by the current browser pathname.
  const isDemo = typeof window !== "undefined" && window.location.pathname.startsWith("/demo");

  // The demo role store is always called (hooks must not be conditional).
  // In production mode the value is simply ignored.
  const [demoRole] = useDemoRole();

  // Real profile query (skipped / kept stale in demo mode via `enabled`).
  const { data: profile, isLoading } = useQuery({
    ...userProfileQueryOptions,
    enabled: !isDemo, // don't fire the real query in the sandbox
  });

  // In demo mode, override everything with the current demo role.
  const role: Role = isDemo ? demoRole : ((profile?.role ?? "officer") as Role);
  const institutionId = isDemo ? null : (profile?.institution_id ?? null);
  const loading = isDemo ? false : isLoading;

  const isAicteAdmin = role === "aicte_admin";
  const isInstitutionAdmin = role === "institution_admin";
  const isOfficer = role === "officer";
  const isStudent = role === "student";

  return {
    profile: isDemo ? null : (profile ?? null),
    role,
    institutionId,
    isLoading: loading,

    isAicteAdmin,
    isInstitutionAdmin,
    isOfficer,
    isStudent,

    canManageInstitutions: isAicteAdmin,
    canManageProgrammes: isAicteAdmin || isInstitutionAdmin,
    canImportStudents: isAicteAdmin || isInstitutionAdmin || isOfficer,
    canVerifyApaar: isAicteAdmin || isInstitutionAdmin || isOfficer,
    canReviewDuplicates: isAicteAdmin || isInstitutionAdmin || isOfficer,
    canExport: isAicteAdmin || isInstitutionAdmin || isOfficer,
    canViewAudit: isAicteAdmin || isInstitutionAdmin || isOfficer,
  };
}
