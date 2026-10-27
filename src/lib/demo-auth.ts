// file: src/lib/demo-auth.ts
export const DEMO_USER = {
  id: "demo-admin",
  role: "aicte_admin" as const,
  institution_id: null,
};

/** Mutate the role for the demo sandbox (used by the role‑selector dropdown). */
export function setDemoRole(role: "aicte_admin" | "institution_admin" | "officer" | "student") {
  // Direct mutation is safe here because this file is loaded only once in the sandbox.
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  DEMO_USER.role = role;
}

