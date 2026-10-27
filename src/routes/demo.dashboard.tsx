import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { getDemoStudents } from "@/lib/demo.functions";
import { apaarStatus } from "@/lib/student-import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, CartesianGrid, Legend,
} from "recharts";

export const Route = createFileRoute("/demo/dashboard")({
  ssr: false,
  head: () => ({ meta: [{ title: "Dashboard — EduTrace Demo" }] }),
  component: DemoDashboard,
});

const CATEGORY_COLORS = ["#4ade80", "#60a5fa", "#f97316", "#a78bfa", "#fb7185", "#34d399"];
const PIE_COLORS = ["#22c55e", "#ef4444", "#f59e0b", "#3b82f6"];

function StatCard({ label, value, hint, accent, icon }: {
  label: string; value: number | string; hint?: string;
  accent?: "green" | "red" | "yellow" | "blue"; icon?: string;
}) {
  const accentClass = { green: "border-l-4 border-l-green-500", red: "border-l-4 border-l-red-400", yellow: "border-l-4 border-l-amber-400", blue: "border-l-4 border-l-blue-400" }[accent ?? ""] ?? "";
  return (
    <div className={`rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md ${accentClass}`}>
      {icon && <div className="mb-2 text-2xl">{icon}</div>}
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="font-display text-4xl text-foreground">{typeof value === "number" ? value.toLocaleString() : value}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function DemoDashboard() {
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });

  if (isLoading) return <p className="text-muted-foreground">Loading demo data…</p>;

  const verified = students.filter((s) => apaarStatus(s.apaar_id) === "verified").length;
  const missing = students.filter((s) => apaarStatus(s.apaar_id) === "missing").length;
  const invalid = students.filter((s) => apaarStatus(s.apaar_id) === "invalid").length;
  const verifiedPct = students.length > 0 ? Math.round((verified / students.length) * 100) : 0;

  const catCounts: Record<string, number> = {};
  const progCounts: Record<string, number> = {};
  const intakeCounts: Record<string, number> = {};
  for (const s of students) {
    if (s.category) catCounts[s.category] = (catCounts[s.category] ?? 0) + 1;
    if (s.programme_code) progCounts[s.programme_code] = (progCounts[s.programme_code] ?? 0) + 1;
    if (s.intake_type) intakeCounts[s.intake_type] = (intakeCounts[s.intake_type] ?? 0) + 1;
  }
  const categoryData = Object.entries(catCounts).map(([name, value]) => ({ name, value }));
  const programmeData = Object.entries(progCounts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([name, count]) => ({ name, count }));
  const apaarPieData = [{ name: "Verified", value: verified }, { name: "Missing", value: missing }, { name: "Invalid", value: invalid }].filter((d) => d.value > 0);
  const intakeData = Object.entries(intakeCounts).map(([name, value]) => ({ name, value }));
  const recent = students.slice(0, 8);

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">Dashboard <span className="text-sm font-normal text-amber-600">(Demo)</span></h1>
          <p className="mt-1 text-sm text-muted-foreground">EduTrace registry — {new Date().toLocaleDateString("en-IN", { dateStyle: "long" })}</p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline"><Link to="/demo/students">View students</Link></Button>
          <Button asChild><Link to="/demo/import">Import students</Link></Button>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total students" value={students.length} icon="👥" />
        <StatCard label="APAAR verified" value={`${verified} (${verifiedPct}%)`} hint="12-digit ID confirmed" accent="green" icon="✅" />
        <StatCard label="Missing APAAR" value={missing} hint="Flagged for follow-up" accent="yellow" icon="⚠️" />
        <StatCard label="Invalid APAAR" value={invalid} hint="Format error — needs correction" accent="red" icon="❌" />
      </div>

      {students.length > 0 && (
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5">
            <h2 className="mb-4 font-display text-lg text-foreground">APAAR Status</h2>
            <ResponsiveContainer width="100%" height={200}>
              <PieChart>
                <Pie data={apaarPieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={80} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                  {apaarPieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          </div>
          {categoryData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-display text-lg text-foreground">By Category</h2>
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={categoryData} barSize={24}>
                  <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {categoryData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[i % CATEGORY_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
          {intakeData.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5">
              <h2 className="mb-4 font-display text-lg text-foreground">Admission Types</h2>
              <ResponsiveContainer width="100%" height={200}>
                <PieChart>
                  <Pie data={intakeData} dataKey="value" nameKey="name" cx="50%" cy="50%" innerRadius={50} outerRadius={80} label>
                    {intakeData.map((_, i) => <Cell key={i} fill={CATEGORY_COLORS[(i + 2) % CATEGORY_COLORS.length]} />)}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

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

      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-foreground">Recent students</h2>
          <Link to="/demo/students" className="text-sm font-medium text-primary underline-offset-4 hover:underline">View all →</Link>
        </div>
        {recent.length === 0 ? (
          <div className="mt-4 rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No demo students. Import a CSV to populate the sandbox.</p>
          </div>
        ) : (
          <ul className="mt-4 divide-y divide-border rounded-xl border border-border bg-card">
            {recent.map((student) => (
              <li key={student.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{student.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{student.programme_code ?? "—"} · {student.dob ?? "no DOB"} · {student.category ?? "—"}</p>
                </div>
                <Badge variant="secondary" className={
                  apaarStatus(student.apaar_id) === "verified" ? "bg-green-100 text-green-800" :
                  apaarStatus(student.apaar_id) === "missing" ? "bg-amber-100 text-amber-800" :
                  "bg-red-100 text-red-800"
                }>
                  {apaarStatus(student.apaar_id) === "verified" ? `✓ ${student.apaar_id}` : apaarStatus(student.apaar_id) === "missing" ? "No APAAR" : "Bad APAAR"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
