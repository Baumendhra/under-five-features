import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDemoRole } from "@/lib/demo-role-store";
import type { Role } from "@/hooks/use-user-profile";

/**
 * Demo layout – isolated sandbox that never hits the real database.
 * Lives at /demo and wraps all /demo/* child pages.
 *
 * The role dropdown here calls `setRole` from the reactive demo-role-store,
 * which causes every component on the page that calls `useUserProfile()` or
 * `useDemoRole()` to re-render with the new role instantly.
 */
export const Route = createFileRoute("/demo")({
  ssr: false,
  component: DemoLayout,
});

const ROLES: { value: Role; label: string; badge: string }[] = [
  { value: "aicte_admin", label: "AICTE Admin", badge: "bg-purple-100 text-purple-800" },
  { value: "institution_admin", label: "Institution Admin", badge: "bg-blue-100 text-blue-800" },
  { value: "officer", label: "Officer", badge: "bg-green-100 text-green-800" },
  { value: "student", label: "Student", badge: "bg-amber-100 text-amber-800" },
];

const NAV_ITEMS = [
  {
    to: "/demo/dashboard",
    label: "Dashboard",
    roles: ["aicte_admin", "institution_admin", "officer", "student"],
  },
  {
    to: "/demo/students",
    label: "Students",
    roles: ["aicte_admin", "institution_admin", "officer", "student"],
  },
  { to: "/demo/import", label: "Import", roles: ["aicte_admin", "institution_admin", "officer"] },
  { to: "/demo/institutions", label: "Institutions", roles: ["aicte_admin"] },
  {
    to: "/demo/duplicates",
    label: "Duplicates",
    roles: ["aicte_admin", "institution_admin", "officer"],
  },
  { to: "/demo/audit", label: "Audit", roles: ["aicte_admin", "institution_admin", "officer"] },
] as const;

function DemoLayout() {
  const routerState = useRouterState();
  const [currentRole, setRole] = useDemoRole(); // reactive — any change re-renders this + all consumers

  const badge = ROLES.find((r) => r.value === currentRole);

  // Filter nav items based on current role so the sidebar also reacts to role changes.
  const visibleNav = NAV_ITEMS.filter((item) =>
    (item.roles as readonly string[]).includes(currentRole),
  );

  return (
    <div className="min-h-screen bg-background">
      {/* ── Demo banner ───────────────────────────────────────────── */}
      <header className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-2">
          {/* Left: icon + title */}
          <div className="flex items-center gap-2">
            <span className="text-lg">🧪</span>
            <span className="text-sm font-semibold text-amber-900">Demo Sandbox</span>
            <span className="hidden text-xs text-amber-700 sm:inline">
              — no real data is read or modified
            </span>
          </div>

          {/* Right: role switcher + back link */}
          <div className="flex items-center gap-3">
            {/* Current role badge */}
            <span
              className={cn(
                "hidden rounded-full px-2.5 py-0.5 text-[11px] font-medium sm:inline",
                badge?.badge ?? "bg-muted text-muted-foreground",
              )}
            >
              {badge?.label ?? currentRole}
            </span>

            {/* Role selector */}
            <div className="flex items-center gap-1.5">
              <label htmlFor="demo-role-selector" className="text-xs font-medium text-amber-700">
                Switch role:
              </label>
              <select
                id="demo-role-selector"
                value={currentRole}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 shadow-sm focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.label}
                  </option>
                ))}
              </select>
            </div>

            <Button
              variant="outline"
              size="sm"
              asChild
              className="h-7 border-amber-300 bg-white text-xs text-amber-900 hover:bg-amber-100"
            >
              <a href="/dashboard">← Back to production</a>
            </Button>
          </div>
        </div>
      </header>

      {/* ── Demo nav bar ──────────────────────────────────────────── */}
      <nav className="border-b border-border bg-card shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center gap-1 px-6 py-2">
          <span className="mr-3 font-display text-lg font-semibold tracking-tight text-foreground">
            EduTrace
          </span>
          {visibleNav.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium transition-colors",
                routerState.location.pathname === item.to ||
                  routerState.location.pathname.startsWith(item.to + "/")
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
              )}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </nav>

      {/* ── Role-change info toast ─────────────────────────────────── */}
      <div className="mx-auto max-w-7xl px-6 pt-3">
        <div
          className={cn(
            "flex items-center gap-2 rounded-lg px-3 py-2 text-xs",
            badge?.badge ?? "bg-muted text-muted-foreground",
            "bg-opacity-60",
          )}
        >
          <span className="font-semibold">Viewing as: {badge?.label ?? currentRole}</span>
          <span className="text-[10px] opacity-70">
            — navigation and permissions update in real time as you switch roles
          </span>
        </div>
      </div>

      <main className="mx-auto max-w-7xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
