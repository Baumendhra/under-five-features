import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import {
  getDemoStudents,
  getDemoProgrammes,
  getDemoCorrections,
  getDemoInstitutionalIntelligence,
} from "@/lib/demo.functions";
import { apaarStatus } from "@/lib/student-import";
import { evaluateStudentRecord } from "@/lib/data-quality";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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
import {
  Sparkles,
  Bot,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  ArrowRight,
  FileText,
  Users,
  Layers,
  TrendingUp,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo/dashboard")({
  ssr: false,
  head: () => ({ meta: [{ title: "Executive Dashboard — EduTrace Demo" }] }),
  component: DemoDashboard,
});

const PIE_COLORS = ["#10b981", "#ef4444", "#f59e0b", "#3b82f6"];

function StatCard({
  label,
  value,
  hint,
  accent,
  icon,
  linkTo,
}: {
  label: string;
  value: number | string;
  hint?: string;
  accent?: "green" | "red" | "yellow" | "blue" | "purple";
  icon?: React.ReactNode;
  linkTo?: string;
}) {
  const accentClass = accent
    ? {
        green: "border-l-4 border-l-emerald-500",
        red: "border-l-4 border-l-red-500",
        yellow: "border-l-4 border-l-amber-500",
        blue: "border-l-4 border-l-blue-500",
        purple: "border-l-4 border-l-purple-500",
      }[accent]
    : "";

  const content = (
    <div
      className={cn(
        "rounded-xl border border-border bg-card p-5 transition-all hover:shadow-md",
        accentClass,
      )}
    >
      <div className="flex items-center justify-between mb-2">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        {icon}
      </div>
      <p className="font-display text-3xl font-extrabold text-foreground">
        {typeof value === "number" ? value.toLocaleString() : value}
      </p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );

  if (linkTo) {
    return <Link to={linkTo}>{content}</Link>;
  }

  return content;
}

