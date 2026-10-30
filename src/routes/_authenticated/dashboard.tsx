import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { dashboardStatsQueryOptions, studentsQueryOptions } from "@/lib/students.functions";
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
} from "recharts";
import { apaarStatus } from "@/lib/student-import";
import {
  evaluateStudentRecord,
  aggregateInstitutionQuality,
  classifyQualityBand,
  QUALITY_BAND_CONFIG,
} from "@/lib/data-quality";
import { ShieldCheck, AlertTriangle, AlertOctagon, Info, ArrowRight } from "lucide-react";
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
