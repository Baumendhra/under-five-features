/**
 * demo-role-store.ts
 *
 * A tiny reactive store for the demo role and active demo student persona.
 * Any component that calls `useDemoRole()` or `useDemoActiveStudent()` will
 * automatically re-render when the role or student is updated.
 */
import { useState, useEffect } from "react";
import type { Role } from "@/hooks/use-user-profile";

// ── Role State ─────────────────────────────────────────────────────────────
let _currentRole: Role = (() => {
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem("demoRole");
    if (stored) return stored as Role;
  }
  return "aicte_admin";
})();

const _roleListeners = new Set<() => void>();

export function getDemoRole(): Role {
  return _currentRole;
}

export function setDemoRole(role: Role) {
  _currentRole = role;
  if (typeof window !== "undefined") {
    sessionStorage.setItem("demoRole", role);
  }
  _roleListeners.forEach((l) => l());
}

export function useDemoRole(): [Role, (role: Role) => void] {
  const [role, setLocalRole] = useState<Role>(_currentRole);

  useEffect(() => {
    setLocalRole(_currentRole);
    const listener = () => setLocalRole(_currentRole);
    _roleListeners.add(listener);
    return () => {
      _roleListeners.delete(listener);
    };
  }, []);

  return [role, setDemoRole];
}

// ── Active Student Persona State (for Student Role) ────────────────────────
let _currentStudentId: string = (() => {
  if (typeof window !== "undefined") {
    const stored = sessionStorage.getItem("demoStudentId");
    if (stored) return stored;
  }
  return "demo-3"; // Default: Sita Devi (STU003) - has invalid Verhoeff checksum & correction request
})();

const _studentListeners = new Set<() => void>();

export function getDemoActiveStudentId(): string {
  return _currentStudentId;
}

export function setDemoActiveStudentId(studentId: string) {
  _currentStudentId = studentId;
  if (typeof window !== "undefined") {
    sessionStorage.setItem("demoStudentId", studentId);
  }
  _studentListeners.forEach((l) => l());
}

export function useDemoActiveStudent(): [string, (id: string) => void] {
  const [studentId, setLocalStudentId] = useState<string>(_currentStudentId);

  useEffect(() => {
    setLocalStudentId(_currentStudentId);
    const listener = () => setLocalStudentId(_currentStudentId);
    _studentListeners.add(listener);
    return () => {
      _studentListeners.delete(listener);
    };
  }, []);

  return [studentId, setDemoActiveStudentId];
}