function DemoDashboard() {
  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });

  const { data: programmes = [], isLoading: loadingProgrammes } = useQuery({
    queryKey: ["demo-programmes"],
    queryFn: () => getDemoProgrammes(),
  });

  const { data: corrections = [], isLoading: loadingCorrections } = useQuery({
    queryKey: ["demo-corrections"],
    queryFn: () => getDemoCorrections(),
  });

  const { data: intelligence, isLoading: loadingIntel } = useQuery({
    queryKey: ["demo-institutional-intelligence"],
    queryFn: () => getDemoInstitutionalIntelligence(),
  });

  if (loadingStudents || loadingProgrammes || loadingCorrections || loadingIntel) {
    return <p className="text-muted-foreground p-8 text-center">Loading Executive Intelligence…</p>;
  }

  // 1. APAAR metrics
  const verifiedApaar = students.filter((s) => s.apaar_verify_status === "verified").length;
  const missingApaar = students.filter((s) => !s.apaar_id).length;
  const invalidApaar = students.filter((s) => s.apaar_verify_status === "invalid").length;
  const pendingApaar = students.length - verifiedApaar - missingApaar - invalidApaar;
  const apaarPct = students.length > 0 ? Math.round((verifiedApaar / students.length) * 100) : 0;

  // 2. Capacity metrics
  const totalApprovedCapacity = programmes.reduce((s, p) => s + p.intake_approved, 0);
  const totalEnrolled = programmes.reduce((s, p) => s + p.regular_admitted, 0);
  const capacityPct =
    totalApprovedCapacity > 0 ? Math.round((totalEnrolled / totalApprovedCapacity) * 1000) / 10 : 0;

  // 3. Correction & SLA metrics
  const pendingCorrections = corrections.filter((c) => c.status === "pending").length;
  const slaOverdue = corrections.filter((c) => {
    if (c.status === "approved" || c.status === "rejected") return false;
    return new Date(c.sla_deadline).getTime() < Date.now();
  }).length;

  // 4. Data Quality distribution
  let excellentCount = 0;
  let goodCount = 0;
  let fairCount = 0;
  let criticalCount = 0;
  let totalScore = 0;

  for (const s of students) {
    const q = evaluateStudentRecord({
      id: s.id,
      name: s.name,
      student_id: s.student_id,
      apaar_id: s.apaar_id,
      dob: s.dob,
      contact: s.contact,
      category: s.category,
      gender: s.gender,
      programme_code: s.programme_code,
      intake_type: s.intake_type,
      apaar_verify_status: s.apaar_verify_status,
      consent_recorded: s.consent_recorded,
    });
    totalScore += q.overallScore;
    if (q.overallScore >= 90) excellentCount++;
    else if (q.overallScore >= 75) goodCount++;
    else if (q.overallScore >= 50) fairCount++;
    else criticalCount++;
  }

  const avgQuality = students.length > 0 ? Math.round(totalScore / students.length) : 0;

  // Chart data
  const capacityBarData = programmes.map((p) => ({
    name: p.course_code,
    Approved: p.intake_approved,
    Enrolled: p.regular_admitted,
  }));

  const apaarPieData = [
    { name: "Verified", value: verifiedApaar },
    { name: "Pending", value: Math.max(0, pendingApaar) },
    { name: "Missing", value: missingApaar },
    { name: "Invalid", value: invalidApaar },
  ].filter((d) => d.value > 0);

  const qualityPieData = [
    { name: "Excellent (90+)", value: excellentCount },
    { name: "Good (75-89)", value: goodCount },
    { name: "Fair (50-74)", value: fairCount },
    { name: "Critical (<50)", value: criticalCount },
  ].filter((d) => d.value > 0);

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight text-foreground">
              Executive Dashboard
            </h1>
            <Badge className="bg-amber-100 text-amber-800">Sprint 1–6 Integrated Demo</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            National Institute of Technology · All 6 Innovation Sprints Active in Demo Sandbox
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/demo/students">Student Registry</Link>
          </Button>
          <Button asChild className="gap-2">
            <Link to="/demo/intelligence">
              <Sparkles className="h-4 w-4" /> Intelligence Hub
            </Link>
          </Button>
        </div>
      </div>

      {/* ── 6 Innovation Sprint Top KPI Grid ────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        <StatCard
          label="Registry Health"
          value={`${intelligence?.overallHealthIndex ?? avgQuality}/100`}
          hint={intelligence?.overallHealthStatus?.replace(/_/g, " ") ?? "Optimal"}
          accent="purple"
          icon={<Bot className="h-4 w-4 text-purple-600" />}
          linkTo="/demo/intelligence"
        />

        <StatCard
          label="Data Quality"
          value={`${avgQuality}%`}
          hint={`${excellentCount} of ${students.length} excellent`}
          accent="green"
          icon={<CheckCircle2 className="h-4 w-4 text-emerald-600" />}
          linkTo="/demo/students"
        />

        <StatCard
          label="APAAR Verified"
          value={`${apaarPct}%`}
          hint={`${verifiedApaar} verified`}
          accent="blue"
          icon={<CheckCircle2 className="h-4 w-4 text-blue-600" />}
          linkTo="/demo/students"
        />

        <StatCard
          label="Capacity Intake"
          value={`${capacityPct}%`}
          hint={`${totalEnrolled}/${totalApprovedCapacity} seats`}
          accent={capacityPct > 100 ? "red" : capacityPct < 50 ? "yellow" : "green"}
          icon={<TrendingUp className="h-4 w-4 text-primary" />}
          linkTo="/demo/programmes"
        />

        <StatCard
          label="Corrections"
          value={pendingCorrections}
          hint={slaOverdue > 0 ? `🚨 ${slaOverdue} past SLA` : "All within SLA"}
          accent={slaOverdue > 0 ? "red" : "yellow"}
          icon={<Clock className="h-4 w-4 text-amber-600" />}
          linkTo="/demo/corrections"
        />

        <StatCard
          label="Duplicates"
          value={intelligence?.identity?.totalCandidates ?? 1}
          hint={`${intelligence?.identity?.identifierCollisions ?? 1} roll collision`}
          accent={intelligence?.identity?.identifierCollisions ? "red" : "yellow"}
          icon={<Users className="h-4 w-4 text-red-500" />}
          linkTo="/demo/duplicates"
        />
      </div>

      {/* ── Innovation Sprints Quick Launch Tiles ──────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Sprint 6 */}
        <Link
          to="/demo/intelligence"
          className="rounded-xl border border-border bg-linear-to-br from-primary/5 via-card to-card p-5 transition-all hover:border-primary/40 hover:shadow-md space-y-2 block"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <Sparkles className="h-4 w-4" />
            </span>
            <Badge variant="outline" className="text-[10px]">
              Sprint 6 Hub
            </Badge>
          </div>
          <h2 className="font-display font-semibold text-foreground text-base">
            Institutional Intelligence Hub
          </h2>
          <p className="text-xs text-muted-foreground">
            Ask the AI Decision Assistant questions, inspect derived priorities, and generate
            executive reports.
          </p>
          <span className="text-xs font-semibold text-primary flex items-center gap-1 pt-1">
            Launch Assistant →
          </span>
        </Link>

        {/* Sprint 4 */}
        <Link
          to="/demo/programmes"
          className="rounded-xl border border-border bg-linear-to-br from-blue-50/50 via-card to-card p-5 transition-all hover:border-blue-400/40 hover:shadow-md space-y-2 block"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-800">
              <TrendingUp className="h-4 w-4" />
            </span>
            <Badge variant="outline" className="text-[10px]">
              Sprint 4 Intake
            </Badge>
          </div>
          <h2 className="font-display font-semibold text-foreground text-base">
            Predictive Intake & Capacity
          </h2>
          <p className="text-xs text-muted-foreground">
            Monitor approved capacities, review overcapacity/under-enrolment early warnings, and
            2025 demand forecasts.
          </p>
          <span className="text-xs font-semibold text-blue-600 flex items-center gap-1 pt-1">
            Explore Capacities →
          </span>
        </Link>

        {/* Sprint 2 */}
        <Link
          to="/demo/corrections"
          className="rounded-xl border border-border bg-linear-to-br from-amber-50/50 via-card to-card p-5 transition-all hover:border-amber-400/40 hover:shadow-md space-y-2 block"
        >
          <div className="flex items-center justify-between">
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-800">
              <FileText className="h-4 w-4" />
            </span>
            <Badge variant="outline" className="text-[10px]">
              Sprint 2 Workflow
            </Badge>
          </div>
          <h2 className="font-display font-semibold text-foreground text-base">
            Discrepancy Correction Centre
          </h2>
          <p className="text-xs text-muted-foreground">
            Triage pending correction requests with smart suggestions, verify supporting evidence
            PDFs, and enforce SLA deadlines.
          </p>
          <span className="text-xs font-semibold text-amber-600 flex items-center gap-1 pt-1">
            Triage Corrections →
          </span>
        </Link>
      </div>

      {/* ── Interactive Charts Row ─────────────────────────────────── */}
      <div className="grid gap-6 lg:grid-cols-2">
        {/* Chart 1: Programme Capacity vs Actual Intake */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-foreground text-base">
                Programme Intake vs Approved Capacity
              </h3>
              <p className="text-xs text-muted-foreground">
                Approved statutory limits vs registered student enrolments.
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/demo/programmes">Details →</Link>
            </Button>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={capacityBarData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Approved" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Enrolled" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Chart 2: APAAR Status Distribution */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-display font-semibold text-foreground text-base">
                APAAR Verification Breakdown
              </h3>
              <p className="text-xs text-muted-foreground">
                Distribution of student registry verification states.
              </p>
            </div>
            <Button variant="ghost" size="sm" asChild className="text-xs">
              <Link to="/demo/students">Registry →</Link>
            </Button>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={apaarPieData}
                  cx="50%"
                  cy="50%"
                  outerRadius={80}
                  innerRadius={45}
                  dataKey="value"
                  label={({ name, percent }: any) =>
                    `${name} (${(Number(percent ?? 0) * 100).toFixed(0)}%)`
                  }
                  labelLine={false}
                >
                  {apaarPieData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
