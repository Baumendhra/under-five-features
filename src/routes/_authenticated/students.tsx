import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { studentsQueryOptions } from "@/lib/students.functions";
import { apaarStatus } from "@/lib/student-import";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const Route = createFileRoute("/_authenticated/students")({
  head: () => ({
    meta: [
      { title: "Students — EduTrace" },
      {
        name: "description",
        content: "Browse every student in your registry with APAAR verification status.",
      },
      { property: "og:title", content: "Students — EduTrace" },
      {
        property: "og:description",
        content: "Browse every student in your registry with APAAR verification status.",
      },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(studentsQueryOptions),
  component: StudentsPage,
});

function apaarBadge(apaar: string | null) {
  const status = apaarStatus(apaar);
  if (status === "verified") {
    return <Badge className="bg-accent text-accent-foreground">{apaar}</Badge>;
  }
  if (status === "missing") {
    return <Badge variant="outline" className="text-muted-foreground">No APAAR</Badge>;
  }
  return <Badge variant="destructive">Bad APAAR</Badge>;
}

function StudentsPage() {
  const { data: students } = useSuspenseQuery(studentsQueryOptions);
  const [search, setSearch] = useState("");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) =>
      [s.name, s.student_id, s.apaar_id, s.programme_code, s.contact]
        .some((field) => field?.toLowerCase().includes(q)),
    );
  }, [students, search]);

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {students.length.toLocaleString()} record{students.length === 1 ? "" : "s"} in your registry.
          </p>
        </div>
        <Button asChild variant="outline">
          <Link to="/import">Import more</Link>
        </Button>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, roll no, APAAR ID, programme or contact…"
        className="mt-6 max-w-md"
      />

      {students.length === 0 ? (
        <div className="mt-8 rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">
            No students yet. Import your first CSV to build the registry.
          </p>
          <Button asChild className="mt-4">
            <Link to="/import">Import students</Link>
          </Button>
        </div>
      ) : (
        <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Roll no</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>APAAR ID</TableHead>
                <TableHead>Date of birth</TableHead>
                <TableHead>Programme</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Intake</TableHead>
                <TableHead>Contact</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((student) => (
                <TableRow key={student.id}>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {student.student_id ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">{student.name}</TableCell>
                  <TableCell>{apaarBadge(student.apaar_id)}</TableCell>
                  <TableCell className="whitespace-nowrap">{student.dob ?? "—"}</TableCell>
                  <TableCell>{student.programme_code ?? "—"}</TableCell>
                  <TableCell>{student.category ?? "—"}</TableCell>
                  <TableCell>{student.intake_type ?? "—"}</TableCell>
                  <TableCell className="max-w-52 truncate">{student.contact ?? "—"}</TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No students match "{search}".
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
