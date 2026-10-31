import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useDemoRole, useDemoActiveStudent } from "@/lib/demo-role-store";
import type { Role } from "@/hooks/use-user-profile";

export const Route = createFileRoute("/demo")({
  ssr: false,
  component: DemoLayout,
});

const ROLES: {
  value: Role;
  step: number;
  label: string;
  shortDesc: string;
  badge: string;
}[] = [
  {
    value: "student",
    step: 1,
    label: "Student",
    shortDesc: "Self-service, APAAR status & submit correction",
    badge: "bg-amber-100 text-amber-800 border-amber-300",
  },
  {
    value: "officer",
    step: 2,
    label: "Officer",
    shortDesc: "Scrutinize requests, verify APAAR & triage",
    badge: "bg-green-100 text-green-800 border-green-300",
  },
  {
    value: "institution_admin",
    step: 3,
    label: "Institution Admin",
    shortDesc: "Approve corrections, intelligence hub & capacity",
    badge: "bg-blue-100 text-blue-800 border-blue-300",
  },
  {
    value: "aicte_admin",
    step: 4,
    label: "AICTE Admin",
    shortDesc: "Statutory oversight, institutions & national audit",
    badge: "bg-purple-100 text-purple-800 border-purple-300",
  },
];

// Defined per role to enforce appropriate access boundaries
const NAV_CONFIG: Record<Role, Array<{ to: string; label: string; icon?: string }>> = {
  student: [
    { to: "/demo/dashboard", label: "My Student Portal", icon: "👤" },
    { to: "/demo/corrections", label: "My Correction Requests", icon: "📝" },
  ],
  officer: [
    { to: "/demo/dashboard", label: "Scrutiny Desk", icon: "📋" },
    { to: "/demo/students", label: "Student Verification", icon: "👥" },
    { to: "/demo/corrections", label: "Correction Queue", icon: "📑" },
    { to: "/demo/duplicates", label: "Duplicate Scrutiny", icon: "🔍" },
    { to: "/demo/audit", label: "Audit Logs", icon: "📜" },
  ],
  institution_admin: [
    { to: "/demo/dashboard", label: "Executive Dashboard", icon: "📊" },
    { to: "/demo/intelligence", label: "Intelligence Hub", icon: "✨" },
    { to: "/demo/students", label: "Student Registry", icon: "👥" },
    { to: "/demo/programmes", label: "Programmes & Intake", icon: "📈" },
    { to: "/demo/corrections", label: "Correction Approvals", icon: "✅" },
    { to: "/demo/duplicates", label: "Duplicate Resolution", icon: "🔗" },
    { to: "/demo/import", label: "Import Data", icon: "📥" },
    { to: "/demo/audit", label: "Audit Logs", icon: "📜" },
  ],
  aicte_admin: [
    { to: "/demo/dashboard", label: "AICTE Oversight", icon: "🏛️" },
    { to: "/demo/institutions", label: "Institutions Directory", icon: "🏢" },
    { to: "/demo/intelligence", label: "System Intelligence", icon: "✨" },
    { to: "/demo/programmes", label: "National Intake Compliance", icon: "📈" },
    { to: "/demo/duplicates", label: "Cross-Inst Duplicates", icon: "🔍" },
    { to: "/demo/audit", label: "System Audit", icon: "📜" },
  ],
};

function DemoLayout() {
  const routerState = useRouterState();
  const [currentRole, setRole] = useDemoRole();
  const [activeStudentId, setActiveStudentId] = useDemoActiveStudent();

  const currentRoleMeta = ROLES.find((r) => r.value === currentRole) ?? ROLES[0];
  const navItems = NAV_CONFIG[currentRole] ?? NAV_CONFIG.student;

  return (
    <div className="min-h-screen bg-background">
      {/* ── Top Demo Sandbox Header ───────────────────────────────── */}
      <header className="border-b border-amber-200 bg-amber-50">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-6 py-2">
          {/* Left: icon + title */}
          <div className="flex items-center gap-2">
            <span className="text-lg">🧪</span>
            <div>
              <span className="text-sm font-bold text-amber-950">EduTrace Demo Sandbox</span>
              <span className="hidden text-xs text-amber-800 ml-2 sm:inline">
                Role-based workflow demonstration
              </span>
            </div>
          </div>

          {/* Right: quick role selector + back button */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1.5">
              <label htmlFor="demo-role-selector" className="text-xs font-semibold text-amber-900">
                Switch Role:
              </label>
              <select
                id="demo-role-selector"
                value={currentRole}
                onChange={(e) => setRole(e.target.value as Role)}
                className="rounded-md border border-amber-300 bg-white px-2 py-1 text-xs font-medium text-amber-900 shadow-xs focus:outline-none focus:ring-1 focus:ring-amber-500"
              >
                {ROLES.map((r) => (
                  <option key={r.value} value={r.value}>
                    Step {r.step}: {r.label}
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

        {/* ── Guided Role Journey Tour Bar ──────────────────────────── */}
        <div className="border-t border-amber-200/80 bg-amber-100/50 px-6 py-1.5">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-2 text-xs">
            <div className="flex items-center gap-1 text-[11px] font-semibold text-amber-900">
              <span>Persona Tour:</span>
            </div>

            <div className="flex flex-wrap items-center gap-1 sm:gap-2">
              {ROLES.map((r, idx) => {
                const isActive = r.value === currentRole;
                return (
                  <div key={r.value} className="flex items-center">
                    <button
                      onClick={() => setRole(r.value)}
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-[11px] font-semibold transition-all cursor-pointer",
                        isActive
                          ? "bg-amber-900 text-white shadow-xs"
                          : "bg-white/80 text-amber-900 hover:bg-white border border-amber-300/80",
                      )}
                      title={`Step ${r.step}: ${r.shortDesc}`}
                    >
                      Step {r.step}: {r.label}
                    </button>
                    {idx < ROLES.length - 1 && (
                      <span className="mx-1 text-amber-400 font-bold hidden sm:inline">→</span>
                    )}
                  </div>
                );
              })}
            </div>

            <div className="hidden lg:block text-[11px] text-amber-800 italic">
              {currentRoleMeta.shortDesc}
            </div>
          </div>
        </div>
      </header>

      {/* ── Role-Specific Navigation Bar ──────────────────────────── */}
      <nav className="border-b border-border bg-card shadow-2xs">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-2">
          <div className="flex items-center gap-2">
            <span className="mr-3 font-display text-lg font-bold tracking-tight text-foreground">
              EduTrace
            </span>

            <div className="flex flex-wrap gap-1">
              {navItems.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-medium transition-colors flex items-center gap-1.5",
                    routerState.location.pathname === item.to ||
                      (item.to !== "/demo/dashboard" &&
                        routerState.location.pathname.startsWith(item.to))
                      ? "bg-primary text-primary-foreground font-semibold shadow-2xs"
                      : "text-muted-foreground hover:bg-accent hover:text-accent-foreground",
                  )}
                >
                  {item.icon && <span>{item.icon}</span>}
                  <span>{item.label}</span>
                </Link>
              ))}
            </div>
          </div>

          {/* Persona info on the right */}
          <div className="hidden md:flex items-center gap-2">
            <span
              className={cn(
                "rounded-full border px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider",
                currentRoleMeta.badge,
              )}
            >
              Viewing as: {currentRoleMeta.label}
            </span>
          </div>
        </div>
      </nav>

      {/* ── Main View Container ───────────────────────────────────── */}
      <main className="mx-auto max-w-7xl px-6 py-6">
        <Outlet />
      </main>
    </div>
  );
}
