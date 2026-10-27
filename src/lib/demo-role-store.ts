/**
 * demo-role-store.ts
 *
 * A tiny reactive store for the demo role.
 * Any component that calls `useDemoRole()` will automatically re-render
 * when `setDemoRole()` is called from anywhere — including the banner dropdown.
 *
 * No external state library needed — uses the observer pattern directly.
 */
import { useState, useEffect } from "react";
import type { Role } from "@/hooks/use-user-profile";

// Module-level state (persists across renders, not across page reloads).
let _currentRole: Role = (() => {
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem("demoRole");
    if (stored) return stored as Role;
  }
  return "aicte_admin";
})();

// Set of subscriber callbacks.
const _listeners = new Set<() => void>();

/** Get the current demo role (non-reactive — for server functions / plain logic). */
export function getDemoRole(): Role {
  return _currentRole;
}

/** Set a new demo role and notify all React subscribers. */
export function setDemoRole(role: Role) {
  _currentRole = role;
  if (typeof window !== "undefined") {
    sessionStorage.setItem("demoRole", role);
  }
  _listeners.forEach((l) => l());
}

/**
 * React hook — returns [currentRole, setRole].
 * Re-renders the calling component whenever the role changes.
 */
export function useDemoRole(): [Role, (role: Role) => void] {
  const [role, setLocalRole] = useState<Role>(_currentRole);

  useEffect(() => {
    // Sync in case role changed before this component mounted.
    setLocalRole(_currentRole);

    const listener = () => setLocalRole(_currentRole);
    _listeners.add(listener);
    return () => {
      _listeners.delete(listener);
    };
  }, []);

  return [role, setDemoRole];
}
