import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { getDemoStudents, exportDemoCsv } from "@/lib/demo.functions";
import { apaarStatus } from "@/lib/student-import";
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
import { cn } from "@/lib/utils";
import type { StudentRecord } from "@/lib/students.functions";

export const Route = createFileRoute("/demo/students")({
  ssr: false,
  head: () => ({ meta: [{ title: "Students — EduTrace Demo" }] }),
  component: DemoStudents,
});

function ApaarBadge({ student }: { student: StudentRecord }) {
  const local = apaarStatus(student.apaar_id);
  const serverStatus = (student as any).apaar_verify_status as string | undefined;
  if (local === "missing")
    return (
      <Badge variant="outline" className="text-muted-foreground">
        No APAAR
      </Badge>
    );
  if (local === "invalid") return <Badge variant="destructive">Bad APAAR</Badge>;
  if (serverStatus === "verified")
    return <Badge className="bg-green-100 text-green-800">✓ Verified</Badge>;
  if (serverStatus === "not_found")
    return <Badge className="bg-red-100 text-red-800">Not found</Badge>;
  return <Badge className="bg-amber-100 text-amber-800">⏳ Pending</Badge>;
}

function DemoStudents() {
  const queryClient = useQueryClient();
  const { canExport, canImportStudents, canVerifyApaar } = useUserProfile();
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"all" | "missing" | "invalid" | "pending" | "verified">(
    "all",
  );
  const [exporting, setExporting] = useState(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  const filtered = students.filter((s) => {
    const q = search.trim().toLowerCase();
    const matchesSearch =
      !q ||
      [s.name, s.student_id, s.apaar_id, s.programme_code, s.contact].some((f) =>
        f?.toLowerCase().includes(q),
      );
    if (!matchesSearch) return false;
    const local = apaarStatus(s.apaar_id);
    const serverStatus = (s as any).apaar_verify_status as string | undefined;
    if (filter === "missing") return local === "missing";
    if (filter === "invalid") return local === "invalid";
    if (filter === "verified") return serverStatus === "verified";
    if (filter === "pending")
      return local === "verified" && (!serverStatus || serverStatus === "pending");
    return true;
  });

  async function handleVerify(student: StudentRecord) {
    setVerifyingId(student.id);
    // Simulate verification in demo mode
    await new Promise((r) => setTimeout(r, 1200));
    // Mark as verified in the local query cache
    queryClient.setQueryData<StudentRecord[]>(["demo-students"], (prev = []) =>
      prev.map((s) =>
        s.id === student.id
          ? { ...s, apaar_verify_status: "verified", apaar_verified_at: new Date().toISOString() }
          : s,
      ),
    );
    toast.success(`APAAR for ${student.name} verified (demo).`);
    setVerifyingId(null);
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

  if (isLoading) return <p className="text-muted-foreground">Loading…</p>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">
            Students <span className="text-sm font-normal text-amber-600">(Demo)</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {students.length.toLocaleString()} records · showing {filtered.length.toLocaleString()}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canExport && (
            <>
              <Button
                id="demo-export-filtered"
                variant="outline"
                size="sm"
                disabled={exporting || filtered.length === 0}
                onClick={() => void handleExport(true)}
              >
                {exporting ? "Exporting…" : `Export filtered (${filtered.length})`}
              </Button>
              <Button
                id="demo-export-all"
                variant="outline"
                size="sm"
                disabled={exporting}
                onClick={() => void handleExport(false)}
              >
                Export all ({students.length})
              </Button>
            </>
          )}
          {canImportStudents && (
            <Button asChild variant="outline" size="sm">
              <Link to="/demo/import">Import more</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-3">
        <Input
          id="demo-student-search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search name, APAAR, ID…"
          className="max-w-xs"
        />
        <div className="flex gap-1">
          {(["all", "verified", "missing", "invalid", "pending"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={cn(
                "rounded-full border px-3 py-1 text-xs font-medium capitalize transition-colors",
                filter === f
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-background text-muted-foreground hover:bg-accent",
              )}
            >
              {f}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-muted-foreground">No students match your filter.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Roll no</TableHead>
                <TableHead>APAAR ID</TableHead>
                <TableHead>DOB</TableHead>
                <TableHead>Programme</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>APAAR Status</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((student) => {
                const local = apaarStatus(student.apaar_id);
                const canVerify =
                  local === "verified" && (student as any).apaar_verify_status !== "verified";
                return (
                  <TableRow key={student.id}>
                    <TableCell className="font-medium">{student.name}</TableCell>
                    <TableCell className="font-mono text-xs">{student.student_id ?? "—"}</TableCell>
                    <TableCell className="font-mono text-xs">{student.apaar_id || "—"}</TableCell>
                    <TableCell className="whitespace-nowrap text-xs">
                      {student.dob ?? "—"}
                    </TableCell>
                    <TableCell>{student.programme_code ?? "—"}</TableCell>
                    <TableCell>{student.category ?? "—"}</TableCell>
                    <TableCell>
                      <ApaarBadge student={student} />
                    </TableCell>
                    <TableCell>
                      {canVerifyApaar && canVerify ? (
                        <Button
                          id={`demo-verify-${student.id}`}
                          variant="outline"
                          size="sm"
                          disabled={verifyingId === student.id}
                          onClick={() => void handleVerify(student)}
                        >
                          {verifyingId === student.id ? "Verifying…" : "Verify"}
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
