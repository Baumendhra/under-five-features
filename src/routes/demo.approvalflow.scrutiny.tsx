/**
 * ApprovalFlow AI — Scrutiny Officer Dashboard
 * Route: /demo/approvalflow/scrutiny
 */
import { createFileRoute } from "@tanstack/react-router";
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { useDemoRole } from "@/lib/demo-role-store";
import {
  afStore, getDemoUserId, daysUntil, isOverdue,
  STAGE_LABELS, STAGE_COLORS, APP_TYPE_LABELS,
  type Application, type AppStage,
} from "@/lib/approval-flow";

export const Route = createFileRoute("/demo/approvalflow/scrutiny")({
  ssr: false,
  head: () => ({ meta: [{ title: "Scrutiny Dashboard — ApprovalFlow AI" }] }),
  component: ScrutinyDashboard,
});

function StageBadge({ stage }: { stage: AppStage }) {
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STAGE_COLORS[stage]}`}>{STAGE_LABELS[stage]}</span>;
}

function ChecklistItem({ label, done, onToggle }: { label: string; done: boolean; onToggle: () => void }) {
  return (
    <label className={`flex items-start gap-3 rounded-xl p-3 cursor-pointer transition-colors border ${done ? "border-green-200 bg-green-50" : "border-border hover:bg-accent/30"}`}>
      <div onClick={onToggle} className={`mt-0.5 w-5 h-5 rounded-md flex items-center justify-center border-2 shrink-0 transition-colors ${done ? "bg-green-500 border-green-500" : "border-border"}`}>
        {done && <span className="text-white text-[10px] font-bold">✓</span>}
      </div>
      <span className={`text-sm ${done ? "text-muted-foreground line-through" : "text-foreground"}`}>{label}</span>
    </label>
  );
}

function AppCard({ app, onAction }: { app: Application; onAction: (appId: string, action: "approve_scrutiny" | "raise_deficiency" | "send_evc") => void }) {
  const inst = afStore.getInstitution(app.institutionId);
  const docs = afStore.getDocumentsForApp(app.id);
  const tasks = afStore.getTasksForApp(app.id);
  const overdue = isOverdue(app);
  const dl = daysUntil(app.slaDeadline);
  const unverifiedDocs = docs.filter((d) => !d.verified);
  const openTasks = tasks.filter((t) => t.status === "Open" || t.status === "InProgress");

  const [checklist, setChecklist] = useState<Record<string, boolean>>({
    "Application form complete": false,
    "All mandatory annexures uploaded": docs.length > 0,
    "Faculty list verified": docs.some((d) => d.type === "FacultyList" && d.verified),
    "Lease/NOC documents verified": docs.some((d) => (d.type === "Lease" || d.type === "NOC") && d.verified),
    "Financial statements reviewed": docs.some((d) => d.type === "FinancialStatement" && d.verified),
    "No OCR flag discrepancies": docs.every((d) => !d.flags?.length),
  });

  const allClear = Object.values(checklist).every(Boolean);

  return (
    <div className={`rounded-2xl border shadow-sm overflow-hidden transition-all hover:shadow-md ${overdue ? "border-red-300" : "border-border"}`}>
      {/* Card header */}
      <div className={`px-5 py-4 ${overdue ? "bg-red-50" : "bg-card"}`}>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-bold text-foreground">{app.id}</span>
              <StageBadge stage={app.currentStage} />
              {overdue && <span className="rounded-full bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5">⚠ OVERDUE</span>}
            </div>
            <p className="text-sm text-muted-foreground mt-0.5 truncate">{inst?.name}</p>
            <p className="text-xs text-muted-foreground">{APP_TYPE_LABELS[app.appType]} · {app.region} · {inst?.state}</p>
          </div>
          <div className="text-right shrink-0">
            <p className={`text-sm font-bold ${dl < 0 ? "text-red-600" : dl < 7 ? "text-amber-600" : "text-foreground"}`}>
              {dl < 0 ? `${Math.abs(dl)}d OD` : `${dl}d`}
            </p>
            <p className="text-[10px] text-muted-foreground">SLA {app.slaDeadline}</p>
          </div>
        </div>

        {/* Stats row */}
        <div className="mt-3 flex gap-4 text-xs">
          <span className={`font-medium ${unverifiedDocs.length > 0 ? "text-amber-600" : "text-green-600"}`}>
            📄 {docs.length - unverifiedDocs.length}/{docs.length} docs verified
          </span>
          <span className={`font-medium ${openTasks.length > 0 ? "text-red-600" : "text-green-600"}`}>
            ✅ {openTasks.length} open task{openTasks.length !== 1 ? "s" : ""}
          </span>
          <span className="text-muted-foreground">🔁 {app.deficiencyCount} deficienc{app.deficiencyCount === 1 ? "y" : "ies"}</span>
        </div>

        {/* OCR flags */}
        {docs.flatMap((d) => d.flags ?? []).length > 0 && (
          <div className="mt-2 rounded-lg bg-red-50 border border-red-200 px-3 py-2">
            <p className="text-[10px] font-semibold text-red-700 mb-1">⚠ OCR / Validation Flags</p>
            {docs.flatMap((d) => (d.flags ?? []).map((f) => `${d.type}: ${f}`)).map((f, i) => (
              <p key={i} className="text-xs text-red-600">{f}</p>
            ))}
          </div>
        )}
      </div>

      {/* Checklist */}
      <div className="px-5 py-4 border-t border-border bg-background">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-3">Scrutiny Checklist</p>
        <div className="space-y-2">
          {Object.entries(checklist).map(([label, done]) => (
            <ChecklistItem key={label} label={label} done={done}
              onToggle={() => setChecklist((prev) => ({ ...prev, [label]: !prev[label] }))} />
          ))}
        </div>

        {/* Progress */}
        <div className="mt-3">
          <div className="flex justify-between text-xs text-muted-foreground mb-1">
            <span>Checklist progress</span>
            <span>{Object.values(checklist).filter(Boolean).length}/{Object.keys(checklist).length}</span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className="h-full rounded-full bg-green-500 transition-all"
              style={{ width: `${(Object.values(checklist).filter(Boolean).length / Object.keys(checklist).length) * 100}%` }}
            />
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="px-5 py-3 border-t border-border bg-muted/30 flex gap-2 flex-wrap">
        <Button size="sm" variant="outline" className="text-xs border-red-300 text-red-700 hover:bg-red-50"
          onClick={() => onAction(app.id, "raise_deficiency")}>
          📌 Raise Deficiency
        </Button>
        {app.currentStage === "ScrutinyPending" && (
          <>
            <Button size="sm" variant="outline" className="text-xs border-violet-300 text-violet-700 hover:bg-violet-50"
              onClick={() => onAction(app.id, "send_evc")} disabled={!allClear}>
              🗓️ Send to EVC
            </Button>
            <Button size="sm" className="text-xs" onClick={() => onAction(app.id, "approve_scrutiny")} disabled={!allClear}>
              ✅ Approve Scrutiny
            </Button>
          </>
        )}
        {!allClear && <p className="text-[10px] text-muted-foreground self-center">Complete checklist to enable approval actions</p>}
      </div>
    </div>
  );
}

function ScrutinyDashboard() {
  const [role] = useDemoRole();
  const userId = getDemoUserId(role as Parameters<typeof getDemoUserId>[0]);
  const [toast, setToast] = useState("");
  const [filterOverdue, setFilterOverdue] = useState(false);
  const [tick, setTick] = useState(0);

  function notify(msg: string) { setToast(msg); setTimeout(() => setToast(""), 3000); }

  const apps = useMemo(() => {
    const all = afStore.applications.filter((a) =>
      ["ScrutinyPending", "DeficiencyRaised", "CompliancePending"].includes(a.currentStage)
    );
    return filterOverdue ? all.filter(isOverdue) : all;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filterOverdue, tick]);

  function handleAction(appId: string, action: "approve_scrutiny" | "raise_deficiency" | "send_evc") {
    try {
      if (action === "approve_scrutiny") {
        afStore.transitionStage(appId, "RecommendationPending", userId, "Scrutiny approved — all checklist items cleared");
        notify("✅ Application moved to Recommendation Pending");
      } else if (action === "send_evc") {
        afStore.transitionStage(appId, "EVCPending", userId, "Scrutiny complete — forwarded for EVC");
        notify("📅 Application sent for EVC scheduling");
      } else if (action === "raise_deficiency") {
        const desc = `Deficiency raised via Scrutiny Dashboard on ${new Date().toLocaleDateString("en-IN")}`;
        const due = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
        afStore.raiseDeficiency(appId, desc, due, userId, userId);
        notify("⚠️ Deficiency raised — institution notified");
      }
      setTick((t) => t + 1);
    } catch (e: unknown) { notify(`❌ ${e instanceof Error ? e.message : String(e)}`); }
  }

  const pendingCount = apps.length;
  const overdueCount = apps.filter(isOverdue).length;

  return (
    <div className="space-y-6">
      {/* Toast */}
      {toast && (
        <div className="fixed top-4 right-4 z-50 rounded-xl bg-foreground text-background px-4 py-2 text-sm font-medium shadow-xl animate-in slide-in-from-right-4">
          {toast}
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            🔍 Scrutiny Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {pendingCount} application{pendingCount !== 1 ? "s" : ""} pending scrutiny
            {overdueCount > 0 && <span className="ml-2 font-semibold text-red-600">· {overdueCount} overdue</span>}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm cursor-pointer">
            <input type="checkbox" checked={filterOverdue} onChange={(e) => setFilterOverdue(e.target.checked)}
              className="rounded border-border" />
            <span>Show overdue only</span>
          </label>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid gap-4 sm:grid-cols-3">
        {[
          { label: "Under Scrutiny",     value: apps.filter((a) => a.currentStage === "ScrutinyPending").length,   color: "amber",  icon: "🔍" },
          { label: "Deficiency Raised",  value: apps.filter((a) => a.currentStage === "DeficiencyRaised").length,  color: "red",    icon: "📌" },
          { label: "Compliance Pending", value: apps.filter((a) => a.currentStage === "CompliancePending").length, color: "orange", icon: "📋" },
        ].map(({ label, value, color, icon }) => (
          <div key={label} className={`rounded-2xl border p-4 ${color === "amber" ? "border-amber-200 bg-amber-50" : color === "red" ? "border-red-200 bg-red-50" : "border-orange-200 bg-orange-50"}`}>
            <div className="flex items-center gap-2">
              <span className="text-xl">{icon}</span>
              <div>
                <p className="text-xs text-muted-foreground font-medium">{label}</p>
                <p className="text-2xl font-bold text-foreground">{value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Application cards */}
      {apps.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-border bg-card p-16 text-center">
          <p className="text-4xl mb-3">🎉</p>
          <p className="text-muted-foreground">No applications pending scrutiny.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {apps.map((app) => (
            <AppCard key={`${app.id}-${tick}`} app={app} onAction={handleAction} />
          ))}
        </div>
      )}
    </div>
  );
}
