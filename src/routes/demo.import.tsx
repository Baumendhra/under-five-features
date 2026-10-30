import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { getDemoStudents, insertDemoStudents } from "@/lib/demo.functions";
import {
  parseStudentsCsv,
  reviewStudents,
  isDefaultSelected,
  STATUS_LABEL,
  type ReviewedStudent,
} from "@/lib/student-import";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { cn } from "@/lib/utils";
import type { NewStudentRow } from "@/lib/students.functions";

export const Route = createFileRoute("/demo/import")({
  ssr: false,
  head: () => ({ meta: [{ title: "Import — EduTrace Demo" }] }),
  component: DemoImportPage,
});

const IMPORTABLE_STATUSES = new Set(["valid", "missing_apaar", "invalid_apaar"]);

function DemoImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { data: existing = [] } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });

  const [fileName, setFileName] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<ReviewedStudent[] | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);

  async function handleFile(file: File) {
    const text = await file.text();
    const parsed = parseStudentsCsv(text);
    if (!parsed.ok) {
      toast.error(parsed.error);
      return;
    }
    const existingRefs = existing.map((s) => ({ apaar_id: s.apaar_id, name: s.name, dob: s.dob }));
    const rows = reviewStudents(parsed.students, existingRefs);
    setFileName(file.name);
    setReviewed(rows);
    setSelected(new Set(rows.filter((r) => isDefaultSelected(r.status)).map((r) => r.rowNumber)));
  }

  function toggle(rowNumber: number, status: ReviewedStudent["status"]) {
    if (status === "duplicate_db" || status === "duplicate_file" || status === "missing_name")
      return;
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(rowNumber)) next.delete(rowNumber);
      else next.add(rowNumber);
      return next;
    });
  }

  const counts = useMemo(() => {
    const rows = reviewed ?? [];
    return {
      total: rows.length,
      ready: rows.filter((r) => r.status === "valid").length,
      flagged: rows.filter((r) => r.status === "missing_apaar" || r.status === "invalid_apaar")
        .length,
      duplicates: rows.filter((r) => r.status.startsWith("duplicate")).length,
      skipped: rows.filter((r) => r.status === "missing_name").length,
    };
  }, [reviewed]);

  async function handleImport() {
    if (!reviewed) return;
    const rows: NewStudentRow[] = reviewed
      .filter((r) => selected.has(r.rowNumber))
      .map(({ rowNumber: _rn, status: _st, detail: _dt, ...student }) => student);
    if (rows.length === 0) {
      toast.error("Select at least one row to import.");
      return;
    }
    setImporting(true);
    try {
      const result = await insertDemoStudents({ data: { rows } });
      toast.success(
        `${result.inserted} student${result.inserted === 1 ? "" : "s"} added to demo sandbox.`,
      );
      await queryClient.invalidateQueries({ queryKey: ["demo-students"] });
      void navigate({ to: "/demo/students" });
    } catch {
      toast.error("Demo import failed. Please try again.");
      setImporting(false);
    }
  }

  function reset() {
    setFileName(null);
    setReviewed(null);
    setSelected(new Set());
  }

  if (!reviewed) {
    return (
      <div>
        <h1 className="font-display text-3xl tracking-tight text-foreground">
          Import students <span className="text-sm font-normal text-amber-600">(Demo)</span>
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Upload a CSV — rows are added to the demo sandbox, not the real database.
        </p>
        <label className="mt-8 flex cursor-pointer flex-col items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-border bg-card p-12 text-center transition-colors hover:bg-accent">
          <span className="font-display text-2xl text-foreground">Drop your CSV here</span>
          <span className="max-w-sm text-sm text-muted-foreground">
            Expected columns: StudentID, APAAR_ID, Name, DOB, ProgrammeCode, Category, IntakeType,
            Contact. Name is the only required column.
          </span>
          <Button asChild variant="outline" tabIndex={-1}>
            <span>Choose file</span>
          </Button>
          <input
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleFile(file);
              e.target.value = "";
            }}
          />
        </label>
      </div>
    );
  }

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">
            Review import <span className="text-sm font-normal text-amber-600">(Demo)</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {fileName} · {counts.total.toLocaleString()} rows read.
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={reset} disabled={importing}>
            Start over
          </Button>
          <Button onClick={() => void handleImport()} disabled={importing || selected.size === 0}>
            {importing ? "Saving…" : `Import ${selected.size.toLocaleString()} selected`}
          </Button>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          { label: "Ready", value: counts.ready },
          { label: "APAAR flagged", value: counts.flagged },
          { label: "Duplicates", value: counts.duplicates },
          { label: "No name", value: counts.skipped },
          { label: "Selected", value: selected.size },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl border border-border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
            <p className="font-display text-3xl text-foreground">{stat.value.toLocaleString()}</p>
          </div>
        ))}
      </div>

      <div className="mt-6 overflow-x-auto rounded-xl border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Import</TableHead>
              <TableHead>Row</TableHead>
              <TableHead>Roll no</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>APAAR ID</TableHead>
              <TableHead>DOB</TableHead>
              <TableHead>Programme</TableHead>
              <TableHead>Status</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {reviewed.map((student) => {
              const locked =
                student.status === "duplicate_db" ||
                student.status === "duplicate_file" ||
                student.status === "missing_name";
              const checked = selected.has(student.rowNumber);
              const flagged = student.status !== "valid" && !locked;
              return (
                <TableRow key={student.rowNumber} className={cn(flagged && "bg-muted/40")}>
                  <TableCell>
                    <Checkbox
                      checked={checked}
                      disabled={locked || importing}
                      onCheckedChange={() => toggle(student.rowNumber, student.status)}
                      aria-label={`Import row ${student.rowNumber}`}
                    />
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    {student.rowNumber}
                  </TableCell>
                  <TableCell className="whitespace-nowrap font-mono text-xs">
                    {student.studentId ?? "—"}
                  </TableCell>
                  <TableCell className="font-medium">{student.name || "—"}</TableCell>
                  <TableCell className="font-mono text-xs">{student.apaarId ?? "—"}</TableCell>
                  <TableCell className="whitespace-nowrap">{student.dob ?? "—"}</TableCell>
                  <TableCell>{student.programmeCode ?? "—"}</TableCell>
                  <TableCell>
                    <Badge
                      variant="secondary"
                      className={cn(
                        locked && "bg-muted text-muted-foreground",
                        flagged && "bg-destructive/15 text-destructive",
                        !locked && !flagged && "bg-accent text-accent-foreground",
                      )}
                    >
                      {STATUS_LABEL[student.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          Rows will be added to the demo sandbox only — no real database writes.
        </p>
        <Button onClick={() => void handleImport()} disabled={importing || selected.size === 0}>
          {importing ? "Saving…" : `Import ${selected.size.toLocaleString()} selected`}
        </Button>
      </div>
    </div>
  );
}
