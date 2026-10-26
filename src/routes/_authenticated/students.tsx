import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { studentsQueryOptions } from "@/lib/students.functions";
import { verifyStudentApaar } from "@/lib/edutrace.functions";
import { apaarStatus } from "@/lib/student-import";
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
import { cn } from "@/lib/utils";
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
  const serverStatus = (student as unknown as Record<string, unknown>).apaar_verify_status as string | undefined;

  if (local === "missing") {
    return <Badge variant="outline" className="text-muted-foreground">No APAAR</Badge>;
  }
  if (local === "invalid") {
    return <Badge variant="destructive">Bad APAAR</Badge>;
  }
  // 12-digit — show server verification status
  if (serverStatus === "verified") {
    return <Badge className="bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">✓ Verified</Badge>;
  }
  if (serverStatus === "not_found") {
    return <Badge className="bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">Not found</Badge>;
  }
  if (serverStatus === "failed") {
    return <Badge variant="destructive">Failed</Badge>;
  }
  return <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">⏳ Pending</Badge>;
}

function StudentsPage() {
  const { data: students } = useSuspenseQuery(studentsQueryOptions);
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "missing" | "invalid" | "pending" | "verified">("all");
  const [verifyingId, setVerifyingId] = useState<string | null>(null);
  const queryClient = useQueryClient();
  const verifyFn = useServerFn(verifyStudentApaar);

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase();
    const matchesSearch = !q || [s.name, s.student_id, s.apaar_id, s.programme_code, s.contact]
      .some((f) => f?.toLowerCase().includes(q));

    if (!matchesSearch) return false;
    const local = apaarStatus(s.apaar_id);
    const serverStatus = (s as unknown as Record<string, unknown>).apaar_verify_status as string | undefined;

    if (filter === "missing") return local === "missing";
    if (filter === "invalid") return local === "invalid";
    if (filter === "pending") return local === "verified" && (!serverStatus || serverStatus === "pending");
    if (filter === "verified") return serverStatus === "verified";
    return true;
  });

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

  const counts = {
    all: students.length,
    missing: students.filter((s) => apaarStatus(s.apaar_id) === "missing").length,
    invalid: students.filter((s) => apaarStatus(s.apaar_id) === "invalid").length,
    pending: students.filter((s) => {
      const local = apaarStatus(s.apaar_id);
      const ss = (s as unknown as Record<string, unknown>).apaar_verify_status as string | undefined;
      return local === "verified" && (!ss || ss === "pending");
    }).length,
    verified: students.filter((s) => (s as unknown as Record<string, unknown>).apaar_verify_status === "verified").length,
  };

  const FILTERS = [
    { key: "all", label: `All (${counts.all})` },
    { key: "verified", label: `✓ Verified (${counts.verified})` },
    { key: "pending", label: `⏳ Pending (${counts.pending})` },
    { key: "missing", label: `Missing APAAR (${counts.missing})` },
    { key: "invalid", label: `Bad APAAR (${counts.invalid})` },
  ] as const;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">Students</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {students.length.toLocaleString()} record{students.length !== 1 ? "s" : ""} · showing {filtered.length.toLocaleString()}
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <a href="/import">Import more</a>
          </Button>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <Input
          id="student-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, roll no, APAAR, programme…"
          className="max-w-sm"
        />
        <div className="flex flex-wrap gap-1">
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
      </div>

      {students.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">No students yet. Import your first CSV to build the registry.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
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
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((student) => {
                const local = apaarStatus(student.apaar_id);
                const serverStatus = (student as unknown as Record<string, unknown>).apaar_verify_status as string | undefined;
                const canVerify = local === "verified" && (!serverStatus || serverStatus === "pending");
                return (
                  <TableRow key={student.id} className={cn(
                    local === "missing" && "bg-amber-50/50 dark:bg-amber-900/10",
                    local === "invalid" && "bg-red-50/50 dark:bg-red-900/10",
                  )}>
                    <TableCell className="whitespace-nowrap font-mono text-xs">{student.student_id ?? "—"}</TableCell>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell><ApaarBadge student={student} /></TableCell>
                    <TableCell className="whitespace-nowrap">{student.dob ?? "—"}</TableCell>
                    <TableCell>{student.programme_code ?? "—"}</TableCell>
                    <TableCell>{student.category ?? "—"}</TableCell>
                    <TableCell>{student.intake_type ?? "—"}</TableCell>
                    <TableCell className="max-w-40 truncate text-xs">{student.contact ?? "—"}</TableCell>
                    <TableCell>
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
                    </TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="py-8 text-center text-muted-foreground">
                    No students match current filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
