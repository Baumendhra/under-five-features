import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { dashboardStatsQueryOptions, studentsQueryOptions } from "@/lib/students.functions";
import { correctionAnalyticsQueryOptions } from "@/lib/correction-requests.functions";
import { duplicateAnalyticsQueryOptions } from "@/lib/edutrace.functions";
import { intakeIntelligenceQueryOptions } from "@/lib/intake-intelligence.functions";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
  ComposedChart,
  Line,
} from "recharts";
import { apaarStatus } from "@/lib/student-import";
import {
  evaluateStudentRecord,
  aggregateInstitutionQuality,
  classifyQualityBand,
  QUALITY_BAND_CONFIG,
} from "@/lib/data-quality";
import {
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  Info,
  ArrowRight,
  GitPullRequest,
  Clock,
  CheckCircle2,
  XCircle,
  Users,
  ShieldAlert,
  TrendingUp,
  BarChart3,
  Sliders,
  ChevronDown,
  ChevronUp,
  Layers,
  Building2,
  Calculator,
} from "lucide-react";
import { cn } from "@/lib/utils";

// Re-export studentsQueryOptions for the loader
export { studentsQueryOptions };

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — EduTrace" },
      {
        name: "description",
        content:
          "Overview of your student registry: totals, APAAR verification status and recent entries.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(studentsQueryOptions),
  component: Dashboard,
});

const CATEGORY_COLORS = ["#4ade80", "#60a5fa", "#f97316", "#a78bfa", "#fb7185", "#34d399"];
const PIE_COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6"];

