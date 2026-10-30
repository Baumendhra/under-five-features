/**
 * ApprovalFlow AI — Applications List + Detail Panel
 * Route: /demo/approvalflow/applications
 */
import { createFileRoute } from "@tanstack/react-router";
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
  STAGE_TRANSITIONS,
  APP_TYPE_LABELS,
  type Application,
  type AppStage,
  type AppStatus,
  type AppType,
  type DocType,
} from "@/lib/approval-flow";
import type { Role } from "@/hooks/use-user-profile";

export const Route = createFileRoute("/demo/approvalflow/applications")({
  ssr: false,
  head: () => ({ meta: [{ title: "Applications — ApprovalFlow AI" }] }),
  component: ApplicationsPage,
});

// ─── Stage Badge ─────────────────────────────────────────────────────────────
function StageBadge({ stage }: { stage: AppStage }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold ${STAGE_COLORS[stage]}`}
    >
      {STAGE_LABELS[stage]}
    </span>
  );
}

// ─── Workflow Stepper ─────────────────────────────────────────────────────────
const FLOW_STEPS: AppStage[] = [
  "Submitted",
  "ScrutinyPending",
  "DeficiencyRaised",
  "CompliancePending",
  "EVCPending",
  "EVCScheduled",
  "EVCCompleted",
  "RecommendationPending",
  "FinalDecision",
  "Approved",
];
function WorkflowStepper({ current }: { current: AppStage }) {
  const activeIdx = FLOW_STEPS.indexOf(current);
  return (
    <div className="flex items-center gap-0 overflow-x-auto pb-2">
      {FLOW_STEPS.filter((s) => s !== "DeficiencyRaised" && s !== "CompliancePending").map(
        (stage, i, arr) => {
          const stageIdx = FLOW_STEPS.indexOf(stage);
          const done = stageIdx < activeIdx;
          const active = stageIdx === activeIdx;
          return (
            <div key={stage} className="flex items-center shrink-0">
              <div className={`flex flex-col items-center`}>
                <div
                  className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all
                ${
                  active
                    ? "bg-blue-600 border-blue-600 text-white shadow-lg shadow-blue-200"
                    : done
                      ? "bg-green-500 border-green-500 text-white"
                      : "bg-background border-border text-muted-foreground"
                }`}
                >
                  {done ? "✓" : i + 1}
                </div>
                <span
                  className={`text-[9px] mt-1 text-center leading-tight max-w-[52px] ${active ? "font-semibold text-blue-600" : done ? "text-green-600" : "text-muted-foreground"}`}
                >
                  {STAGE_LABELS[stage].replace(" ", "\n")}
                </span>
              </div>
              {i < arr.length - 1 && (
                <div
                  className={`h-0.5 w-8 mx-0.5 mb-4 rounded ${done ? "bg-green-400" : "bg-border"}`}
                />
              )}
            </div>
          );
        },
      )}
    </div>
  );
}

