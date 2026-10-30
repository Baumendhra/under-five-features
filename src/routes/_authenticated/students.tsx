import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { studentsQueryOptions } from "@/lib/students.functions";
import { verifyStudentApaar, exportStudentsCsv } from "@/lib/edutrace.functions";
import { apaarStatus } from "@/lib/student-import";
import {
  evaluateStudentRecord,
  maskApaar,
  maskContact,
  QUALITY_BAND_CONFIG,
  type StudentQualityReport,
  type QualityBand,
} from "@/lib/data-quality";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  CheckCircle2,
  ArrowUpDown,
} from "lucide-react";
import type { StudentRecord } from "@/lib/students.functions";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({
    meta: [
      { title: "Students — EduTrace" },
      {
        name: "description",
        content: "Browse every student in your registry with APAAR verification status.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(studentsQueryOptions),
  component: StudentsPage,
});

function ApaarBadge({ student }: { student: StudentRecord }) {
  const local = apaarStatus(student.apaar_id);
  const serverStatus = student.apaar_verify_status ?? undefined;

  if (local === "missing") {
    return (
      <Badge variant="outline" className="text-muted-foreground">
        No APAAR
      </Badge>
    );
  }
  if (local === "invalid") {
    return <Badge variant="destructive">Bad APAAR</Badge>;
  }
  // 12-digit — show server verification status
  if (serverStatus === "verified") {
    return (
      <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
        ✓ Verified
      </Badge>
    );
  }
  if (serverStatus === "not_found") {
    return (
      <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">
        Not found
      </Badge>
    );
  }
  if (serverStatus === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return (
    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
      ⏳ Pending
    </Badge>
  );
}

function StudentsPage() {
  const { data: students } = useSuspenseQuery(studentsQueryOptions);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "missing" | "invalid" | "pending" | "verified">(
    "all",
  );
  const [qualityFilter, setQualityFilter] = useState<"all" | QualityBand>("all");
  const [sortBy, setSortBy] = useState<"default" | "quality_asc" | "quality_desc">("default");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [selectedStudentForQuality, setSelectedStudentForQuality] = useState<{
    student: StudentRecord;
    report: StudentQualityReport;
  } | null>(null);

  const queryClient = useQueryClient();
  const verifyFn = useServerFn(verifyStudentApaar);
  const exportFn = useServerFn(exportStudentsCsv);
  const { canExport, canImportStudents } = useUserProfile();

  const studentReportsMap = useMemo(() => {
    const map = new Map<string, StudentQualityReport>();
    for (const s of students) {
      map.set(
        s.id,
        evaluateStudentRecord({
          id: s.id,
          studentId: s.student_id,
          apaarId: s.apaar_id,
          name: s.name,
          dob: s.dob,
          programmeCode: s.programme_code,
          category: s.category,
          intakeType: s.intake_type,
          contact: s.contact,
          gender: s.gender,
          admissionYear: s.admission_year,
          apaarVerifyStatus: s.apaar_verify_status,
          institutionId: s.institution_id,
        }),
      );
    }
    return map;
  }, [students]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    let result = students.filter((s) => {
      const matchesSearch =
        !q ||
        [s.name, s.student_id, s.apaar_id, s.programme_code, s.contact].some((f) =>
          f?.toLowerCase().includes(q),
        );

      if (!matchesSearch) return false;
      const local = apaarStatus(s.apaar_id);
      const serverStatus = s.apaar_verify_status ?? undefined;

      if (filter === "missing") return local === "missing";
      if (filter === "invalid") return local === "invalid";
      if (filter === "pending")
        return local === "verified" && (!serverStatus || serverStatus === "pending");
      if (filter === "verified") return serverStatus === "verified";
      return true;
    });

    if (qualityFilter !== "all") {
      result = result.filter((s) => {
        const rep = studentReportsMap.get(s.id);
        return rep?.band === qualityFilter;
      });
    }

    if (sortBy === "quality_asc") {
      result.sort((a, b) => {
        const scoreA = studentReportsMap.get(a.id)?.overallScore ?? 100;
        const scoreB = studentReportsMap.get(b.id)?.overallScore ?? 100;
        return scoreA - scoreB;
      });
    } else if (sortBy === "quality_desc") {
      result.sort((a, b) => {
        const scoreA = studentReportsMap.get(a.id)?.overallScore ?? 100;
        const scoreB = studentReportsMap.get(b.id)?.overallScore ?? 100;
        return scoreB - scoreA;
      });
    }

    return result;
  }, [students, search, filter, qualityFilter, sortBy, studentReportsMap]);

  async function handleVerify(student: StudentRecord) {
    if (!student.apaar_id) return;
    setVerifyingId(student.id);
    try {
      const result = await verifyFn({ data: { studentId: student.id, apaarId: student.apaar_id } });
      if (result.status === "verified") {
        toast.success(`APAAR ${student.apaar_id} verified ✓`);
      } else if (result.status === "not_found") {
        toast.warning(`APAAR ${student.apaar_id} not found in registry`);
      } else {
        toast.error(`Verification failed: ${result.message}`);
      }
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    } catch {
      toast.error("Verification request failed.");
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleExport(filtered: boolean) {
    setExporting(true);
    try {
      const filterStatus = filtered && filter !== "all" ? filter : "all";
      const result = await exportFn({ data: { filterStatus } });
      // Trigger browser download
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = result.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.filename}`);
    } catch {
      toast.error("Export failed. Please try again.");
    } finally {
      setExporting(false);
    }
  }

  const counts = {
    all: students.length,
    missing: students.filter((s) => apaarStatus(s.apaar_id) === "missing").length,
    invalid: students.filter((s) => apaarStatus(s.apaar_id) === "invalid").length,
    pending: students.filter((s) => {
      const local = apaarStatus(s.apaar_id);
      const ss = s.apaar_verify_status;
      return local === "verified" && (!ss || ss === "pending");
    }).length,
    verified: students.filter((s) => s.apaar_verify_status === "verified").length,
  };

  const qualityCounts = useMemo(() => {
    const qCounts = { excellent: 0, good: 0, needs_improvement: 0, critical: 0 };
    for (const rep of studentReportsMap.values()) {
      qCounts[rep.band]++;
    }
    return qCounts;
  }, [studentReportsMap]);

  const FILTERS = [
    { key: "all", label: `All (${counts.all})` },
    { key: "verified", label: `✓ Verified (${counts.verified})` },
    { key: "pending", label: `⏳ Pending (${counts.pending})` },
    { key: "missing", label: `Missing APAAR (${counts.missing})` },
    { key: "invalid", label: `Bad APAAR (${counts.invalid})` },
  ] as const;

  const QUALITY_FILTERS = [
    { key: "all", label: "All Quality Bands" },
    { key: "excellent", label: `Excellent (${qualityCounts.excellent})` },
    { key: "good", label: `Good (${qualityCounts.good})` },
    { key: "needs_improvement", label: `Needs Improvement (${qualityCounts.needs_improvement})` },
    { key: "critical", label: `Critical (${qualityCounts.critical})` },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {students.length.toLocaleString()} record{students.length !== 1 ? "s" : ""} · showing{" "}
            {filtered.length.toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <>
              <Button
                id="export-filtered-btn"
                variant="outline"
                size="sm"
                disabled={exporting || filtered.length === 0}
                onClick={() => void handleExport(true)}
              >
                {exporting ? "Exporting…" : `Export filtered (${filtered.length})`}
              </Button>
              <Button
                id="export-all-btn"
                variant="outline"
                size="sm"
                disabled={exporting || students.length === 0}
                onClick={() => void handleExport(false)}
              >
                Export all ({students.length})
              </Button>
            </>
          )}
          {canImportStudents && (
            <Button asChild variant="outline" size="sm">
              <a href="/import">Import more</a>
            </Button>
          )}
        </div>
      </div>

      {/* Search and Filters */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Input
            id="student-search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name, roll no, APAAR, programme…"
            className="max-w-sm"
          />

          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Sort:</span>
            <div className="flex rounded-lg border border-border p-0.5 text-xs bg-muted/30">
              <button
                type="button"
                onClick={() => setSortBy("default")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  sortBy === "default"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Default
              </button>
              <button
                type="button"
                onClick={() => setSortBy("quality_asc")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  sortBy === "quality_asc"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
                title="Triage most critical records first"
              >
                Lowest Quality First
              </button>
              <button
                type="button"
                onClick={() => setSortBy("quality_desc")}
                className={cn(
                  "rounded-md px-2.5 py-1 font-medium transition-colors",
                  sortBy === "quality_desc"
                    ? "bg-background text-foreground shadow-xs"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                Highest Quality First
              </button>
            </div>
          </div>
        </div>

        {/* Filter bars */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border/60 py-2.5">
          {/* APAAR filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground mr-1">Status:</span>
            {FILTERS.map(({ key, label }) => (
              <button
                key={key}
                id={`filter-${key}`}
                onClick={() => setFilter(key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  filter === key
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {/* Quality filters */}
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-medium text-muted-foreground mr-1">Quality:</span>
            {QUALITY_FILTERS.map(({ key, label }) => (
              <button
                key={key}
                id={`quality-filter-${key}`}
                onClick={() => setQualityFilter(key)}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-medium transition-colors",
                  qualityFilter === key
                    ? "bg-foreground text-background"
                    : "bg-muted text-muted-foreground hover:bg-accent",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {students.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No students yet. Import your first CSV to build the registry.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Roll no</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Quality Score</TableHead>
                <TableHead>APAAR ID</TableHead>
                <TableHead>Date of birth</TableHead>
                <TableHead>Programme</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Intake</TableHead>
                <TableHead>Contact</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((student) => {
                const local = apaarStatus(student.apaar_id);
                const serverStatus = student.apaar_verify_status ?? undefined;
                const canVerify =
                  local === "verified" && (!serverStatus || serverStatus === "pending");
                const rep = studentReportsMap.get(student.id);
                const bandConfig = rep ? QUALITY_BAND_CONFIG[rep.band] : null;

                return (
                  <TableRow
                    key={student.id}
                    className={cn(
                      local === "missing" && "bg-amber-50/50 dark:bg-amber-900/10",
                      local === "invalid" && "bg-red-50/50 dark:bg-red-900/10",
                    )}
                  >
                    <TableCell className="whitespace-nowrap font-mono text-xs">
                      {student.student_id ?? "—"}
                    </TableCell>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell>
                      {rep && bandConfig ? (
                        <button
                          type="button"
                          onClick={() => setSelectedStudentForQuality({ student, report: rep })}
                          className="group flex items-center gap-1.5 text-left transition-opacity hover:opacity-80"
                          title="Click to view detailed quality diagnostics"
                        >
                          <Badge
                            variant="outline"
                            className={cn(
                              "px-2 py-0.5 text-xs font-medium cursor-pointer",
                              bandConfig.badgeBg,
                              bandConfig.badgeText,
                              bandConfig.border,
                            )}
                          >
                            {rep.overallScore}/100 · {bandConfig.label}
                          </Badge>
                          {rep.issues.length > 0 && (
                            <span
                              className={cn(
                                "flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-bold",
                                rep.criticalCount > 0
                                  ? "bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-300"
                                  : rep.highCount > 0
                                    ? "bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300"
                                    : "bg-muted text-muted-foreground",
                              )}
                            >
                              {rep.issues.length}
                            </span>
                          )}
                        </button>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <ApaarBadge student={student} />
                    </TableCell>
                    <TableCell className="whitespace-nowrap">{student.dob ?? "—"}</TableCell>
                    <TableCell>{student.programme_code ?? "—"}</TableCell>
                    <TableCell>{student.category ?? "—"}</TableCell>
                    <TableCell>{student.intake_type ?? "—"}</TableCell>
                    <TableCell className="max-w-40 truncate text-xs">
                      {maskContact(student.contact)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1.5">
                        {canVerify && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 text-xs"
                            disabled={verifyingId === student.id}
                            onClick={() => void handleVerify(student)}
                            id={`verify-${student.id}`}
                          >
                            {verifyingId === student.id ? "…" : "Verify"}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-7 px-2 text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            if (rep) {
                              setSelectedStudentForQuality({ student, report: rep });
                            }
                          }}
                        >
                          Details
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={10} className="py-8 text-center text-muted-foreground">
                    No students match current filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Student Quality Deep-Inspection Dialog */}
      <Dialog
        open={selectedStudentForQuality !== null}
        onOpenChange={(open) => !open && setSelectedStudentForQuality(null)}
      >
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {selectedStudentForQuality && (
            <>
              <DialogHeader>
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <DialogTitle className="font-display text-xl text-foreground">
                    {selectedStudentForQuality.student.name}
                  </DialogTitle>
                  <Badge
                    className={cn(
                      "px-2.5 py-0.5 text-xs font-semibold",
                      QUALITY_BAND_CONFIG[selectedStudentForQuality.report.band].badgeBg,
                      QUALITY_BAND_CONFIG[selectedStudentForQuality.report.band].badgeText,
                    )}
                  >
                    {selectedStudentForQuality.report.overallScore}/100 ·{" "}
                    {QUALITY_BAND_CONFIG[selectedStudentForQuality.report.band].label}
                  </Badge>
                </div>
                <DialogDescription>
                  {selectedStudentForQuality.student.student_id ? (
                    <span className="font-mono">
                      Roll: {selectedStudentForQuality.student.student_id} ·{" "}
                    </span>
                  ) : (
                    ""
                  )}
                  {selectedStudentForQuality.student.programme_code ?? "No Programme"} ·{" "}
                  {selectedStudentForQuality.student.dob ?? "No DOB"} · Priority:{" "}
                  <span className="font-semibold capitalize text-foreground">
                    {selectedStudentForQuality.report.priorityLevel}
                  </span>
                </DialogDescription>
              </DialogHeader>

              {/* Priority Callout */}
              {selectedStudentForQuality.report.priorityLevel !== "none" && (
                <div
                  className={cn(
                    "rounded-lg border p-3 text-xs",
                    selectedStudentForQuality.report.priorityLevel === "critical"
                      ? "border-rose-300 bg-rose-50/60 text-rose-900 dark:bg-rose-950/20 dark:text-rose-300"
                      : selectedStudentForQuality.report.priorityLevel === "high"
                        ? "border-amber-300 bg-amber-50/60 text-amber-900 dark:bg-amber-950/20 dark:text-amber-300"
                        : "border-blue-300 bg-blue-50/60 text-blue-900 dark:bg-blue-950/20 dark:text-blue-300",
                  )}
                >
                  <span className="font-semibold capitalize">
                    {selectedStudentForQuality.report.priorityLevel} Action Required:{" "}
                  </span>
                  {selectedStudentForQuality.report.priorityReason}
                </div>
              )}

              {/* Score Breakdown Cards */}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1 rounded-lg border border-border p-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Completeness</span>
                    <span className="font-semibold">
                      {selectedStudentForQuality.report.completenessScore}%
                    </span>
                  </div>
                  <Progress
                    value={selectedStudentForQuality.report.completenessScore}
                    className="h-1.5"
                  />
                </div>
                <div className="space-y-1 rounded-lg border border-border p-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Validity</span>
                    <span className="font-semibold">
                      {selectedStudentForQuality.report.validityScore}%
                    </span>
                  </div>
                  <Progress
                    value={selectedStudentForQuality.report.validityScore}
                    className="h-1.5"
                  />
                </div>
                <div className="space-y-1 rounded-lg border border-border p-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Verification</span>
                    <span className="font-semibold">
                      {selectedStudentForQuality.report.verificationScore}%
                    </span>
                  </div>
                  <Progress
                    value={selectedStudentForQuality.report.verificationScore}
                    className="h-1.5"
                  />
                </div>
              </div>

              {/* Sub-dimension Score Grid */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded border border-border/80 bg-muted/20 p-2">
                  <p className="text-[11px] text-muted-foreground">Identity</p>
                  <p className="font-bold text-foreground">
                    {selectedStudentForQuality.report.dimensionScores.identity}%
                  </p>
                </div>
                <div className="rounded border border-border/80 bg-muted/20 p-2">
                  <p className="text-[11px] text-muted-foreground">APAAR</p>
                  <p className="font-bold text-foreground">
                    {selectedStudentForQuality.report.dimensionScores.apaar}%
                  </p>
                </div>
                <div className="rounded border border-border/80 bg-muted/20 p-2">
                  <p className="text-[11px] text-muted-foreground">Contact</p>
                  <p className="font-bold text-foreground">
                    {selectedStudentForQuality.report.dimensionScores.contact}%
                  </p>
                </div>
                <div className="rounded border border-border/80 bg-muted/20 p-2">
                  <p className="text-[11px] text-muted-foreground">Academic</p>
                  <p className="font-bold text-foreground">
                    {selectedStudentForQuality.report.dimensionScores.academic}%
                  </p>
                </div>
              </div>

              {/* Field-level Issues */}
              <div className="space-y-3">
                <h4 className="text-sm font-semibold text-foreground">
                  Field-Level Issues ({selectedStudentForQuality.report.issues.length})
                </h4>
                {selectedStudentForQuality.report.issues.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
                    ✓ Record complies with all statutory and quality requirements. No discrepancies
                    detected.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {selectedStudentForQuality.report.issues.map((issue) => (
                      <div
                        key={issue.id}
                        className={cn(
                          "rounded-lg border p-3 text-xs space-y-1.5",
                          issue.severity === "critical"
                            ? "border-rose-200 bg-rose-50/40 dark:border-rose-900/40 dark:bg-rose-950/20"
                            : issue.severity === "high"
                              ? "border-amber-200 bg-amber-50/40 dark:border-amber-900/40 dark:bg-amber-950/20"
                              : "border-border bg-card",
                        )}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            {issue.severity === "critical" ? (
                              <AlertOctagon className="h-4 w-4 text-rose-600" />
                            ) : issue.severity === "high" ? (
                              <AlertTriangle className="h-4 w-4 text-amber-600" />
                            ) : (
                              <Info className="h-4 w-4 text-blue-600" />
                            )}
                            <span className="font-semibold text-foreground">{issue.title}</span>
                          </div>
                          <Badge
                            variant="outline"
                            className={cn(
                              "text-[10px] capitalize",
                              issue.severity === "critical"
                                ? "border-rose-300 text-rose-700 dark:text-rose-400"
                                : issue.severity === "high"
                                  ? "border-amber-300 text-amber-700 dark:text-amber-400"
                                  : "border-muted-foreground/30 text-muted-foreground",
                            )}
                          >
                            {issue.severity} (-{issue.deduction} pts)
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{issue.explanation}</p>
                        {issue.maskedValue && (
                          <p className="text-[11px] font-mono text-muted-foreground">
                            Value: <span className="font-semibold">{issue.maskedValue}</span>
                          </p>
                        )}
                        <div className="rounded bg-background/80 p-2 text-foreground">
                          <span className="font-medium text-primary">Recommended Action: </span>
                          {issue.suggestedAction}
                        </div>
                        {issue.humanVerificationRequired && (
                          <p className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">
                            ⚠️ Requires verification against physical documents or student
                            submission.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Verified Checks */}
              {selectedStudentForQuality.report.passedChecks.length > 0 && (
                <div className="border-t border-border pt-3">
                  <h4 className="text-xs font-semibold text-muted-foreground">
                    Verified Checks ({selectedStudentForQuality.report.passedChecks.length})
                  </h4>
                  <ul className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                    {selectedStudentForQuality.report.passedChecks.map((check, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" /> {check}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Dialog Actions */}
              <div className="flex items-center justify-end gap-2 border-t border-border pt-3">
                {apaarStatus(selectedStudentForQuality.student.apaar_id) === "verified" &&
                  (!selectedStudentForQuality.student.apaar_verify_status ||
                    selectedStudentForQuality.student.apaar_verify_status === "pending") && (
                    <Button
                      size="sm"
                      disabled={verifyingId === selectedStudentForQuality.student.id}
                      onClick={async () => {
                        const s = selectedStudentForQuality.student;
                        setSelectedStudentForQuality(null);
                        await handleVerify(s);
                      }}
                    >
                      Verify APAAR with Gateway
                    </Button>
                  )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setSelectedStudentForQuality(null)}
                >
                  Close
                </Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