function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: "green" | "red" | "yellow" | "blue";
  icon?: string;
}) {
  const accentClass = accent
    ? {
        green: "border-l-4 border-l-green-500",
        red: "border-l-4 border-l-red-400",
        yellow: "border-l-4 border-l-amber-400",
        blue: "border-l-4 border-l-blue-400",
      }[accent]
    : "";

  return (
    <div
      className={`rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md ${accentClass}`}
    >
      {icon && <div className="mb-2 text-2xl">{icon}</div>}
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="font-display text-4xl text-foreground">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Dashboard() {
  const { isStudent } = useUserProfile();
  const { data: students } = useSuspenseQuery(studentsQueryOptions);
  const { data: correctionAnalytics } = useQuery(correctionAnalyticsQueryOptions);
  const { data: duplicateAnalytics } = useQuery(duplicateAnalyticsQueryOptions);
  const { data: intakeIntelligence } = useQuery(intakeIntelligenceQueryOptions());

  const [scenarioAdjustment, setScenarioAdjustment] = useState<number>(0);
  const [showExplanation, setShowExplanation] = useState<boolean>(false);

  const simulatedDemand = useMemo(() => {
    if (!intakeIntelligence) return 0;
    return Math.max(
      0,
      Math.round(intakeIntelligence.projectedDemandTotal * (1 + scenarioAdjustment / 100)),
    );
  }, [intakeIntelligence, scenarioAdjustment]);

  const simulatedUtilization = useMemo(() => {
    if (!intakeIntelligence || intakeIntelligence.totalApprovedCapacity === 0) return 0;
    return Number(((simulatedDemand / intakeIntelligence.totalApprovedCapacity) * 100).toFixed(1));
  }, [intakeIntelligence, simulatedDemand]);

  // Quality calculations
  const qualitySummary = useMemo(() => {
    const reports = students.map((s) =>
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
    return aggregateInstitutionQuality(reports);
  }, [students]);

  const studentReportsMap = useMemo(() => {
    const map = new Map<string, ReturnType<typeof evaluateStudentRecord>>();
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

  // Staff / admin dashboard — existing rich view below
  const verified = students.filter((s) => apaarStatus(s.apaar_id) === "verified").length;
  const missing = students.filter((s) => apaarStatus(s.apaar_id) === "missing").length;
  const invalid = students.filter((s) => apaarStatus(s.apaar_id) === "invalid").length;
  const verifiedPct = students.length > 0 ? Math.round((verified / students.length) * 100) : 0;

  // Build chart data from students
  const catCounts: Record<string, number> = {};
  const progCounts: Record<string, number> = {};
  const intakeCounts: Record<string, number> = {};

  for (const s of students) {
    if (s.category) catCounts[s.category] = (catCounts[s.category] ?? 0) + 1;
    if (s.programme_code) progCounts[s.programme_code] = (progCounts[s.programme_code] ?? 0) + 1;
    if (s.intake_type) intakeCounts[s.intake_type] = (intakeCounts[s.intake_type] ?? 0) + 1;
  }

  const categoryData = Object.entries(catCounts).map(([name, value]) => ({ name, value }));
  const programmeData = Object.entries(progCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  const apaarPieData = [
    { name: "Verified", value: verified },
    { name: "Missing", value: missing },
    { name: "Invalid", value: invalid },
  ].filter((d) => d.value > 0);

  const intakeData = Object.entries(intakeCounts).map(([name, value]) => ({ name, value }));

  const recent = students.slice(0, 8);

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            EduTrace registry — {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/students">View all students</Link>
          </Button>
          <Button asChild>
            <Link to="/import">Import students</Link>
          </Button>
        </div>
      </div>

      {/* Primary Stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total students" value={students.length} icon="👥" />
        <StatCard
          label="Data Quality Score"
          value={`${qualitySummary.averageScore}/100`}
          hint={`${QUALITY_BAND_CONFIG[classifyQualityBand(qualitySummary.averageScore)].label} · Institutional baseline`}
          accent={
            qualitySummary.averageScore >= 90
              ? "green"
              : qualitySummary.averageScore >= 75
                ? "blue"
                : qualitySummary.averageScore >= 50
                  ? "yellow"
                  : "red"
          }
          icon="🛡️"
        />
        <StatCard
          label="Registry Health"
          value={`${qualitySummary.averageCompleteness}%`}
          hint={`${qualitySummary.averageValidity}% format & syntax valid`}
          accent="blue"
          icon="📊"
        />
        <StatCard
          label="Attention Needed"
          value={qualitySummary.attentionNeededCount}
          hint={`${qualitySummary.priorityDistribution.critical} critical · ${qualitySummary.priorityDistribution.high} high priority`}
          accent={qualitySummary.attentionNeededCount > 0 ? "yellow" : "green"}
          icon="⚠️"
        />
      </div>

      {/* Institutional Quality & Compliance Section */}
      {students.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* Quality Bands Distribution */}
          <div className="rounded-xl border border-border bg-card p-5">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-display text-lg text-foreground">Quality Score Distribution</h2>
              <Badge variant="outline" className="text-xs">
                {students.length} records
              </Badge>
            </div>
            <div className="space-y-3">
              {[
                { band: "excellent" as const, count: qualitySummary.qualityBands.excellent },
                { band: "good" as const, count: qualitySummary.qualityBands.good },
                {
                  band: "needs_improvement" as const,
                  count: qualitySummary.qualityBands.needsImprovement,
                },
                { band: "critical" as const, count: qualitySummary.qualityBands.critical },
              ].map(({ band, count }) => {
                const config = QUALITY_BAND_CONFIG[band];
                const pct = students.length > 0 ? Math.round((count / students.length) * 100) : 0;
                return (
                  <div key={band} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium flex items-center gap-1.5">
                        <span
                          className="h-2 w-2 rounded-full"
                          style={{ backgroundColor: config.color }}
                        />
                        {config.label}
                      </span>
                      <span className="text-muted-foreground">
                        {count.toLocaleString()} ({pct}%)
                      </span>
                    </div>
                    <Progress value={pct} className="h-1.5" />
                  </div>
                );
              })}
            </div>
          </div>

          {/* Top Data Quality Issues */}
          <div className="rounded-xl border border-border bg-card p-5 lg:col-span-2">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="font-display text-lg text-foreground">
                  Top Data Quality Discrepancies
                </h2>
                <p className="text-xs text-muted-foreground">
                  Most frequent defects requiring institutional correction
                </p>
              </div>
              <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1">
                <Link to="/students">
                  Triage in Registry <ArrowRight className="h-3 w-3" />
                </Link>
              </Button>
            </div>

            {qualitySummary.frequentIssues.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-6 text-center text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
                ✓ No widespread data quality defects detected across the active student cohort.
              </div>
            ) : (
              <div className="grid gap-2.5 sm:grid-cols-2">
                {qualitySummary.frequentIssues.slice(0, 6).map((issue, idx) => (
                  <div
                    key={idx}
                    className="flex items-start justify-between gap-2 rounded-lg border border-border bg-muted/20 p-2.5 text-xs"
                  >
                    <div className="space-y-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground">{issue.title}</span>
                      </div>
                      <p className="text-[11px] text-muted-foreground">Field: {issue.field}</p>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] capitalize",
                          issue.severity === "critical"
                            ? "border-rose-300 text-rose-700 dark:text-rose-400"
                            : issue.severity === "high"
                              ? "border-amber-300 text-amber-700 dark:text-amber-400"
                              : "border-border text-muted-foreground",
                        )}
                      >
                        {issue.severity}
                      </Badge>
                      <span className="text-[11px] font-bold text-foreground">
                        {issue.count} record{issue.count !== 1 ? "s" : ""}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Discrepancy Resolution & Correction Workflow Analytics */}
      {correctionAnalytics && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <GitPullRequest className="h-5 w-5 text-primary" />
                <h2 className="font-display text-lg text-foreground">
                  Correction Workflow & Resolution SLA
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Automated tracking of student discrepancy correction requests, approvals, and
                response times
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Link to="/corrections">
                Correction Centre <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Pending Review</span>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-2xl text-foreground">
                  {correctionAnalytics.pendingCount}
                </span>
                {correctionAnalytics.overdueCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-rose-300 text-[10px] text-rose-600 dark:text-rose-400"
                  >
                    {correctionAnalytics.overdueCount} overdue &gt;48h
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Awaiting officer review or verification
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Avg Resolution Time</span>
                <Clock className="h-4 w-4 text-blue-500" />
              </div>
              <div className="mt-2 font-display text-2xl text-foreground">
                {correctionAnalytics.avgResolutionHours !== null
                  ? `${correctionAnalytics.avgResolutionHours} hrs`
                  : "—"}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Target resolution window: 48 hours
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Approved & Applied</span>
                <CheckCircle2 className="h-4 w-4 text-emerald-500" />
              </div>
              <div className="mt-2 font-display text-2xl text-foreground">
                {correctionAnalytics.approvedCount}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Synchronized directly to student registry
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Rejected / Closed</span>
                <XCircle className="h-4 w-4 text-muted-foreground" />
              </div>
              <div className="mt-2 font-display text-2xl text-foreground">
                {correctionAnalytics.rejectedCount}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                With audit reason logged &amp; student notified
              </p>
            </div>
          </div>

          {correctionAnalytics.topFields.length > 0 && (
            <div className="pt-2 border-t border-border/60">
              <span className="text-xs font-medium text-muted-foreground">
                Top Corrected Fields:{" "}
              </span>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {correctionAnalytics.topFields.map((item) => (
                  <Badge
                    key={item.field}
                    variant="secondary"
                    className="text-[11px] font-normal gap-1"
                  >
                    <span className="font-mono capitalize">{item.field.replace(/_/g, " ")}</span>
                    <span className="rounded-full bg-background px-1.5 py-0.2 text-[10px] font-bold">
                      {item.count}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Advanced Identity Resolution & Duplicate Detection Telemetry */}
      {duplicateAnalytics && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <Users className="h-5 w-5 text-primary" />
                <h2 className="font-display text-lg text-foreground">
                  Identity Resolution &amp; Duplicate Detection
                </h2>
              </div>
              <p className="text-xs text-muted-foreground">
                Multi-pass candidate blocking, multi-algorithm demographic similarity, and cluster
                grouping
              </p>
            </div>
            <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
              <Link to="/duplicates">
                Duplicate Review Centre <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Candidate Pairs</span>
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <div className="mt-2 font-display text-2xl text-foreground">
                {duplicateAnalytics.totalCandidates}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Generated via multi-pass candidate blocking
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>High Confidence Matches</span>
                <ShieldAlert className="h-4 w-4 text-rose-500" />
              </div>
              <div className="mt-2 font-display text-2xl text-rose-600 dark:text-rose-400">
                {duplicateAnalytics.highConfidenceCount}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Coincident APAAR IDs or exact demographic matches
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Pending Reviews</span>
                <Clock className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2 font-display text-2xl text-foreground">
                {duplicateAnalytics.pendingCount}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Suspected duplicate cases awaiting resolution
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Confirmed Duplicates</span>
                <CheckCircle2 className="h-4 w-4 text-purple-500" />
              </div>
              <div className="mt-2 font-display text-2xl text-foreground">
                {duplicateAnalytics.confirmedCount}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Audited &amp; cross-referenced without merging
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Predictive Intake Intelligence & Capacity Forecasting */}
      {intakeIntelligence && (
        <div className="rounded-xl border border-border bg-card p-5 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="space-y-0.5">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-primary" />
                <h2 className="font-display text-lg text-foreground">
                  Predictive Intake Intelligence &amp; Capacity Forecasting
                </h2>
                <Badge
                  variant="outline"
                  className="text-[11px] font-normal border-primary/40 text-primary"
                >
                  AY {intakeIntelligence.targetYear} Forecast
                </Badge>
              </div>
              <p className="text-xs text-muted-foreground">
                Explainable statistical forecasting, capacity pressure alerts, and scenario planning
                derived from historical enrollment records
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowExplanation(!showExplanation)}
                className="h-8 text-xs gap-1"
              >
                <Calculator className="h-3.5 w-3.5" />
                Methodology &amp; Disclaimers
                {showExplanation ? (
                  <ChevronUp className="h-3.5 w-3.5" />
                ) : (
                  <ChevronDown className="h-3.5 w-3.5" />
                )}
              </Button>
              <Button asChild variant="outline" size="sm" className="h-8 text-xs gap-1.5">
                <Link to="/programmes">
                  Manage Programmes <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>

          {/* KPI Summary Cards */}
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Total Approved Capacity</span>
                <Building2 className="h-4 w-4 text-primary" />
              </div>
              <div className="mt-2 font-display text-2xl text-foreground">
                {intakeIntelligence.totalApprovedCapacity.toLocaleString()}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Official sanctioned regular seat quota
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Current Regular Admitted</span>
                <Users className="h-4 w-4 text-blue-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-2xl text-foreground">
                  {intakeIntelligence.currentRegularAdmitted.toLocaleString()}
                </span>
                <Badge
                  variant="outline"
                  className={cn(
                    "text-[10px]",
                    intakeIntelligence.overallUtilizationRate >= 95
                      ? "border-amber-300 text-amber-700 dark:text-amber-400"
                      : intakeIntelligence.overallUtilizationRate < 60
                        ? "border-rose-300 text-rose-700 dark:text-rose-400"
                        : "border-emerald-300 text-emerald-700 dark:text-emerald-400",
                  )}
                >
                  {intakeIntelligence.overallUtilizationRate}% utilized
                </Badge>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                +{intakeIntelligence.currentSupernumerary} supernumerary &amp; +
                {intakeIntelligence.currentLateral} lateral
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Forecasted Demand (AY {intakeIntelligence.targetYear})</span>
                <TrendingUp className="h-4 w-4 text-amber-500" />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-2xl text-foreground">
                  {intakeIntelligence.projectedDemandTotal.toLocaleString()}
                </span>
                <span className="text-xs text-muted-foreground">
                  ({intakeIntelligence.projectedOverallUtilization}% est.)
                </span>
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                {intakeIntelligence.reliableForecastsCount} reliable ·{" "}
                {intakeIntelligence.preliminaryForecastsCount} preliminary ·{" "}
                {intakeIntelligence.insufficientDataCount} new
              </p>
            </div>

            <div className="rounded-lg border border-border bg-muted/20 p-3.5">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>Flagged Programmes</span>
                <AlertTriangle
                  className={cn(
                    "h-4 w-4",
                    intakeIntelligence.flaggedProgrammesCount > 0
                      ? "text-amber-500"
                      : "text-muted-foreground",
                  )}
                />
              </div>
              <div className="mt-2 flex items-baseline gap-2">
                <span className="font-display text-2xl text-foreground">
                  {intakeIntelligence.flaggedProgrammesCount}
                </span>
                {intakeIntelligence.flaggedProgrammesCount > 0 && (
                  <Badge
                    variant="outline"
                    className="border-amber-300 text-[10px] text-amber-700 dark:text-amber-400"
                  >
                    Action recommended
                  </Badge>
                )}
              </div>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Programmes with capacity pressure or low utilization
              </p>
            </div>
          </div>

          {/* Charts & Scenario Planner Grid */}
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Historical vs Forecast Trends Chart */}
            <div className="lg:col-span-2 rounded-lg border border-border bg-muted/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-foreground">
                    Historical Enrollment vs. Statistical Projection
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    Actual regular, lateral, and supernumerary admissions compared against approved
                    capacity
                  </p>
                </div>
              </div>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={intakeIntelligence.historicalTrend}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      opacity={0.6}
                    />
                    <XAxis dataKey="academicYear" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <Tooltip
                      content={({ active, payload, label }) => {
                        if (!active || !payload || !payload.length) return null;
                        const d = payload[0]?.payload;
                        return (
                          <div className="rounded-lg border border-border bg-popover p-2.5 text-xs shadow-md space-y-1">
                            <p className="font-semibold text-foreground">Academic Year {label}</p>
                            {d?.regularAdmissions > 0 && (
                              <p className="text-blue-500">Regular: {d.regularAdmissions}</p>
                            )}
                            {d?.lateralAdmissions > 0 && (
                              <p className="text-purple-500">
                                Lateral Entry: {d.lateralAdmissions}
                              </p>
                            )}
                            {d?.supernumeraryAdmissions > 0 && (
                              <p className="text-emerald-500">
                                Supernumerary: {d.supernumeraryAdmissions}
                              </p>
                            )}
                            {d?.projectedDemand > 0 && (
                              <p className="text-amber-500 font-semibold">
                                Projected Demand: {d.projectedDemand} (Statistical Forecast)
                              </p>
                            )}
                            <p className="text-rose-500">
                              Approved Capacity: {d?.approvedCapacity}
                            </p>
                            <p className="text-muted-foreground">
                              Utilization: {d?.utilizationRate}%
                            </p>
                          </div>
                        );
                      }}
                    />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar
                      dataKey="regularAdmissions"
                      name="Regular Admitted"
                      fill="#3b82f6"
                      stackId="actual"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="lateralAdmissions"
                      name="Lateral Entry"
                      fill="#8b5cf6"
                      stackId="actual"
                      radius={[0, 0, 0, 0]}
                    />
                    <Bar
                      dataKey="supernumeraryAdmissions"
                      name="Supernumerary"
                      fill="#10b981"
                      stackId="actual"
                      radius={[3, 3, 0, 0]}
                    />
                    <Line
                      type="monotone"
                      dataKey="approvedCapacity"
                      name="Approved Capacity"
                      stroke="#ef4444"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Line
                      type="monotone"
                      dataKey="projectedDemand"
                      name="Forecasted Demand (Simulated/Statistical)"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      strokeDasharray="4 4"
                      dot={{ r: 4, fill: "#f59e0b" }}
                    />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground pt-1 border-t border-border/40">
                <Info className="h-3.5 w-3.5 text-primary shrink-0" />
                <span>
                  Dashed amber indicators represent statistical forecasts. Supernumerary and lateral
                  entries are reported separately from regular approved capacity.
                </span>
              </div>
            </div>

            {/* Interactive Scenario Planning Simulator */}
            <div className="rounded-lg border border-border bg-muted/10 p-4 space-y-4">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-1.5">
                    <Sliders className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold text-foreground">
                      Scenario Planning Simulator
                    </h3>
                  </div>
                  <p className="text-[11px] text-muted-foreground">
                    Model institutional capacity under varying admission climates
                  </p>
                </div>
              </div>

              {/* Scenario Presets */}
              <div className="grid grid-cols-3 gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant={scenarioAdjustment === -12 ? "default" : "outline"}
                  className="h-7 text-[11px] px-1"
                  onClick={() => setScenarioAdjustment(-12)}
                >
                  Conservative (-12%)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={scenarioAdjustment === 0 ? "default" : "outline"}
                  className="h-7 text-[11px] px-1"
                  onClick={() => setScenarioAdjustment(0)}
                >
                  Baseline (0%)
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant={scenarioAdjustment === 12 ? "default" : "outline"}
                  className="h-7 text-[11px] px-1"
                  onClick={() => setScenarioAdjustment(12)}
                >
                  High Demand (+12%)
                </Button>
              </div>

              {/* Custom Slider */}
              <div className="space-y-1.5 pt-1">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Custom Growth Adjustment</span>
                  <span className="font-mono font-bold text-foreground">
                    {scenarioAdjustment >= 0 ? `+${scenarioAdjustment}` : scenarioAdjustment}%
                  </span>
                </div>
                <input
                  type="range"
                  min="-30"
                  max="30"
                  step="5"
                  value={scenarioAdjustment}
                  onChange={(e) => setScenarioAdjustment(Number(e.target.value))}
                  className="w-full accent-primary h-1.5 bg-muted rounded-lg cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-muted-foreground">
                  <span>-30% Contraction</span>
                  <span>Baseline</span>
                  <span>+30% Surge</span>
                </div>
              </div>

              {/* Simulation Result Callout */}
              <div className="rounded-md border border-border bg-card p-3 space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Simulated Total Demand:</span>
                  <span className="font-bold text-foreground text-sm">
                    {simulatedDemand.toLocaleString()} seats
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">Projected Capacity Utilization:</span>
                  <span
                    className={cn(
                      "font-bold text-xs",
                      simulatedUtilization > 100
                        ? "text-rose-600 dark:text-rose-400"
                        : simulatedUtilization >= 95
                          ? "text-amber-600 dark:text-amber-400"
                          : "text-foreground",
                    )}
                  >
                    {simulatedUtilization}%
                  </span>
                </div>
                <div className="space-y-1 pt-1">
                  <Progress value={Math.min(100, simulatedUtilization)} className="h-2" />
                  <p className="text-[10px] text-muted-foreground text-right">
                    {intakeIntelligence.totalApprovedCapacity - simulatedDemand >= 0
                      ? `${intakeIntelligence.totalApprovedCapacity - simulatedDemand} seats remaining buffer`
                      : `${Math.abs(intakeIntelligence.totalApprovedCapacity - simulatedDemand)} seats simulated overflow`}
                  </p>
                </div>
              </div>

              <p className="text-[10px] text-muted-foreground italic">
                * Simulated for institutional planning only. Does not alter official approved
                capacities or registered student data.
              </p>
            </div>
          </div>

          {/* Early Warning Alerts */}
          {intakeIntelligence.earlyWarnings.length > 0 ? (
            <div className="space-y-2.5">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-foreground">
                <AlertTriangle className="h-4 w-4 text-amber-500" />
                <span>
                  Early-Warning Indicators &amp; Capacity Alerts (
                  {intakeIntelligence.earlyWarnings.length})
                </span>
              </div>
              <div className="grid gap-2.5 sm:grid-cols-2">
                {intakeIntelligence.earlyWarnings.map((warn) => (
                  <div
                    key={warn.id}
                    className="rounded-lg border border-border bg-muted/20 p-3 text-xs space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <span className="font-semibold text-foreground truncate">{warn.title}</span>
                        <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                          {warn.programmeCode}
                        </Badge>
                      </div>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] capitalize shrink-0",
                          warn.severity === "high"
                            ? "border-rose-300 text-rose-700 dark:text-rose-400"
                            : warn.severity === "medium"
                              ? "border-amber-300 text-amber-700 dark:text-amber-400"
                              : "border-blue-300 text-blue-700 dark:text-blue-400",
                        )}
                      >
                        {warn.severity}
                      </Badge>
                    </div>
                    <p className="text-muted-foreground text-[11px] leading-relaxed">
                      {warn.message}
                    </p>
                    <div className="rounded bg-muted/40 p-1.5 text-[10px] text-foreground font-mono">
                      Metric: {warn.supportingMetric}
                    </div>
                    <p className="text-[11px] text-primary/90 font-medium">
                      Action: {warn.suggestedAction}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-4 text-center text-xs text-emerald-800 dark:border-emerald-900/40 dark:bg-emerald-950/20 dark:text-emerald-300">
              ✓ All academic programmes are currently operating within balanced capacity utilization
              parameters (60%–95%).
            </div>
          )}

          {/* Programme Capacity Breakdown Table */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-foreground">
              Programme Capacity Utilization &amp; Demand Breakdown
            </h3>
            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-left text-xs">
                <thead className="bg-muted/50 border-b border-border text-muted-foreground font-medium">
                  <tr>
                    <th className="p-2.5">Programme</th>
                    <th className="p-2.5">Approved Intake</th>
                    <th className="p-2.5">Current Regular</th>
                    <th className="p-2.5">Supernumerary</th>
                    <th className="p-2.5">Utilization</th>
                    <th className="p-2.5">Projected Demand</th>
                    <th className="p-2.5">Model Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {intakeIntelligence.programmeSummaries.map((prog) => (
                    <tr key={prog.programmeCode} className="hover:bg-muted/10">
                      <td className="p-2.5">
                        <div className="font-semibold text-foreground">{prog.programmeCode}</div>
                        <div className="text-[10px] text-muted-foreground">
                          {prog.programmeName ?? "—"}
                        </div>
                      </td>
                      <td className="p-2.5 font-mono">{prog.approvedIntake}</td>
                      <td className="p-2.5 font-mono">{prog.projectedRegularIntake}</td>
                      <td className="p-2.5 text-muted-foreground">
                        {/* Supernumerary tracked outside regular capacity */}
                        <Badge variant="secondary" className="text-[10px] font-normal">
                          Excluded from quota
                        </Badge>
                      </td>
                      <td className="p-2.5">
                        <div className="flex items-center gap-2 min-w-[120px]">
                          <Progress
                            value={Math.min(100, prog.projectedUtilization)}
                            className="h-1.5 flex-1"
                          />
                          <span className="font-mono text-[11px] font-medium">
                            {prog.projectedUtilization}%
                          </span>
                        </div>
                      </td>
                      <td className="p-2.5 font-mono font-semibold text-foreground">
                        {prog.projectedRegularIntake} seats
                      </td>
                      <td className="p-2.5">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] capitalize",
                            prog.status === "reliable"
                              ? "border-emerald-300 text-emerald-700 dark:text-emerald-400"
                              : prog.status === "preliminary"
                                ? "border-blue-300 text-blue-700 dark:text-blue-400"
                                : "border-border text-muted-foreground",
                          )}
                        >
                          {prog.status.replace("_", " ")}
                        </Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Explainability & AICTE Disclaimer Drawer */}
          {showExplanation && (
            <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs space-y-3">
              <div className="flex items-center gap-2 font-semibold text-primary">
                <Calculator className="h-4 w-4" />
                <span>Forecasting Methodology &amp; Mathematical Transparency</span>
              </div>
              <p className="text-muted-foreground leading-relaxed">
                EduTrace evaluates prospective student intake using three transparent statistical
                methods: (1) Ordinary Least Squares Linear Regression (OLS) to capture multi-year
                trend slopes; (2) Weighted Moving Average (WMA) giving linearly higher weighting to
                recent admission cycles; and (3) 3-Year Simple Moving Average (SMA). Candidate
                models are evaluated via rolling-origin backtesting, with the model minimizing
                Weighted Absolute Percentage Error (WAPE) and Mean Absolute Error (MAE) selected.
              </p>
              <div className="grid gap-2 sm:grid-cols-3 pt-1">
                <div className="rounded border border-border bg-background p-2">
                  <div className="font-semibold text-foreground">Linear Regression</div>
                  <p className="text-[10px] text-muted-foreground">
                    Fits y = m·x + c for consistent growth or contraction trajectories.
                  </p>
                </div>
                <div className="rounded border border-border bg-background p-2">
                  <div className="font-semibold text-foreground">Weighted Moving Avg</div>
                  <p className="text-[10px] text-muted-foreground">
                    Weights recent academic years (e.g. 1, 2, 3) to reflect recent momentum.
                  </p>
                </div>
                <div className="rounded border border-border bg-background p-2">
                  <div className="font-semibold text-foreground">Rolling Backtest</div>
                  <p className="text-[10px] text-muted-foreground">
                    Evaluates predictions against known historical points to determine WAPE.
                  </p>
                </div>
              </div>
              <div className="rounded border border-amber-300/60 bg-amber-50/50 p-2.5 text-[11px] text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                <strong>Legal &amp; Regulatory Disclaimer:</strong> All projections generated by
                this module are advisory planning indicators for institutional leadership. They do
                not constitute an official AICTE regulatory determination, sanctioned seat
                alteration, or mandatory compliance directive. Supernumerary quotas (NRI, TFWS,
                PMSSS, Lateral Entry) are computed in accordance with separate regulatory
                guidelines.
              </div>
            </div>
          )}
        </div>
      )}

      {/* Secondary Charts row */}
      {students.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          {/* APAAR pie */}
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-display text-lg text-foreground">APAAR Status</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie
                  data={apaarPieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                >
                  {apaarPieData.map((_, i) => (
                    <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Category bar */}
          {categoryData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-display text-lg text-foreground">By Category</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryData} barSize={24}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {categoryData.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Intake types */}
          {intakeData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-display text-lg text-foreground">Admission Types</h2>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie
                    data={intakeData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    label
                  >
                    {intakeData.map((_, i) => (
                      <Cell key={i} fill={CATEGORY_COLORS[(i + 2) % CATEGORY_COLORS.length]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Programme enrolment bar */}
      {programmeData.length > 0 && (
        <div className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 font-display text-lg text-foreground">Top Programmes by Enrolment</h2>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={programmeData} barSize={32}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--color-border)" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Bar dataKey="count" fill="var(--color-primary)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Recent students */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-foreground">Recent students</h2>
          <Link
            to="/students"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            View all →
          </Link>
        </div>
        {recent.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">
              No students yet. Import your first CSV to build the registry.
            </p>
            <Button asChild variant="outline" className="mt-4">
              <Link to="/import">Import students</Link>
            </Button>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {recent.map((student) => {
              const rep = studentReportsMap.get(student.id);
              const bandConfig = rep ? QUALITY_BAND_CONFIG[rep.band] : null;

              return (
                <li key={student.id} className="flex items-center justify-between gap-4 px-5 py-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-foreground">{student.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {student.programme_code ?? "—"} · {student.dob ?? "no DOB"} ·{" "}
                      {student.category ?? "—"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {student.intake_type && (
                      <Badge variant="outline" className="text-xs">
                        {student.intake_type}
                      </Badge>
                    )}
                    {rep && bandConfig && (
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[11px] font-medium",
                          bandConfig.badgeBg,
                          bandConfig.badgeText,
                          bandConfig.border,
                        )}
                      >
                        {rep.overallScore}/100 · {bandConfig.label}
                      </Badge>
                    )}
                    <Badge
                      variant="secondary"
                      className={
                        apaarStatus(student.apaar_id) === "verified"
                          ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400"
                          : apaarStatus(student.apaar_id) === "missing"
                            ? "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400"
                            : "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400"
                      }
                    >
                      {apaarStatus(student.apaar_id) === "verified"
                        ? `✓ ${student.apaar_id}`
                        : apaarStatus(student.apaar_id) === "missing"
                          ? "No APAAR"
                          : "Bad APAAR"}
                    </Badge>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