// ─── Detail Panel ─────────────────────────────────────────────────────────────
function ApplicationDetail({
  app,
  userId,
  onClose,
  onRefresh,
}: {
  app: Application;
  userId: string;
  onClose: () => void;
  onRefresh: () => void;
}) {
  const inst = afStore.getInstitution(app.institutionId);
  const docs = afStore.getDocumentsForApp(app.id);
  const tasks = afStore.getTasksForApp(app.id);
  const auditLogs = afStore.getAuditLogsForApp(app.id);
  const assignedUser = app.assignedTo ? afStore.getUser(app.assignedTo) : null;

  const [activeTab, setActiveTab] = useState<"overview" | "docs" | "tasks" | "audit">("overview");
  const [transitionStage, setTransitionStage] = useState<AppStage | "">("");
  const [transitionRemarks, setTransitionRemarks] = useState("");
  const [deficiencyDesc, setDeficiencyDesc] = useState("");
  const [deficiencyDue, setDeficiencyDue] = useState("");
  const [showDefForm, setShowDefForm] = useState(false);
  const [showUploadForm, setShowUploadForm] = useState(false);
  const [uploadType, setUploadType] = useState<DocType>("Annexure1");
  const [uploadName, setUploadName] = useState("");
  const [toast, setToast] = useState("");

  const allowed = STAGE_TRANSITIONS[app.currentStage] ?? [];
  const overdue = isOverdue(app);

  function notify(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  }

  function doTransition() {
    if (!transitionStage) return;
    try {
      afStore.transitionStage(
        app.id,
        transitionStage as AppStage,
        userId,
        transitionRemarks || undefined,
      );
      notify(`✅ Moved to ${STAGE_LABELS[transitionStage as AppStage]}`);
      setTransitionStage("");
      setTransitionRemarks("");
      onRefresh();
    } catch (e: unknown) {
      notify(`❌ ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  function doRaiseDeficiency() {
    if (!deficiencyDesc || !deficiencyDue) return;
    afStore.raiseDeficiency(
      app.id,
      deficiencyDesc,
      deficiencyDue,
      app.assignedTo ?? userId,
      userId,
    );
    notify("⚠️ Deficiency raised");
    setDeficiencyDesc("");
    setDeficiencyDue("");
    setShowDefForm(false);
    onRefresh();
  }

  function doUpload() {
    if (!uploadName) return;
    const ocrData = uploadType === "FacultyList" ? { facultyCount: "45" } : undefined;
    afStore.uploadDocument(app.id, uploadType, uploadName, userId, ocrData);
    notify("📄 Document uploaded");
    setUploadName("");
    setShowUploadForm(false);
    onRefresh();
  }

  const TABS = ["overview", "docs", "tasks", "audit"] as const;
  const TAB_LABELS = {
    overview: "Overview",
    docs: `Documents (${docs.length})`,
    tasks: `Tasks (${tasks.length})`,
    audit: "Audit Trail",
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-end bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative h-full w-full max-w-2xl overflow-y-auto bg-background shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Toast */}
        {toast && (
          <div className="fixed top-4 right-4 z-[60] rounded-xl bg-foreground text-background px-4 py-2 text-sm font-medium shadow-xl animate-in slide-in-from-right-4">
            {toast}
          </div>
        )}

        {/* Header */}
        <div className="sticky top-0 z-10 border-b border-border bg-background/95 backdrop-blur px-6 py-4">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold text-lg text-foreground">{app.id}</span>
                <StageBadge stage={app.currentStage} />
                {overdue && (
                  <span className="rounded-full bg-red-100 text-red-700 text-[10px] font-bold px-2 py-0.5">
                    ⚠ OVERDUE
                  </span>
                )}
              </div>
              <p className="text-sm text-muted-foreground mt-0.5">
                {inst?.name} · {APP_TYPE_LABELS[app.appType]}
              </p>
            </div>
            <button
              onClick={onClose}
              className="rounded-full p-1.5 hover:bg-accent text-muted-foreground"
            >
              ✕
            </button>
          </div>
          {/* Stepper */}
          <div className="mt-4 overflow-x-auto">
            <WorkflowStepper current={app.currentStage} />
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-border px-6">
          <div className="flex gap-0">
            {TABS.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${activeTab === tab ? "border-primary text-primary" : "border-transparent text-muted-foreground hover:text-foreground"}`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {/* ── OVERVIEW TAB ── */}
          {activeTab === "overview" && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {[
                  ["Application ID", app.id],
                  ["Institution", inst?.name ?? "-"],
                  ["AICTE ID", inst?.aicteId ?? "-"],
                  ["Region / State", `${app.region} · ${inst?.state ?? "-"}`],
                  ["App Type", APP_TYPE_LABELS[app.appType]],
                  ["Submitted On", app.submittedOn],
                  ["SLA Deadline", app.slaDeadline],
                  ["Days Remaining", `${daysUntil(app.slaDeadline)}d`],
                  ["Deficiencies", String(app.deficiencyCount)],
                  ["Assigned To", assignedUser?.name ?? "Unassigned"],
                ].map(([k, v]) => (
                  <div key={k} className="rounded-lg bg-accent/30 px-3 py-2">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {k}
                    </p>
                    <p className="text-sm font-medium text-foreground mt-0.5">{v}</p>
                  </div>
                ))}
              </div>

              {app.remarks && (
                <div className="rounded-lg border border-border bg-muted/40 p-3">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Remarks
                  </p>
                  <p className="text-sm text-foreground">{app.remarks}</p>
                </div>
              )}

              {app.evcDate && (
                <div className="rounded-lg border border-violet-200 bg-violet-50 p-3">
                  <p className="text-xs font-semibold text-violet-700 mb-1">📅 EVC Visit</p>
                  <p className="text-sm text-violet-800">
                    Date: <strong>{app.evcDate}</strong>
                  </p>
                  {app.evcCommittee && (
                    <p className="text-xs text-violet-600 mt-1">
                      Committee: {app.evcCommittee.join(", ")}
                    </p>
                  )}
                </div>
              )}

              {/* Stage Transition */}
              {allowed.length > 0 && (
                <div className="rounded-xl border border-border p-4">
                  <p className="text-sm font-semibold text-foreground mb-3">🔄 Transition Stage</p>
                  <div className="flex gap-2 flex-wrap mb-3">
                    {allowed.map((s) => (
                      <button
                        key={s}
                        onClick={() => setTransitionStage(s)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-medium border transition-colors
                          ${transitionStage === s ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-primary hover:text-primary"}`}
                      >
                        → {STAGE_LABELS[s]}
                      </button>
                    ))}
                  </div>
                  {transitionStage && (
                    <>
                      <textarea
                        className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-ring"
                        rows={2}
                        placeholder="Remarks (optional)"
                        value={transitionRemarks}
                        onChange={(e) => setTransitionRemarks(e.target.value)}
                      />
                      <Button size="sm" className="mt-2" onClick={doTransition}>
                        Confirm → {STAGE_LABELS[transitionStage as AppStage]}
                      </Button>
                    </>
                  )}
                </div>
              )}

              {/* Raise Deficiency */}
              {app.currentStage === "ScrutinyPending" && (
                <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
                  <div className="flex items-center justify-between mb-2">
                    <p className="text-sm font-semibold text-amber-800">📌 Raise Deficiency</p>
                    <button
                      onClick={() => setShowDefForm(!showDefForm)}
                      className="text-xs text-amber-700 font-medium underline"
                    >
                      {showDefForm ? "Cancel" : "Add"}
                    </button>
                  </div>
                  {showDefForm && (
                    <div className="space-y-2">
                      <textarea
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-amber-400"
                        rows={2}
                        placeholder="Describe the deficiency…"
                        value={deficiencyDesc}
                        onChange={(e) => setDeficiencyDesc(e.target.value)}
                      />
                      <input
                        type="date"
                        className="w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400"
                        value={deficiencyDue}
                        onChange={(e) => setDeficiencyDue(e.target.value)}
                      />
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-amber-400 text-amber-800 hover:bg-amber-100"
                        onClick={doRaiseDeficiency}
                      >
                        Raise Deficiency
                      </Button>
                    </div>
                  )}
                </div>
              )}
            </>
          )}

          {/* ── DOCS TAB ── */}
          {activeTab === "docs" && (
            <>
              <div className="flex items-center justify-between">
                <p className="text-sm font-semibold text-foreground">Uploaded Documents</p>
                <button
                  onClick={() => setShowUploadForm(!showUploadForm)}
                  className="text-xs text-primary font-medium underline"
                >
                  {showUploadForm ? "Cancel" : "+ Upload"}
                </button>
              </div>
              {showUploadForm && (
                <div className="rounded-xl border border-border p-4 space-y-3">
                  <select
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background"
                    value={uploadType}
                    onChange={(e) => setUploadType(e.target.value as DocType)}
                  >
                    {(
                      [
                        "Annexure1",
                        "Lease",
                        "NOC",
                        "FacultyList",
                        "FinancialStatement",
                        "BuildingPlan",
                        "Undertaking",
                      ] as DocType[]
                    ).map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                  <input
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-ring"
                    placeholder="Filename (e.g. noc_signed.pdf)"
                    value={uploadName}
                    onChange={(e) => setUploadName(e.target.value)}
                  />
                  <Button size="sm" onClick={doUpload}>
                    Upload Document
                  </Button>
                </div>
              )}
              {docs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No documents uploaded yet.
                </p>
              ) : (
                <div className="space-y-2">
                  {docs.map((doc) => (
                    <div
                      key={doc.id}
                      className={`rounded-xl border p-3 ${doc.verified ? "border-green-200 bg-green-50" : "border-border bg-card"}`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-xs font-semibold text-foreground">
                              {doc.type}
                            </span>
                            <span
                              className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${doc.verified ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}`}
                            >
                              {doc.verified ? "✓ Verified" : "Pending"}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5 truncate">
                            📄 {doc.fileName}
                          </p>
                          {doc.ocrExtracted && (
                            <p className="text-[10px] text-blue-600 mt-1">
                              OCR:{" "}
                              {Object.entries(doc.ocrExtracted)
                                .map(([k, v]) => `${k}=${v}`)
                                .join(", ")}
                            </p>
                          )}
                          {doc.flags?.map((f, i) => (
                            <p key={i} className="text-[10px] text-red-600 mt-1">
                              ⚠ {f}
                            </p>
                          ))}
                        </div>
                        {!doc.verified && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 border-green-300 text-green-700 hover:bg-green-50 shrink-0"
                            onClick={() => {
                              afStore.verifyDocument(doc.id, userId);
                              notify("✅ Document verified");
                              onRefresh();
                            }}
                          >
                            Verify
                          </Button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {/* ── TASKS TAB ── */}
          {activeTab === "tasks" && (
            <div className="space-y-3">
              {tasks.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No tasks for this application.
                </p>
              ) : (
                tasks.map((task) => {
                  const dl = daysUntil(task.dueDate);
                  return (
                    <div
                      key={task.id}
                      className={`rounded-xl border p-4 ${task.status === "Resolved" ? "border-green-200 bg-green-50/50 opacity-70" : dl < 0 ? "border-red-200 bg-red-50" : "border-border bg-card"}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span
                              className={`text-[10px] rounded-full px-2 py-0.5 font-semibold ${
                                task.type === "Deficiency"
                                  ? "bg-amber-100 text-amber-700"
                                  : task.type === "EVCVisit"
                                    ? "bg-violet-100 text-violet-700"
                                    : task.type === "Compliance"
                                      ? "bg-green-100 text-green-700"
                                      : "bg-blue-100 text-blue-700"
                              }`}
                            >
                              {task.type}
                            </span>
                            <span
                              className={`text-[10px] rounded-full px-2 py-0.5 font-medium ${
                                task.status === "Resolved"
                                  ? "bg-green-100 text-green-700"
                                  : task.status === "InProgress"
                                    ? "bg-blue-100 text-blue-700"
                                    : task.status === "Overdue"
                                      ? "bg-red-100 text-red-700"
                                      : "bg-muted text-muted-foreground"
                              }`}
                            >
                              {task.status}
                            </span>
                          </div>
                          <p className="text-sm text-foreground mt-1">{task.description}</p>
                          <p
                            className={`text-xs mt-1 ${dl < 0 ? "text-red-600 font-medium" : dl < 7 ? "text-amber-600" : "text-muted-foreground"}`}
                          >
                            Due: {task.dueDate}{" "}
                            {dl < 0 ? `(${Math.abs(dl)}d overdue)` : `(${dl}d left)`}
                          </p>
                          {task.remarks && (
                            <p className="text-xs text-muted-foreground mt-1 italic">
                              {task.remarks}
                            </p>
                          )}
                        </div>
                        {task.status !== "Resolved" && task.status !== "Closed" && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-xs h-7 shrink-0"
                            onClick={() => {
                              afStore.resolveTask(task.id, userId, "Resolved via dashboard");
                              notify("✅ Task resolved");
                              onRefresh();
                            }}
                          >
                            Resolve
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* ── AUDIT TAB ── */}
          {activeTab === "audit" && (
            <div className="relative space-y-0">
              {auditLogs.length === 0 ? (
                <p className="text-sm text-muted-foreground py-4 text-center">
                  No audit entries yet.
                </p>
              ) : (
                <div className="space-y-0 border-l-2 border-border ml-3">
                  {auditLogs.map((log) => {
                    const actor = afStore.getUser(log.userId);
                    return (
                      <div key={log.id} className="relative pl-5 pb-5">
                        <div className="absolute -left-[9px] top-0.5 w-4 h-4 rounded-full border-2 border-background bg-primary" />
                        <p className="text-xs font-semibold text-foreground">{log.action}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5">
                          {actor?.name ?? log.userId} ·{" "}
                          {new Date(log.timestamp).toLocaleString("en-IN")}
                        </p>
                        {log.fromStage && log.toStage && (
                          <p className="text-[10px] text-primary mt-0.5">
                            {STAGE_LABELS[log.fromStage]} → {STAGE_LABELS[log.toStage]}
                          </p>
                        )}
                        {log.remarks && (
                          <p className="text-[10px] text-muted-foreground italic mt-0.5">
                            {log.remarks}
                          </p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
function ApplicationsPage() {
  const [role] = useDemoRole();
  const userId = getDemoUserId(role as Parameters<typeof getDemoUserId>[0]);
  const [search, setSearch] = useState("");
  const [filterStage, setFilterStage] = useState<AppStage | "">("");
  const [filterRegion, setFilterRegion] = useState("");
  const [filterType, setFilterType] = useState<AppType | "">("");
  const [filterStatus, setFilterStatus] = useState<AppStatus | "">("");
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // force re-render after mutations

  const allApps = useMemo(
    () =>
      afStore.searchApplications(search, {
        stage: filterStage || undefined,
        region: filterRegion || undefined,
        appType: filterType || undefined,
        status: filterStatus || undefined,
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, filterStage, filterRegion, filterType, filterStatus, tick],
  );

  // Role-based filtering
  const apps = useMemo(() => {
    const roleApps = afStore.getApplicationsForRole(
      role as Parameters<typeof getDemoUserId>[0],
      userId,
    );
    const roleIds = new Set(roleApps.map((a) => a.id));
    return allApps.filter((a) => roleIds.has(a.id));
  }, [allApps, role, userId]);

  const selectedApp = selectedAppId ? afStore.getApplication(selectedAppId) : null;

  const regions = [...new Set(afStore.applications.map((a) => a.region))].sort();
  const stages = Object.keys(STAGE_LABELS) as AppStage[];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-foreground">
            Applications
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {apps.length} result{apps.length !== 1 ? "s" : ""} · role: <strong>{role}</strong>
          </p>
        </div>
      </div>

      {/* Search & Filters */}
      <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          <input
            className="sm:col-span-2 lg:col-span-2 rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder="🔍  Search by App ID, institution name or AICTE ID…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <select
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={filterStage}
            onChange={(e) => setFilterStage(e.target.value as AppStage | "")}
          >
            <option value="">All Stages</option>
            {stages.map((s) => (
              <option key={s} value={s}>
                {STAGE_LABELS[s]}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={filterRegion}
            onChange={(e) => setFilterRegion(e.target.value)}
          >
            <option value="">All Regions</option>
            {regions.map((r) => (
              <option key={r} value={r}>
                {r}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            value={filterType}
            onChange={(e) => setFilterType(e.target.value as AppType | "")}
          >
            <option value="">All Types</option>
            {(["EoA", "NewInst", "NewCourse", "Closure"] as AppType[]).map((t) => (
              <option key={t} value={t}>
                {APP_TYPE_LABELS[t]}
              </option>
            ))}
          </select>
        </div>
        {(search || filterStage || filterRegion || filterType || filterStatus) && (
          <button
            onClick={() => {
              setSearch("");
              setFilterStage("");
              setFilterRegion("");
              setFilterType("");
              setFilterStatus("");
            }}
            className="mt-2 text-xs text-muted-foreground underline"
          >
            Clear filters
          </button>
        )}
      </div>

      {/* Table */}
      <div className="rounded-2xl border border-border bg-card shadow-sm overflow-hidden">
        {apps.length === 0 ? (
          <div className="py-16 text-center">
            <p className="text-4xl mb-3">🔍</p>
            <p className="text-muted-foreground text-sm">
              No applications match the current filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/40">
                  {["App ID", "Institution", "Type", "Region", "Stage", "SLA", "Status", ""].map(
                    (h) => (
                      <th
                        key={h}
                        className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground"
                      >
                        {h}
                      </th>
                    ),
                  )}
                </tr>
              </thead>
              <tbody>
                {apps.map((app) => {
                  const inst = afStore.getInstitution(app.institutionId);
                  const overdue = isOverdue(app);
                  const dl = daysUntil(app.slaDeadline);
                  return (
                    <tr
                      key={app.id}
                      className={`border-b border-border last:border-0 hover:bg-accent/30 cursor-pointer transition-colors ${overdue ? "bg-red-50/30" : ""}`}
                      onClick={() => setSelectedAppId(app.id)}
                    >
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1.5">
                          <span className="font-semibold text-foreground">{app.id}</span>
                          {overdue && (
                            <span className="text-[9px] bg-red-100 text-red-600 rounded-full px-1.5 py-0.5 font-bold">
                              OD
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground truncate max-w-[180px]">
                          {inst?.name}
                        </p>
                        <p className="text-[10px] text-muted-foreground">{inst?.aicteId}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{app.appType}</td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{app.region}</td>
                      <td className="px-4 py-3">
                        <StageBadge stage={app.currentStage} />
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-xs font-medium ${dl < 0 ? "text-red-600" : dl < 7 ? "text-amber-600" : "text-muted-foreground"}`}
                        >
                          {dl < 0 ? `${Math.abs(dl)}d OD` : `${dl}d`}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={`text-[10px] rounded-full px-2 py-0.5 font-semibold ${
                            app.status === "Approved"
                              ? "bg-green-100 text-green-700"
                              : app.status === "Rejected"
                                ? "bg-red-100 text-red-700"
                                : app.status === "Returned"
                                  ? "bg-amber-100 text-amber-700"
                                  : "bg-blue-100 text-blue-700"
                          }`}
                        >
                          {app.status}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 text-xs"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedAppId(app.id);
                          }}
                        >
                          View →
                        </Button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Detail Panel */}
      {selectedApp && (
        <ApplicationDetail
          app={selectedApp}
          userId={userId}
          onClose={() => setSelectedAppId(null)}
          onRefresh={() => {
            setTick((t) => t + 1);
            setSelectedAppId(null);
            setTimeout(() => setSelectedAppId(selectedApp.id), 10);
          }}
        />
      )}
    </div>
  );
}
