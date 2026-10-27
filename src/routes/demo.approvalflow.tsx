/**
 * ApprovalFlow AI — Main Hub
 * Route: /demo/approvalflow
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useDemoRole } from "@/lib/demo-role-store";
import {
  afStore,
  getDemoUserId,
  isOverdue,
  daysUntil,
  STAGE_LABELS,
  STAGE_COLORS,
  APP_TYPE_LABELS,
  type Application,
} from "@/lib/approval-flow";
import type { Role } from "@/hooks/use-user-profile";

export const Route = createFileRoute("/demo/approvalflow")({
  ssr: false,
  head: () => ({ meta: [{ title: "ApprovalFlow AI — Hub" }] }),
  component: ApprovalFlowHub,
});

// ─── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ label, value, sub, color, icon }: {
  label: string; value: number | string; sub?: string;
  color: "blue" | "green" | "amber" | "red" | "purple" | "cyan"; icon: string;
}) {
  const colors = {
    blue:   "from-blue-500/10 to-blue-600/5 border-blue-200 text-blue-700",
    green:  "from-green-500/10 to-green-600/5 border-green-200 text-green-700",
    amber:  "from-amber-500/10 to-amber-600/5 border-amber-200 text-amber-700",
    red:    "from-red-500/10 to-red-600/5 border-red-200 text-red-700",
    purple: "from-purple-500/10 to-purple-600/5 border-purple-200 text-purple-700",
    cyan:   "from-cyan-500/10 to-cyan-600/5 border-cyan-200 text-cyan-700",
  }[color];
  return (
    <div className={`rounded-2xl border bg-gradient-to-br p-5 ${colors} transition-all hover:shadow-lg hover:-translate-y-0.5`}>
      <div className="text-2xl mb-2">{icon}</div>
      <p className="text-xs font-semibold uppercase tracking-wider opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs mt-1 opacity-60">{sub}</p>}
    </div>
  );
}

// ─── Application Row ──────────────────────────────────────────────────────────
function AppRow({ app, role }: { app: Application; role: Role }) {
  const inst = afStore.getInstitution(app.institutionId);
  const overdue = isOverdue(app);
  const daysLeft = daysUntil(app.slaDeadline);
  return (
    <div className={`flex items-center gap-4 px-4 py-3 hover:bg-accent/30 transition-colors rounded-lg cursor-pointer ${overdue ? "border-l-2 border-l-red-400" : ""}`}>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-foreground">{app.id}</span>
          <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-medium ${STAGE_COLORS[app.currentStage]}`}>
            {STAGE_LABELS[app.currentStage]}
          </span>
          {overdue && <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-semibold text-red-700">⚠ OVERDUE</span>}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 truncate">{inst?.name} · {APP_TYPE_LABELS[app.appType]} · {app.region}</p>
      </div>
      <div className="text-right shrink-0">
        <p className={`text-xs font-medium ${daysLeft < 0 ? "text-red-600" : daysLeft < 7 ? "text-amber-600" : "text-muted-foreground"}`}>
          {daysLeft < 0 ? `${Math.abs(daysLeft)}d overdue` : `${daysLeft}d left`}
        </p>
        <p className="text-[10px] text-muted-foreground">SLA {app.slaDeadline}</p>
      </div>
    </div>
  );
}

// ─── Role-based quick links ───────────────────────────────────────────────────
const ROLE_SHORTCUTS: Record<Role, { to: string; label: string; desc: string; icon: string; color: string }[]> = {
  aicte_admin: [
    { to: "/demo/approvalflow/applications", label: "All Applications", desc: "Search & manage all cases", icon: "📋", color: "bg-blue-50 border-blue-200 hover:bg-blue-100" },
    { to: "/demo/approvalflow/reports",      label: "Analytics & Reports", desc: "Charts, SLA, export CSV", icon: "📊", color: "bg-purple-50 border-purple-200 hover:bg-purple-100" },
    { to: "/demo/approvalflow/config",       label: "Workflow Config", desc: "Rules, stages, deadlines", icon: "⚙️", color: "bg-gray-50 border-gray-200 hover:bg-gray-100" },
    { to: "/demo/approvalflow/evc",          label: "EVC Scheduler", desc: "Manage visits & committees", icon: "🗓️", color: "bg-violet-50 border-violet-200 hover:bg-violet-100" },
  ],
  officer: [
    { to: "/demo/approvalflow/scrutiny",     label: "Scrutiny Dashboard", desc: "Assigned cases & tasks", icon: "🔍", color: "bg-amber-50 border-amber-200 hover:bg-amber-100" },
    { to: "/demo/approvalflow/applications", label: "Application List",   desc: "Browse regional cases",  icon: "📋", color: "bg-blue-50 border-blue-200 hover:bg-blue-100" },
  ],
  evc_coordinator: [
    { to: "/demo/approvalflow/evc",          label: "EVC Scheduler",      desc: "Schedule & track visits", icon: "🗓️", color: "bg-violet-50 border-violet-200 hover:bg-violet-100" },
    { to: "/demo/approvalflow/applications", label: "Application List",   desc: "Browse EVC-stage cases",  icon: "📋", color: "bg-blue-50 border-blue-200 hover:bg-blue-100" },
  ],
  compliance_officer: [
    { to: "/demo/approvalflow/compliance",   label: "Compliance Tracker", desc: "Deadlines & undertakings", icon: "✅", color: "bg-green-50 border-green-200 hover:bg-green-100" },
    { to: "/demo/approvalflow/applications", label: "Application List",   desc: "Browse cases",            icon: "📋", color: "bg-blue-50 border-blue-200 hover:bg-blue-100" },
  ],
  institution_admin: [
    { to: "/demo/approvalflow/submit",       label: "Submit Application", desc: "Start a new application", icon: "📝", color: "bg-green-50 border-green-200 hover:bg-green-100" },
    { to: "/demo/approvalflow/applications", label: "My Applications",   desc: "Track your submissions",  icon: "📋", color: "bg-blue-50 border-blue-200 hover:bg-blue-100" },
  ],
  student: [
    { to: "/demo/approvalflow/applications", label: "Application List", desc: "Browse applications", icon: "📋", color: "bg-blue-50 border-blue-200 hover:bg-blue-100" },
  ],
};

// ─── Main component ───────────────────────────────────────────────────────────
function ApprovalFlowHub() {
  const [role] = useDemoRole();
  const userId = getDemoUserId(role as Parameters<typeof getDemoUserId>[0]);

  const analytics = useMemo(() => afStore.getAnalytics(), []);
  const notifications = useMemo(() => afStore.getNotificationsForUser(userId).slice(0, 5), [userId]);
  const apps = useMemo(() => afStore.getApplicationsForRole(role as Parameters<typeof getDemoUserId>[0], userId), [role, userId]);
  const recentApps = useMemo(() => [...apps].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 6), [apps]);
  const overdueApps = useMemo(() => apps.filter(isOverdue), [apps]);
  const shortcuts = ROLE_SHORTCUTS[role as Role] ?? ROLE_SHORTCUTS.student;

  const unread = notifications.filter((n) => !n.readStatus).length;

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 p-2.5 text-white shadow-lg shadow-blue-200">
              <span className="text-xl">🏛️</span>
            </div>
            <div>
              <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
                ApprovalFlow <span className="text-blue-600">AI</span>
              </h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                AICTE Institution Approval Workflow — Demo Sandbox
              </p>
            </div>
          </div>
        </div>
        {unread > 0 && (
          <div className="flex items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5">
            <span className="text-amber-600">🔔</span>
            <span className="text-sm font-medium text-amber-800">{unread} unread notification{unread > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total Applications" value={analytics.total}          icon="📋" color="blue"   sub={`${analytics.pending} pending`} />
        <StatCard label="Approved"           value={analytics.approved}       icon="✅" color="green"  sub={`avg ${analytics.avgProcessingDays}d processing`} />
        <StatCard label="SLA Breached"       value={analytics.slaBreached}   icon="⚠️" color="red"    sub="require immediate attention" />
        <StatCard label="Deficiency Raised"  value={analytics.byStage["DeficiencyRaised"] ?? 0} icon="📌" color="amber" sub="awaiting compliance" />
      </div>

      {/* Quick Links */}
      <div>
        <h2 className="font-display text-xl font-semibold text-foreground mb-3">Quick Actions</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {shortcuts.map((s) => (
            <Link key={s.to} to={s.to} className={`flex items-start gap-3 rounded-xl border p-4 transition-all hover:shadow-md hover:-translate-y-0.5 ${s.color}`}>
              <span className="text-2xl">{s.icon}</span>
              <div>
                <p className="font-semibold text-sm text-foreground">{s.label}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{s.desc}</p>
              </div>
            </Link>
          ))}
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Recent Activity */}
        <div className="lg:col-span-2 rounded-2xl border border-border bg-card p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display text-lg font-semibold text-foreground">Recent Applications</h2>
            <Link to="/demo/approvalflow/applications" className="text-xs font-medium text-primary hover:underline">View all →</Link>
          </div>
          {recentApps.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No applications visible for your role.</p>
          ) : (
            <div className="space-y-1">
              {recentApps.map((app) => (
                <Link key={app.id} to="/demo/approvalflow/applications">
                  <AppRow app={app} role={role as Role} />
                </Link>
              ))}
            </div>
          )}
        </div>

        {/* Notifications + Overdue */}
        <div className="space-y-4">
          {/* Notifications */}
          <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-display text-base font-semibold text-foreground">Notifications</h2>
              {unread > 0 && <span className="rounded-full bg-red-500 text-white text-[10px] font-bold px-2 py-0.5">{unread}</span>}
            </div>
            {notifications.length === 0 ? (
              <p className="text-xs text-muted-foreground">No notifications.</p>
            ) : (
              <div className="space-y-2">
                {notifications.map((n) => (
                  <div key={n.id} className={`rounded-lg px-3 py-2 text-xs ${!n.readStatus ? "bg-accent/50 font-medium" : "text-muted-foreground"}`}>
                    <div className="flex items-start gap-1.5">
                      <span>{n.type === "urgent" ? "🔴" : n.type === "warning" ? "🟡" : "🔵"}</span>
                      <span className="leading-relaxed">{n.message}</span>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-1 ml-4">{new Date(n.sentOn).toLocaleDateString("en-IN")}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Overdue */}
          {overdueApps.length > 0 && (
            <div className="rounded-2xl border border-red-200 bg-red-50 p-4">
              <h2 className="font-semibold text-sm text-red-800 mb-2">⚠️ Overdue ({overdueApps.length})</h2>
              {overdueApps.map((app) => {
                const inst = afStore.getInstitution(app.institutionId);
                return (
                  <div key={app.id} className="text-xs text-red-700 py-1 border-t border-red-200 first:border-0">
                    <span className="font-semibold">{app.id}</span> · {inst?.name?.split(" ").slice(0, 3).join(" ")}
                    <br /><span className="text-red-500">{Math.abs(daysUntil(app.slaDeadline))}d overdue</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Stage pipeline summary */}
      <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
        <h2 className="font-display text-lg font-semibold text-foreground mb-4">Pipeline Overview</h2>
        <div className="flex flex-wrap gap-2">
          {Object.entries(analytics.byStage).map(([stage, count]) => (
            <div key={stage} className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-xs font-medium ${STAGE_COLORS[stage as keyof typeof STAGE_COLORS] ?? "bg-muted text-muted-foreground"}`}>
              <span>{count}</span>
              <span>{STAGE_LABELS[stage as keyof typeof STAGE_LABELS] ?? stage}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
