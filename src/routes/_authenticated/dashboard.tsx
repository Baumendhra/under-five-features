import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { studentsQueryOptions } from "@/lib/students.functions";
import { apaarStatus } from "@/lib/student-import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export const Route = createFileRoute("/_authenticated/dashboard")({
  head: () => ({
    meta: [
      { title: "Dashboard — EduTrace" },
      {
        name: "description",
        content: "Overview of your student registry: totals, APAAR verification status and recent entries.",
      },
      { property: "og:title", content: "Dashboard — EduTrace" },
      {
        property: "og:description",
        content: "Overview of your student registry: totals, APAAR verification status and recent entries.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(studentsQueryOptions),
  component: Dashboard,
});

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-5">
      <p className="text-sm font-medium text-muted-foreground">{label}</p>
      <p className="font-display text-4xl text-foreground">{value.toLocaleString()}</p>
      {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Dashboard() {
  const { data: students } = useSuspenseQuery(studentsQueryOptions);

  const verified = students.filter((s) => apaarStatus(s.apaar_id) === "verified").length;
  const missing = students.filter((s) => apaarStatus(s.apaar_id) === "missing").length;
  const invalid = students.filter((s) => apaarStatus(s.apaar_id) === "invalid").length;
  const recent = students.slice(0, 5);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">Dashboard</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Your registry at a glance.
          </p>
        </div>
        <Button asChild>
          <Link to="/import">Import students</Link>
        </Button>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total students" value={students.length} />
        <StatCard label="APAAR verified" value={verified} hint="12-digit ID on record" />
        <StatCard label="APAAR missing" value={missing} hint="Flagged for follow-up" />
        <StatCard label="APAAR invalid" value={invalid} hint="Not 12 digits — check entry" />
      </div>

      <section className="mt-10">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl text-foreground">Recent students</h2>
          <Link
            to="/students"
            className="text-sm font-medium text-primary underline-offset-4 hover:underline"
          >
            View all
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
            {recent.map((student) => (
              <li key={student.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-foreground">{student.name}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {student.programme_code ?? "—"} · {student.dob ?? "no DOB"}
                  </p>
                </div>
                <Badge
                  variant="secondary"
                  className={
                    apaarStatus(student.apaar_id) === "verified"
                      ? "bg-accent text-accent-foreground"
                      : "bg-muted text-muted-foreground"
                  }
                >
                  {apaarStatus(student.apaar_id) === "verified"
                    ? student.apaar_id
                    : apaarStatus(student.apaar_id) === "missing"
                      ? "No APAAR"
                      : "Bad APAAR"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
