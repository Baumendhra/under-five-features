import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getDemoStudents,
  exportDemoCsv,
  batchVerifyDemoStudents,
  singleVerifyDemoStudent,
} from "@/lib/demo.functions";
import { useDemoRole } from "@/lib/demo-role-store";
import { evaluateStudentRecord, type StudentQualityEvaluation } from "@/lib/data-quality";
import { validateLocalApaar, type LocalApaarValidationResult } from "@/lib/apaar-orchestrator";
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
import { cn } from "@/lib/utils";
import type { StudentRecord } from "@/lib/students.functions";
import {
  ShieldCheck,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Sparkles,
  FileText,
  Clock,
  ArrowRight,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/demo/students")({
  ssr: false,
  head: () => ({ meta: [{ title: "Students Registry — EduTrace Demo" }] }),
  component: DemoStudents,
});

function ApaarDualBadge({ student }: { student: StudentRecord }) {
  const local = validateLocalApaar(student.apaar_id || "");
  const serverStatus = student.apaar_verify_status as string | undefined;

  return (
    <div className="flex flex-col gap-1 items-start text-[11px]">
      {/* 1. Gateway Status */}
      {serverStatus === "verified" ? (
        <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-[10px]">
          <CheckCircle2 className="h-3 w-3 text-emerald-600" /> Gateway Verified
        </Badge>
      ) : serverStatus === "not_found" ? (
        <Badge className="bg-red-100 text-red-800 border-red-300 gap-1 text-[10px]">
          <XCircle className="h-3 w-3 text-red-600" /> Gateway Not Found
        </Badge>
      ) : !student.apaar_id ? (
        <Badge variant="outline" className="text-muted-foreground text-[10px]">
          Missing APAAR
        </Badge>
      ) : (
        <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1 text-[10px]">
          <Clock className="h-3 w-3 text-amber-600" /> Gateway Pending
        </Badge>
      )}

      {/* 2. Local Validation Sub-Badge */}
      {student.apaar_id ? (
        local.isValid ? (
          <span className="text-[10px] text-emerald-700 font-medium">✓ Verhoeff Valid</span>
        ) : local.checksumStatus === "CHECKSUM_INVALID" ? (
          <span className="text-[10px] text-red-600 font-medium">✗ Verhoeff Bad Checksum</span>
        ) : (
          <span className="text-[10px] text-red-600 font-medium">✗ Bad Format</span>
        )
      ) : null}
    </div>
  );
}

function QualityBadge({
  quality,
  onClick,
}: {
  quality: StudentQualityEvaluation;
  onClick: () => void;
}) {
  const color =
    quality.overallScore >= 90
      ? "bg-emerald-100 text-emerald-800 border-emerald-300 hover:bg-emerald-200"
      : quality.overallScore >= 75
        ? "bg-blue-100 text-blue-800 border-blue-300 hover:bg-blue-200"
        : quality.overallScore >= 50
          ? "bg-amber-100 text-amber-800 border-amber-300 hover:bg-amber-200"
          : "bg-red-100 text-red-800 border-red-300 hover:bg-red-200";

  return (
    <button
      onClick={onClick}
      className={cn(
        "rounded-full border px-2 py-0.5 text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1",
        color,
      )}
      title="Click to view explainable data quality breakdown"
    >
      <span>{quality.overallScore}%</span>
      <span className="capitalize text-[10px] font-normal opacity-80">{quality.tier}</span>
    </button>
  );
}

