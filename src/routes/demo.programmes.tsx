import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getDemoProgrammes,
  createDemoProgramme,
  getDemoStudents,
  type DemoProgramme,
} from "@/lib/demo.functions";
import { useDemoRole } from "@/lib/demo-role-store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  AlertTriangle,
  AlertCircle,
  TrendingUp,
  TrendingDown,
  CheckCircle2,
  PlusCircle,
  HelpCircle,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo/programmes")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Programmes & Capacity Intelligence — EduTrace Demo" },
      {
        name: "description",
        content: "Predictive intake, approved capacities and forecasting (Demo)",
      },
    ],
  }),
  component: DemoProgrammesPage,
});

function DemoProgrammesPage() {
  const queryClient = useQueryClient();
  const [currentRole, setRole] = useDemoRole();
  const [search, setSearch] = useState("");
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [approvedIntake, setApprovedIntake] = useState(60);
  const [submitting, setSubmitting] = useState(false);

  const { data: programmes = [], isLoading } = useQuery({
    queryKey: ["demo-programmes"],
    queryFn: () => getDemoProgrammes(),
  });

  const { data: students = [] } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });

  if (currentRole === "student") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-8 text-center space-y-4 my-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-2xl">
          🛡️
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-amber-950">
            Role Boundary: Academic Programmes & Capacity
          </h2>
          <p className="max-w-md mx-auto text-xs text-amber-900 leading-relaxed">
            As an enrolled <strong>Student</strong>, your access is focused on your personal
            academic profile, APAAR verification status, and data correction requests. Programme
            capacity limits and 2025 predictive intake forecasts are managed by Institution Admins.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/demo/dashboard">← Return to My Student Portal</Link>
          </Button>
          <Button size="sm" onClick={() => setRole("institution_admin")}>
            Switch to Institution Admin →
          </Button>
        </div>
      </div>
    );
  }

  // Calculate real student counts dynamically per programme
  const progMetrics = programmes.map((p) => {
    const enrolledStudents = students.filter(
      (s) => s.programme_code?.toUpperCase() === p.course_code.toUpperCase(),
    );
    const regular = enrolledStudents.filter((s) => s.intake_type !== "Supernumerary").length;
    const supernumerary = enrolledStudents.filter((s) => s.intake_type === "Supernumerary").length;

    // Use either dynamically counted or pre-seeded counts
    const effectiveRegular = Math.max(regular, p.regular_admitted);
    const effectiveSuper = Math.max(supernumerary, p.supernumerary_admitted);
    const utilization = Math.round((effectiveRegular / p.intake_approved) * 1000) / 10;

    let status: "OVER_CAPACITY" | "UNDER_ENROLLED" | "AT_CAPACITY" | "NORMAL" = "NORMAL";
    if (effectiveRegular > p.intake_approved) {
      status = "OVER_CAPACITY";
    } else if (utilization < 50) {
      status = "UNDER_ENROLLED";
    } else if (utilization >= 95) {
      status = "AT_CAPACITY";
    }

    // Predictive forecast (simple moving average with trend)
    const history = p.historical_trends ?? [];
    let forecast = effectiveRegular;
    let trend: "UP" | "DOWN" | "STABLE" = "STABLE";
    if (history.length >= 2) {
      const recent = history[history.length - 1]?.admitted ?? effectiveRegular;
      const prior = history[history.length - 2]?.admitted ?? recent;
      const delta = recent - prior;
      forecast = Math.max(0, Math.round(recent + delta * 0.7));
      if (delta > 2) trend = "UP";
      else if (delta < -2) trend = "DOWN";
    }

    return {
      ...p,
      regular_admitted: effectiveRegular,
      supernumerary_admitted: effectiveSuper,
      utilization,
      status,
      forecast,
      trend,
    };
  });

  const filtered = progMetrics.filter((p) => {
    const q = search.trim().toLowerCase();
    return !q || p.course_code.toLowerCase().includes(q) || p.course_name.toLowerCase().includes(q);
  });

  // Aggregate metrics
  const totalApproved = progMetrics.reduce((sum, p) => sum + p.intake_approved, 0);
  const totalAdmitted = progMetrics.reduce((sum, p) => sum + p.regular_admitted, 0);
  const totalSuper = progMetrics.reduce((sum, p) => sum + p.supernumerary_admitted, 0);
  const overallUtilization =
    totalApproved > 0 ? Math.round((totalAdmitted / totalApproved) * 1000) / 10 : 0;
  const overcapacityCount = progMetrics.filter((p) => p.status === "OVER_CAPACITY").length;
  const underenrolledCount = progMetrics.filter((p) => p.status === "UNDER_ENROLLED").length;

  // Chart data
  const chartData = progMetrics.map((p) => ({
    name: p.course_code,
    Approved: p.intake_approved,
    Admitted: p.regular_admitted,
    Forecast: p.forecast,
  }));

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!code.trim() || !name.trim()) {
      toast.error("Course code and name are required.");
      return;
    }
    setSubmitting(true);
    try {
      await createDemoProgramme({
        data: {
          course_code: code.trim(),
          course_name: name.trim(),
          intake_approved: Number(approvedIntake),
        },
      });
      await queryClient.invalidateQueries({ queryKey: ["demo-programmes"] });
      await queryClient.invalidateQueries({ queryKey: ["demo-institutional-intelligence"] });
      toast.success(`Programme ${code.toUpperCase()} created.`);
      setIsCreateOpen(false);
      setCode("");
      setName("");
      setApprovedIntake(60);
    } catch {
      toast.error("Failed to create programme.");
    } finally {
      setSubmitting(false);
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground p-8 text-center">Loading Programmes…</p>;
  }

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight text-foreground">
              Programmes & Intake Capacity
            </h1>
            <Badge className="bg-amber-100 text-amber-800">Sprint 4 Demo</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Predictive intake intelligence, capacity utilization compliance & enrolment forecasts.
          </p>
        </div>

        <Button onClick={() => setIsCreateOpen(true)} className="gap-2">
          <PlusCircle className="h-4 w-4" /> Add Programme
        </Button>
      </div>

      {/* ── Metric Summary Cards ───────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
          <p className="text-xs font-medium text-muted-foreground">Total Approved Capacity</p>
          <p className="font-display text-3xl font-bold text-foreground mt-1">
            {totalApproved} <span className="text-xs font-normal text-muted-foreground">seats</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            Across {progMetrics.length} approved programmes
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs">
          <p className="text-xs font-medium text-muted-foreground">Actual Regular Enrolled</p>
          <p className="font-display text-3xl font-bold text-foreground mt-1">
            {totalAdmitted}{" "}
            <span className="text-xs font-normal text-muted-foreground">students</span>
          </p>
          <p className="text-[11px] text-muted-foreground mt-1">
            +{totalSuper} supernumerary (TFW / EWS)
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs border-l-4 border-l-primary">
          <p className="text-xs font-medium text-muted-foreground">Overall Capacity Utilization</p>
          <p className="font-display text-3xl font-bold text-foreground mt-1">
            {overallUtilization}%
          </p>
          <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden mt-2">
            <div
              className={cn(
                "h-full transition-all",
                overallUtilization > 100
                  ? "bg-red-500"
                  : overallUtilization < 50
                    ? "bg-amber-500"
                    : "bg-emerald-500",
              )}
              style={{ width: `${Math.min(100, overallUtilization)}%` }}
            />
          </div>
        </div>

        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs border-l-4 border-l-amber-500">
          <p className="text-xs font-medium text-muted-foreground">Regulatory Early Warnings</p>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="font-display text-3xl font-bold text-amber-600">
              {overcapacityCount + underenrolledCount}
            </span>
            <span className="text-xs text-muted-foreground">programmes</span>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {overcapacityCount} Overcapacity · {underenrolledCount} Under-enrolled
          </p>
        </div>
      </div>

      {/* ── Early Warning Alerts Banner ────────────────────────────── */}
      {(overcapacityCount > 0 || underenrolledCount > 0) && (
        <div className="space-y-3">
          {progMetrics
            .filter((p) => p.status === "OVER_CAPACITY")
            .map((p) => (
              <div
                key={`warn-${p.id}`}
                className="flex items-start gap-3 rounded-xl border border-red-300 bg-red-50/60 p-4 text-xs text-red-900"
              >
                <AlertCircle className="h-5 w-5 text-red-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-red-950">
                    CRITICAL: Overcapacity Non-Compliance Detected in {p.course_name} (
                    {p.course_code})
                  </p>
                  <p>
                    {p.regular_admitted} students admitted against approved capacity of{" "}
                    {p.intake_approved} ({p.utilization}% utilization). This breaches statutory
                    AICTE norms without formal sanction.
                  </p>
                  <p className="font-medium text-red-900">
                    Recommended Action: Scrutinize admission allotments and submit emergency
                    additional intake regularization request to AICTE.
                  </p>
                </div>
              </div>
            ))}

          {progMetrics
            .filter((p) => p.status === "UNDER_ENROLLED")
            .map((p) => (
              <div
                key={`warn-${p.id}`}
                className="flex items-start gap-3 rounded-xl border border-amber-300 bg-amber-50/60 p-4 text-xs text-amber-900"
              >
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="font-semibold text-amber-950">
                    Academic Viability Alert: Low Enrolment in {p.course_name} ({p.course_code})
                  </p>
                  <p>
                    {p.regular_admitted} seats filled of {p.intake_approved} approved (
                    {p.utilization}% utilization). Consecutive years of low demand may cause faculty
                    surplus.
                  </p>
                  <p className="font-medium text-amber-900">
                    Recommended Action: Consider seat surrender or inter-departmental quota
                    reallocation for the upcoming academic cycle.
                  </p>
                </div>
              </div>
            ))}
        </div>
      )}

      {/* ── Programme Table & Forecast ─────────────────────────────── */}
      <div className="rounded-xl border border-border bg-card shadow-2xs overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-4 p-4 border-b border-border">
          <h2 className="font-display font-semibold text-foreground text-base">
            Approved Programmes & Predictive Intake
          </h2>
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search programmes…"
            className="w-full sm:w-64 text-xs"
          />
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">Code</TableHead>
              <TableHead>Programme Name</TableHead>
              <TableHead className="text-right">Approved</TableHead>
              <TableHead className="text-right">Enrolled</TableHead>
              <TableHead className="w-48">Capacity Utilization</TableHead>
              <TableHead className="text-center">Status</TableHead>
              <TableHead className="text-right">2025 Forecast</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filtered.map((p) => (
              <TableRow key={p.id}>
                <TableCell className="font-mono font-semibold">{p.course_code}</TableCell>
                <TableCell>
                  <span className="font-medium text-foreground">{p.course_name}</span>
                  {p.supernumerary_admitted > 0 && (
                    <span className="block text-[11px] text-muted-foreground">
                      +{p.supernumerary_admitted} Supernumerary
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-right font-medium">{p.intake_approved}</TableCell>
                <TableCell className="text-right font-semibold">{p.regular_admitted}</TableCell>
                <TableCell>
                  <div className="space-y-1">
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold">{p.utilization}%</span>
                      <span className="text-muted-foreground">
                        {p.intake_approved - p.regular_admitted > 0
                          ? `${p.intake_approved - p.regular_admitted} vacant`
                          : `${Math.abs(p.intake_approved - p.regular_admitted)} excess`}
                      </span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          "h-full transition-all",
                          p.utilization > 100
                            ? "bg-red-500"
                            : p.utilization < 50
                              ? "bg-amber-500"
                              : "bg-emerald-500",
                        )}
                        style={{ width: `${Math.min(100, p.utilization)}%` }}
                      />
                    </div>
                  </div>
                </TableCell>
                <TableCell className="text-center">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px] font-semibold uppercase tracking-wider",
                      p.status === "OVER_CAPACITY"
                        ? "border-red-400 bg-red-100 text-red-800"
                        : p.status === "UNDER_ENROLLED"
                          ? "border-amber-400 bg-amber-100 text-amber-800"
                          : p.status === "AT_CAPACITY"
                            ? "border-blue-400 bg-blue-100 text-blue-800"
                            : "border-green-400 bg-green-100 text-green-800",
                    )}
                  >
                    {(p.status || "").replace(/_/g, " ")}
                  </Badge>
                </TableCell>
                <TableCell className="text-right">
                  <div className="flex items-center justify-end gap-1.5">
                    {p.trend === "UP" ? (
                      <TrendingUp className="h-4 w-4 text-emerald-600" />
                    ) : p.trend === "DOWN" ? (
                      <TrendingDown className="h-4 w-4 text-red-500" />
                    ) : (
                      <span className="text-xs text-muted-foreground">→</span>
                    )}
                    <span className="font-semibold text-foreground text-xs">
                      {p.forecast} seats
                    </span>
                  </div>
                  <span className="text-[10px] text-muted-foreground">
                    {p.trend === "UP" ? "High Demand" : p.trend === "DOWN" ? "Declining" : "Stable"}
                  </span>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      {/* ── Recharts Historical & Forecast Comparison ──────────────── */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-display font-semibold text-foreground text-base">
              Intake Capacity vs Actual Enrolment vs 2025 AI Forecast
            </h3>
            <p className="text-xs text-muted-foreground">
              Comparing approved statutory seats, actual regular admissions, and projected demand.
            </p>
          </div>
          <Badge variant="outline" className="gap-1 text-xs">
            <Sparkles className="h-3 w-3 text-primary" /> Predictive Model
          </Badge>
        </div>

        <div className="h-72 w-full pt-2">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
              <XAxis dataKey="name" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} />
              <Tooltip />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Bar dataKey="Approved" fill="#94a3b8" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Admitted" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Forecast" fill="#10b981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Create Programme Dialog ─────────────────────────────────── */}
      <Dialog open={isCreateOpen} onOpenChange={setIsCreateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Add Academic Programme</DialogTitle>
            <DialogDescription>
              Register a new degree programme and its approved intake limit.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Course Code:</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="e.g. IT01, EE01"
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Course / Branch Name:</label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Information Technology"
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Approved Intake Seats:</label>
              <Input
                type="number"
                min={10}
                max={300}
                value={approvedIntake}
                onChange={(e) => setApprovedIntake(Number(e.target.value))}
                required
                className="text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsCreateOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={submitting}>
                {submitting ? "Saving…" : "Register Programme"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
