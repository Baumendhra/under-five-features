import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { studentsQueryOptions, insertStudents, type NewStudentRow } from "@/lib/students.functions";
import {
  parseStudentsCsv,
  reviewStudents,
  isDefaultSelected,
  STATUS_LABEL,
  type ReviewedStudent,
} from "@/lib/student-import";
import {
  evaluateImportBatch,
  maskApaar,
  maskContact,
  QUALITY_BAND_CONFIG,
  type BatchQualityReport,
} from "@/lib/data-quality";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Download,
  Info,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/import")({
  head: () => ({
    meta: [
      { title: "Import — EduTrace" },
      {
        name: "description",
        content: "Upload a CSV of students, review the checks, and save the rows you approve.",
      },
      { property: "og:title", content: "Import — EduTrace" },
      {
        property: "og:description",
        content: "Upload a CSV of students, review the checks, and save the rows you approve.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(studentsQueryOptions),
  component: ImportPage,
});

const IMPORTABLE_STATUSES = new Set(["valid", "missing_apaar", "invalid_apaar"]);

function ImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const importFn = useServerFn(insertStudents);
  const { data: existing } = useSuspenseQuery(studentsQueryOptions);

  const [fileName, setFileName] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedStudent[] | null>(null);
  const [batchQuality, setBatchQuality] = useState<BatchQualityReport | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [inspectIndex, setInspectIndex] = useState<number | null>(null);
  const [showQualityBreakdown, setShowQualityBreakdown] = useState(false);

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseStudentsCsv(text);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const existingRefs = existing.map((s) => ({
      apaar_id: s.apaar_id,
      name: s.name,
      dob: s.dob,
    }));
    const rows = reviewStudents(parsed.students, existingRefs);

    const duplicateIndices = new Set<number>();
    rows.forEach((r, idx) => {
      if (r.status === "duplicate_db" || r.status === "duplicate_file") {
        duplicateIndices.add(idx);
      }
    });

    const qualityReport = evaluateImportBatch(
      rows.map((r) => ({
        studentId: r.studentId,
        apaarId: r.apaarId,
        name: r.name,
        dob: r.dob,
        programmeCode: r.programmeCode,
        category: r.category,
        intakeType: r.intakeType,
        contact: r.contact,
      })),
      duplicateIndices,
    );

    setFileName(file.name);
    setReviewed(rows);
    setBatchQuality(qualityReport);
    setSelected(new Set(rows.filter((r) => isDefaultSelected(r.status)).map((r) => r.rowNumber)));
  }

  function exportBatchQualityCsv() {
    if (!batchQuality || !reviewed) return;
    const headers = [
      "RowNumber",
      "StudentID",
      "Name",
      "OverallScore",
      "QualityBand",
      "PriorityLevel",
      "CompletenessScore",
      "ValidityScore",
      "CriticalDefects",
      "HighIssues",
      "AllIssuesCount",
      "IssuesSummary",
      "RecommendedActions",
    ];
    const csvRows = [headers.join(",")];
    batchQuality.rowReports.forEach((rep, idx) => {
      const student = reviewed[idx];
      const issuesSummary = rep.issues
        .map((i) => `[${i.severity.toUpperCase()}] ${i.field}: ${i.title}`)
        .join(" | ");
      const actions = rep.issues.map((i) => `${i.field}: ${i.suggestedAction}`).join(" | ");
      const escape = (val: string | number | null | undefined) =>
        `"${String(val ?? "").replace(/"/g, '""')}"`;
      csvRows.push(
        [
          student?.rowNumber ?? idx + 1,
          escape(student?.studentId),
          escape(student?.name),
          rep.overallScore,
          escape(rep.band),
          escape(rep.priorityLevel),
          rep.completenessScore,
          rep.validityScore,
          rep.criticalCount,
          rep.highCount,
          rep.issues.length,
          escape(issuesSummary),
          escape(actions),
        ].join(","),
      );
    });
    const blob = new Blob([csvRows.join("\n")], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edutrace-quality-report-${fileName?.replace(/\.csv$/i, "") || "batch"}-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Batch quality report exported.");
  }

  function toggle(rowNumber: number, status: ReviewedStudent["status"]) {
    if (status === "duplicate_db" || status === "duplicate_file" || status === "missing_name")
      return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  const counts = useMemo(() => {
    const rows = reviewed ?? [];
    return {
      total: rows.length,
      ready: rows.filter((r) => r.status === "valid").length,
      flagged: rows.filter((r) => r.status === "missing_apaar" || r.status === "invalid_apaar")
        .length,
      duplicates: rows.filter((r) => r.status.startsWith("duplicate")).length,
      skipped: rows.filter((r) => r.status === "missing_name").length,
    };
  }, [reviewed]);

  async function handleImport() {
    if (!reviewed) return;
    const rows: NewStudentRow[] = reviewed
      .filter((r) => selected.has(r.rowNumber))
      .map(({ rowNumber: _rowNumber, status: _status, detail: _detail, ...student }) => student);
    if (rows.length === 0) {
      toast.error("Select at least one row to import.");
      return;
    }
    setImporting(true);
    try {
      const result = await importFn({ data: { rows } });
      toast.success(
        `${result.inserted.toLocaleString()} student${result.inserted === 1 ? "" : "s"} saved.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      void navigate({ to: "/students" });
    } catch {
      toast.error("The import didn't go through. Please try again.");
      setImporting(false);
    }
  }

  function reset() {
    setFileName(null);
    setReviewed(null);
    setBatchQuality(null);
    setSelected(new Set());
    setInspectIndex(null);
  }

  if (!reviewed) {
    return (
      <div>
        <h1 className="font-display text-3xl tracking-tight text-foreground">Import students</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV of your student list. You review every row before anything is saved.
        </p>
        <label className="mt-8 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center transition-colors hover:bg-accent">
          <span className="font-display text-2xl text-foreground">Drop your CSV here</span>
          <span className="max-w-sm text-sm text-muted-foreground">
            Expected columns: StudentID, APAAR_ID, Name, DOB, ProgrammeCode, Category, IntakeType,
            Contact. Missing columns are fine — Name is the only required one.
          </span>
          <Button asChild variant="outline" tabIndex={-1}>
            <span>Choose file</span>
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
        <p className="mt-4 text-center text-sm text-muted-foreground">
          Not sure about the format?{" "}
          <a
            href="/sample/student-upload-sample.csv"
            download
            className="font-medium text-primary underline underline-offset-4"
          >
            Download the sample CSV
          </a>
        </p>
      </div>
    );
  }

  const inspectedReport =
    inspectIndex !== null && batchQuality?.rowReports[inspectIndex]
      ? batchQuality.rowReports[inspectIndex]
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="font-display text-3xl tracking-tight text-foreground">Review import</h1>
            {batchQuality && (
              <Badge
                variant="outline"
                className={cn(
                  "border font-semibold",
                  QUALITY_BAND_CONFIG[
                    batchQuality.rowReports.length > 0
                      ? (batchQuality.rowReports[0]?.band ?? "good")
                      : "good"
                  ].border,
                  QUALITY_BAND_CONFIG[
                    batchQuality.averageScore >= 90
                      ? "excellent"
                      : batchQuality.averageScore >= 75
                        ? "good"
                        : batchQuality.averageScore >= 50
                          ? "needs_improvement"
                          : "critical"
                  ].badgeBg,
                  QUALITY_BAND_CONFIG[
                    batchQuality.averageScore >= 90
                      ? "excellent"
                      : batchQuality.averageScore >= 75
                        ? "good"
                        : batchQuality.averageScore >= 50
                          ? "needs_improvement"
                          : "critical"
                  ].badgeText,
                )}
              >
                Avg Quality: {batchQuality.averageScore}/100
              </Badge>
            )}
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {fileName} · {counts.total.toLocaleString()} row{counts.total === 1 ? "" : "s"} read.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {batchQuality && (
            <Button
              variant="outline"
              onClick={exportBatchQualityCsv}
              disabled={importing}
              className="gap-1.5"
            >
              <Download className="h-4 w-4" />
              Download Quality Report
            </Button>
          )}
          <Button variant="outline" onClick={reset} disabled={importing}>
            Start over
          </Button>
          <Button onClick={() => void handleImport()} disabled={importing || selected.size === 0}>
            {importing ? "Saving…" : `Import ${selected.size.toLocaleString()} selected`}
          </Button>
        </div>
      </div>

      {/* Primary counts grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Ready (Valid)", value: counts.ready },
          { label: "APAAR flagged", value: counts.flagged },
          { label: "Duplicates", value: counts.duplicates },
          { label: "No name", value: counts.skipped },
          { label: "Selected", value: selected.size },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className="font-display text-3xl text-foreground">{stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      {/* Batch Quality Intelligence Banner */}
      {batchQuality && (
        <div className="rounded-xl border border-border bg-card/80 p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <h2 className="font-display text-lg text-foreground">
                  Data Quality & Compliance Intelligence
                </h2>
                <p className="text-xs text-muted-foreground">
                  {batchQuality.validRecords} high-quality rows ·{" "}
                  {batchQuality.attentionNeededCount} require review · {batchQuality.invalidRecords}{" "}
                  critical defects
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowQualityBreakdown(!showQualityBreakdown)}
              className="gap-1 text-xs"
            >
              {showQualityBreakdown ? (
                <>
                  Hide detailed breakdown <ChevronUp className="h-4 w-4" />
                </>
              ) : (
                <>
                  View defect distributions <ChevronDown className="h-4 w-4" />
                </>
              )}
            </Button>
          </div>

          {showQualityBreakdown && (
            <div className="mt-4 border-t border-border pt-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">APAAR Status</p>
                  <div className="mt-2 space-y-1 text-xs">
                    <div className="flex justify-between">
                      <span className="text-emerald-700 dark:text-emerald-400">Verified</span>
                      <span className="font-semibold">
                        {batchQuality.apaarStatusBreakdown.verified}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-blue-700 dark:text-blue-400">Pending Gateway</span>
                      <span className="font-semibold">
                        {batchQuality.apaarStatusBreakdown.pending}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-amber-700 dark:text-amber-400">Missing</span>
                      <span className="font-semibold">
                        {batchQuality.apaarStatusBreakdown.missing}
                      </span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-rose-700 dark:text-rose-400">Invalid Format</span>
                      <span className="font-semibold">
                        {batchQuality.apaarStatusBreakdown.invalid}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-3 sm:col-span-2">
                  <p className="text-xs font-medium text-muted-foreground">Common Field Defects</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {Object.entries(batchQuality.missingFieldDistribution).map(([field, count]) => (
                      <Badge
                        key={`missing-${field}`}
                        variant="outline"
                        className="border-amber-300 bg-amber-50/50 text-[11px] text-amber-800 dark:bg-amber-950/20 dark:text-amber-300"
                      >
                        Missing {field}: {count}
                      </Badge>
                    ))}
                    {Object.entries(batchQuality.invalidFieldDistribution).map(([field, count]) => (
                      <Badge
                        key={`invalid-${field}`}
                        variant="outline"
                        className="border-rose-300 bg-rose-50/50 text-[11px] text-rose-800 dark:bg-rose-950/20 dark:text-rose-300"
                      >
                        Invalid {field}: {count}
                      </Badge>
                    ))}
                    {Object.keys(batchQuality.missingFieldDistribution).length === 0 &&
                      Object.keys(batchQuality.invalidFieldDistribution).length === 0 && (
                        <p className="text-xs text-muted-foreground">
                          No field-level defects observed.
                        </p>
                      )}
                  </div>
                </div>

                <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                  <p className="text-xs font-medium text-muted-foreground">Recommended Action</p>
                  <p className="mt-1 text-xs text-muted-foreground">
                    Rows with missing names or duplicate conflicts are locked. Correct them in the
                    CSV or proceed with valid rows.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Import</TableHead>
              <TableHead>Row</TableHead>
              <TableHead>Quality Score</TableHead>
              <TableHead>Roll no</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>APAAR ID</TableHead>
              <TableHead>Date of birth</TableHead>
              <TableHead>Programme</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviewed.map((student, idx) => {
              const locked =
                student.status === "duplicate_db" ||
                student.status === "duplicate_file" ||
                student.status === "missing_name";
              const checked = selected.has(student.rowNumber);
              const flagged = student.status !== "valid" && !locked;
              const rowReport = batchQuality?.rowReports[idx];
              const bandConfig = rowReport ? QUALITY_BAND_CONFIG[rowReport.band] : null;

              return (
                <TableRow key={student.rowNumber} className={cn(flagged && "bg-muted/40")}>
                  <TableCell>
                    <Checkbox
                      checked={checked}
                      disabled={locked || importing}
                      onCheckedChange={() => toggle(student.rowNumber, student.status)}
                      aria-label={`Import row ${student.rowNumber}`}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {student.rowNumber}
                  </TableCell>
                  <TableCell>
                    {rowReport && bandConfig ? (
                      <button
                        type="button"
                        onClick={() => setInspectIndex(idx)}
                        className="group flex items-center gap-1.5 text-left transition-opacity hover:opacity-80"
                        title="Click to view full quality breakdown"
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
                          {rowReport.overallScore}/100 · {bandConfig.label}
                        </Badge>
                        {rowReport.issues.length > 0 && (
                          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-muted text-[10px] font-bold text-muted-foreground group-hover:bg-accent">
                            {rowReport.issues.length}
                          </span>
                        )}
                      </button>
                    ) : (
                      <span className="text-xs text-muted-foreground">—</span>
                    )}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {student.studentId ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">{student.name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{maskApaar(student.apaarId)}</TableCell>
                  <TableCell className="whitespace-nowrap">{student.dob ?? "—"}</TableCell>
                  <TableCell>{student.programmeCode ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn(
                        locked && "bg-muted text-muted-foreground",
                        flagged && "bg-destructive/15 text-destructive",
                        !locked && !flagged && "bg-accent text-accent-foreground",
                      )}
                    >
                      {STATUS_LABEL[student.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Duplicates and rows without a name cannot be imported. Click any row's Quality badge to
          inspect detailed field-level issues and suggested fixes.
        </p>
        <Button onClick={() => void handleImport()} disabled={importing || selected.size === 0}>
          {importing ? "Saving…" : `Import ${selected.size.toLocaleString()} selected`}
        </Button>
      </div>

      {/* Row Quality Inspection Dialog */}
      <Dialog open={inspectIndex !== null} onOpenChange={(open) => !open && setInspectIndex(null)}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          {inspectedReport && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-3">
                  <DialogTitle className="font-display text-xl text-foreground">
                    Data Quality Report: {inspectedReport.name}
                  </DialogTitle>
                  <Badge
                    className={cn(
                      "px-2.5 py-0.5 text-xs font-semibold",
                      QUALITY_BAND_CONFIG[inspectedReport.band].badgeBg,
                      QUALITY_BAND_CONFIG[inspectedReport.band].badgeText,
                    )}
                  >
                    {inspectedReport.overallScore}/100 ·{" "}
                    {QUALITY_BAND_CONFIG[inspectedReport.band].label}
                  </Badge>
                </div>
                <DialogDescription>
                  {inspectedReport.studentId ? `Roll No: ${inspectedReport.studentId} · ` : ""}
                  Priority:{" "}
                  <span className="font-medium capitalize">{inspectedReport.priorityLevel}</span> (
                  {inspectedReport.priorityReason})
                </DialogDescription>
              </DialogHeader>

              {/* Dimension Progress */}
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="space-y-1 rounded-lg border border-border p-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Completeness Score</span>
                    <span className="font-semibold">{inspectedReport.completenessScore}%</span>
                  </div>
                  <Progress value={inspectedReport.completenessScore} className="h-1.5" />
                </div>
                <div className="space-y-1 rounded-lg border border-border p-3">
                  <div className="flex justify-between text-xs">
                    <span className="text-muted-foreground">Validity Score</span>
                    <span className="font-semibold">{inspectedReport.validityScore}%</span>
                  </div>
                  <Progress value={inspectedReport.validityScore} className="h-1.5" />
                </div>
              </div>

              {/* Sub-dimensions */}
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded border border-border/80 bg-muted/20 p-2">
                  <p className="text-[11px] text-muted-foreground">Identity</p>
                  <p className="font-bold text-foreground">
                    {inspectedReport.dimensionScores.identity}%
                  </p>
                </div>
                <div className="rounded border border-border/80 bg-muted/20 p-2">
                  <p className="text-[11px] text-muted-foreground">APAAR</p>
                  <p className="font-bold text-foreground">
                    {inspectedReport.dimensionScores.apaar}%
                  </p>
                </div>
                <div className="rounded border border-border/80 bg-muted/20 p-2">
                  <p className="text-[11px] text-muted-foreground">Contact</p>
                  <p className="font-bold text-foreground">
                    {inspectedReport.dimensionScores.contact}%
                  </p>
                </div>
                <div className="rounded border border-border/80 bg-muted/20 p-2">
                  <p className="text-[11px] text-muted-foreground">Academic</p>
                  <p className="font-bold text-foreground">
                    {inspectedReport.dimensionScores.academic}%
                  </p>
                </div>
              </div>

              {/* Issues List */}
              <div className="mt-4 space-y-3">
                <h4 className="text-sm font-semibold text-foreground">
                  Identified Issues ({inspectedReport.issues.length})
                </h4>
                {inspectedReport.issues.length === 0 ? (
                  <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-xs text-emerald-800 dark:border-emerald-900/50 dark:bg-emerald-950/20 dark:text-emerald-300">
                    ✓ All statutory and format validation rules satisfied. No corrective action
                    required.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {inspectedReport.issues.map((issue) => (
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
                            ⚠️ Requires verification against physical certificates / student
                            submission.
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Passed Checks */}
              {inspectedReport.passedChecks.length > 0 && (
                <div className="mt-3 border-t border-border pt-3">
                  <h4 className="text-xs font-semibold text-muted-foreground">
                    Verified Checks ({inspectedReport.passedChecks.length})
                  </h4>
                  <ul className="mt-1.5 grid grid-cols-1 sm:grid-cols-2 gap-1 text-[11px] text-muted-foreground">
                    {inspectedReport.passedChecks.map((check, i) => (
                      <li key={i} className="flex items-center gap-1.5">
                        <span className="text-emerald-500">✓</span> {check}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