function DemoStudents() {
  const queryClient = useQueryClient();
  const [currentRole, setRole] = useDemoRole();
  const { canExport, canImportStudents, canVerifyApaar } = useUserProfile();

  const { data: students = [], isLoading } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });

  const [search, setSearch] = useState("");
  const [apaarFilter, setApaarFilter] = useState<
    "all" | "verified" | "pending" | "invalid" | "missing"
  >("all");
  const [qualityFilter, setQualityFilter] = useState<"all" | "excellent" | "good" | "critical">(
    "all",
  );
  const [exporting, setExporting] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Quality Dialog State
  const [selectedQualityStudent, setSelectedQualityStudent] = useState<{
    student: StudentRecord;
    quality: StudentQualityEvaluation;
  } | null>(null);

  // Batch Verify Modal State
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [isBatchRunning, setIsBatchRunning] = useState(false);
  const [batchProgress, setBatchProgress] = useState(0);
  const [batchResult, setBatchResult] = useState<{
    processed: number;
    verified: number;
    failed: number;
  } | null>(null);

  if (currentRole === "student") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-8 text-center space-y-4 my-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-2xl">
          🛡️
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-amber-950">
            Role Boundary: Full Student Registry
          </h2>
          <p className="max-w-md mx-auto text-xs text-amber-900 leading-relaxed">
            As an enrolled <strong>Student</strong>, your access is focused on your personal
            academic profile, APAAR verification status, and data correction requests. Full registry
            browsing and batch verification operations are reserved for Officers and Institution
            Admins.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/demo/dashboard">← Return to My Student Portal</Link>
          </Button>
          <Button size="sm" onClick={() => setRole("officer")}>
            Switch to Officer Scrutiny →
          </Button>
        </div>
      </div>
    );
  }

  // Precompute quality for each student
  const studentsWithQuality = students.map((s) => ({
    student: s,
    quality: evaluateStudentRecord({
      id: s.id,
      student_id: s.student_id,
      apaar_id: s.apaar_id,
      name: s.name,
      dob: s.dob,
      programme_code: s.programme_code,
      category: s.category,
      intake_type: s.intake_type,
      contact: s.contact,
      gender: s.gender,
      apaar_verify_status: s.apaar_verify_status,
      consent_recorded: s.consent_recorded,
    }),
  }));

  const filtered = studentsWithQuality.filter(({ student: s, quality: q }) => {
    const query = search.trim().toLowerCase();
    const matchesSearch =
      !query ||
      [s.name, s.student_id, s.apaar_id, s.programme_code, s.contact].some((f) =>
        f?.toLowerCase().includes(query),
      );
    if (!matchesSearch) return false;

    // APAAR filter
    const local = validateLocalApaar(s.apaar_id || "");
    const serverStatus = s.apaar_verify_status;
    if (apaarFilter === "missing" && s.apaar_id) return false;
    if (apaarFilter === "invalid" && (local.isValid || !s.apaar_id)) return false;
    if (apaarFilter === "verified" && serverStatus !== "verified") return false;
    if (apaarFilter === "pending" && (serverStatus === "verified" || !s.apaar_id)) return false;

    // Quality filter
    if (qualityFilter === "excellent" && q.overallScore < 90) return false;
    if (qualityFilter === "good" && (q.overallScore < 75 || q.overallScore >= 90)) return false;
    if (qualityFilter === "critical" && q.overallScore >= 60) return false;

    return true;
  });

  async function handleSingleVerify(student: StudentRecord) {
    setVerifyingId(student.id);
    try {
      const res = await singleVerifyDemoStudent({ data: { studentId: student.id } });
      await queryClient.invalidateQueries({ queryKey: ["demo-students"] });
      await queryClient.invalidateQueries({ queryKey: ["demo-institutional-intelligence"] });

      if (res.status === "verified") {
        toast.success(`APAAR for ${student.name} successfully verified!`);
      } else {
        toast.error(`APAAR verification failed: Checksum or format invalid.`);
      }
    } catch {
      toast.error("Verification failed.");
    } finally {
      setVerifyingId(null);
    }
  }

  async function handleStartBatchVerification() {
    setIsBatchRunning(true);
    setBatchProgress(10);
    setBatchResult(null);

    // Simulate progressive stepping
    const timer1 = setTimeout(() => setBatchProgress(45), 250);
    const timer2 = setTimeout(() => setBatchProgress(75), 500);

    try {
      const res = await batchVerifyDemoStudents({ data: {} });
      setBatchProgress(100);
      setBatchResult(res);
      await queryClient.invalidateQueries({ queryKey: ["demo-students"] });
      await queryClient.invalidateQueries({ queryKey: ["demo-institutional-intelligence"] });
      toast.success(`Batch verification complete: ${res.verified} verified, ${res.failed} issues.`);
    } catch {
      toast.error("Batch verification failed.");
    } finally {
      clearTimeout(timer1);
      clearTimeout(timer2);
      setIsBatchRunning(false);
    }
  }

  async function handleExport(filteredOnly: boolean) {
    setExporting(true);
    try {
      const result = await exportDemoCsv();
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
      toast.error("Export failed.");
    } finally {
      setExporting(false);
    }
  }

  if (isLoading) return <p className="text-muted-foreground p-8 text-center">Loading registry…</p>;

  return (
    <div className="space-y-6 pb-16">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight text-foreground">
              Student Registry
            </h1>
            <Badge className="bg-amber-100 text-amber-800">Sprint 1 & 5 Demo</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {students.length} records in registry · Data Quality scoring & APAAR verification
            orchestration.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => {
              setIsBatchOpen(true);
              setBatchProgress(0);
              setBatchResult(null);
            }}
            className="gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
          >
            <Sparkles className="h-4 w-4" /> Batch Verify APAAR
          </Button>

          {canExport && (
            <Button
              variant="outline"
              size="sm"
              disabled={exporting}
              onClick={() => void handleExport(false)}
            >
              {exporting ? "Exporting…" : "Export CSV"}
            </Button>
          )}

          {canImportStudents && (
            <Button asChild variant="outline" size="sm">
              <Link to="/demo/import">Import CSV</Link>
            </Button>
          )}
        </div>
      </div>

      {/* ── Search and Filter Controls ─────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Input
          id="demo-student-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, APAAR, student ID…"
          className="max-w-xs text-xs"
        />

        <div className="flex flex-wrap items-center gap-3">
          {/* APAAR Filter */}
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-semibold text-muted-foreground">APAAR:</span>
            {(["all", "verified", "pending", "invalid", "missing"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setApaarFilter(f)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  apaarFilter === f
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {f}
              </button>
            ))}
          </div>

          {/* Quality Filter */}
          <div className="flex items-center gap-1.5 border-l border-border pl-3">
            <span className="text-xs font-semibold text-muted-foreground">Quality:</span>
            {(["all", "excellent", "good", "critical"] as const).map((q) => (
              <button
                key={q}
                onClick={() => setQualityFilter(q)}
                className={cn(
                  "rounded-full border px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  qualityFilter === q
                    ? "border-primary bg-primary text-primary-foreground"
                    : "border-border bg-background text-muted-foreground hover:bg-accent",
                )}
              >
                {q}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Students Table ─────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No students match your filter criteria.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card shadow-2xs">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Student Name</TableHead>
                <TableHead>Roll No</TableHead>
                <TableHead>APAAR ID</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>Programme</TableHead>
                <TableHead>Quality Score</TableHead>
                <TableHead>APAAR Dual Status</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map(({ student, quality }) => {
                const canVerify =
                  student.apaar_verify_status !== "verified" && Boolean(student.apaar_id);

                return (
                  <TableRow key={student.id}>
                    <TableCell>
                      <span className="font-semibold text-foreground">{student.name}</span>
                      <span className="block text-[11px] text-muted-foreground">
                        {student.category || "General"} · {student.intake_type || "Regular"}
                      </span>
                    </TableCell>
                    <TableCell className="font-mono text-xs text-foreground font-semibold">
                      {student.student_id ?? "—"}
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {student.apaar_id ? (
                        <span>
                          {student.apaar_id.slice(0, 4)}••••{student.apaar_id.slice(-4)}
                        </span>
                      ) : (
                        <span className="text-muted-foreground italic">None</span>
                      )}
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-xs text-muted-foreground">
                      {student.dob || <span className="text-red-500 font-medium">Missing</span>}
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline" className="font-semibold text-[11px]">
                        {student.programme_code ?? "—"}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <QualityBadge
                        quality={quality}
                        onClick={() => setSelectedQualityStudent({ student, quality })}
                      />
                    </TableCell>
                    <TableCell>
                      <ApaarDualBadge student={student} />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        {canVerify && (
                          <Button
                            variant="outline"
                            size="sm"
                            disabled={verifyingId === student.id}
                            onClick={() => void handleSingleVerify(student)}
                            className="h-7 text-xs"
                          >
                            {verifyingId === student.id ? "Verifying…" : "Verify"}
                          </Button>
                        )}
                        <Button variant="ghost" size="sm" asChild className="h-7 text-xs">
                          <Link to="/demo/corrections">Discrepancy</Link>
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* ── Data Quality Breakdown Modal ───────────────────────────── */}
      {selectedQualityStudent && (
        <Dialog
          open={!!selectedQualityStudent}
          onOpenChange={() => setSelectedQualityStudent(null)}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>Data Quality Analysis</span>
                <Badge variant="outline" className="text-xs uppercase">
                  {selectedQualityStudent.quality.tier}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                Detailed field evaluation for {selectedQualityStudent.student.name} (
                {selectedQualityStudent.student.student_id})
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              {/* Score Gauge */}
              <div className="flex items-center justify-between rounded-xl bg-muted/40 p-4 border border-border">
                <div>
                  <p className="text-xs font-semibold text-muted-foreground">
                    Overall Quality Score
                  </p>
                  <p className="font-display text-3xl font-extrabold text-foreground">
                    {selectedQualityStudent.quality.overallScore}
                    <span className="text-sm font-normal text-muted-foreground">/100</span>
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-muted-foreground">Priority Rank</p>
                  <Badge
                    variant="outline"
                    className={cn(
                      "uppercase text-[10px] font-bold mt-1",
                      selectedQualityStudent.quality.prioritization === "urgent"
                        ? "bg-red-100 text-red-800 border-red-300"
                        : "bg-blue-100 text-blue-800 border-blue-300",
                    )}
                  >
                    {selectedQualityStudent.quality.prioritization}
                  </Badge>
                </div>
              </div>

              {/* 3 Dimensions */}
              <div className="grid grid-cols-3 gap-2 text-center text-xs">
                <div className="rounded-lg border border-border p-2">
                  <p className="text-muted-foreground text-[10px]">Completeness</p>
                  <p className="font-bold text-foreground mt-0.5">
                    {selectedQualityStudent.quality.dimensions.completeness}%
                  </p>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <p className="text-muted-foreground text-[10px]">Validity</p>
                  <p className="font-bold text-foreground mt-0.5">
                    {selectedQualityStudent.quality.dimensions.validity}%
                  </p>
                </div>
                <div className="rounded-lg border border-border p-2">
                  <p className="text-muted-foreground text-[10px]">Verification</p>
                  <p className="font-bold text-foreground mt-0.5">
                    {selectedQualityStudent.quality.dimensions.verification}%
                  </p>
                </div>
              </div>

              {/* Issues List */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">
                  Diagnostic Issues ({selectedQualityStudent.quality.issues.length}):
                </p>

                {selectedQualityStudent.quality.issues.length === 0 ? (
                  <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded p-2">
                    ✓ All statutory fields complete, valid, and verified.
                  </p>
                ) : (
                  <div className="grid gap-2 max-h-48 overflow-y-auto">
                    {selectedQualityStudent.quality.issues.map((iss, i) => (
                      <div
                        key={i}
                        className={cn(
                          "rounded-lg border p-2.5 text-xs space-y-1",
                          iss.severity === "critical"
                            ? "border-red-300 bg-red-50/50"
                            : "border-amber-300 bg-amber-50/50",
                        )}
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-foreground capitalize">
                            Field: {iss.field}
                          </span>
                          <Badge variant="outline" className="text-[9px] uppercase font-bold">
                            {iss.severity}
                          </Badge>
                        </div>
                        <p className="text-muted-foreground">{iss.message}</p>
                        {iss.suggestedFix && (
                          <p className="text-[11px] text-primary font-medium">
                            Suggested Fix: {iss.suggestedFix}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="flex justify-between border-t border-border pt-3">
              <Button variant="outline" size="sm" onClick={() => setSelectedQualityStudent(null)}>
                Close
              </Button>
              <Button asChild size="sm">
                <Link to="/demo/corrections">Request Correction</Link>
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Batch Verification Orchestration Modal ─────────────────── */}
      <Dialog open={isBatchOpen} onOpenChange={setIsBatchOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Sparkles className="h-5 w-5 text-emerald-600" />
              <span>APAAR Batch Verification</span>
            </DialogTitle>
            <DialogDescription>
              Orchestrate local Verhoeff checksum validation and external gateway checks across all
              unverified records.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="space-y-2">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Progress:</span>
                <span>{batchProgress}%</span>
              </div>
              <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${batchProgress}%` }}
                />
              </div>
            </div>

            {batchResult && (
              <div className="rounded-xl border border-border bg-card p-4 space-y-2 text-xs">
                <p className="font-semibold text-foreground text-sm">Verification Summary</p>
                <div className="grid grid-cols-3 gap-2 text-center pt-1">
                  <div className="rounded-lg bg-muted p-2">
                    <p className="text-muted-foreground text-[10px]">Processed</p>
                    <p className="font-bold text-foreground text-base">{batchResult.processed}</p>
                  </div>
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2 text-emerald-900">
                    <p className="text-[10px]">Verified</p>
                    <p className="font-bold text-base">{batchResult.verified}</p>
                  </div>
                  <div className="rounded-lg bg-red-50 border border-red-200 p-2 text-red-900">
                    <p className="text-[10px]">Failed</p>
                    <p className="font-bold text-base">{batchResult.failed}</p>
                  </div>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 border-t border-border pt-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setIsBatchOpen(false)}
              disabled={isBatchRunning}
            >
              Close
            </Button>
            <Button
              size="sm"
              onClick={() => void handleStartBatchVerification()}
              disabled={isBatchRunning}
              className="bg-emerald-600 hover:bg-emerald-700 text-white gap-2"
            >
              {isBatchRunning ? (
                <>
                  <RefreshCw className="h-4 w-4 animate-spin" /> Orchestrating…
                </>
              ) : (
                "Run Verification Run"
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
