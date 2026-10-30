import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  programmesQueryOptions,
  institutionsQueryOptions,
  createProgramme,
} from "@/lib/edutrace.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/programmes")({
  head: () => ({
    meta: [
      { title: "Programmes — EduTrace" },
      { name: "description", content: "Manage approved academic programmes and intake seats." },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(programmesQueryOptions),
      context.queryClient.ensureQueryData(institutionsQueryOptions),
    ]);
  },
  component: ProgrammesPage,
});

function ProgrammesPage() {
  const { data: programmes } = useSuspenseQuery(programmesQueryOptions);
  const { data: institutions } = useSuspenseQuery(institutionsQueryOptions);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const createFn = useServerFn(createProgramme);

  const [form, setForm] = useState({
    institution_id: "",
    course_code: "",
    course_name: "",
    year: new Date().getFullYear(),
    intake_approved: 60,
    intake_nri: 0,
    intake_supernumerary: 0,
    other_details: "",
  });

  const instMap = new Map(institutions.map((i) => [i.id, i.name]));

  const filtered = programmes.filter((p) =>
    [p.course_code, p.course_name, instMap.get(p.institution_id)].some((f) =>
      f?.toLowerCase().includes(search.toLowerCase()),
    ),
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.institution_id || !form.course_code.trim()) {
      toast.error("Institution and course code are required.");
      return;
    }
    setSaving(true);
    try {
      await createFn({
        data: {
          institution_id: form.institution_id,
          course_code: form.course_code.trim().toUpperCase(),
          course_name: form.course_name.trim() || null,
          year: form.year,
          intake_approved: Number(form.intake_approved),
          intake_nri: Number(form.intake_nri),
          intake_supernumerary: Number(form.intake_supernumerary),
          other_details: form.other_details.trim() || null,
        },
      });
      toast.success("Programme added.");
      await queryClient.invalidateQueries({ queryKey: ["programmes"] });
      setOpen(false);
      setForm({
        institution_id: "",
        course_code: "",
        course_name: "",
        year: new Date().getFullYear(),
        intake_approved: 60,
        intake_nri: 0,
        intake_supernumerary: 0,
        other_details: "",
      });
    } catch (err) {
      toast.error(
        "Failed to add programme. Course code may already exist for this institution/year.",
      );
    } finally {
      setSaving(false);
    }
  }

  const totalApproved = programmes.reduce((s, p) => s + p.intake_approved, 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">Programmes</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {programmes.length} programme{programmes.length !== 1 ? "s" : ""} ·{" "}
            {totalApproved.toLocaleString()} total approved seats
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button id="btn-add-programme" disabled={institutions.length === 0}>
              {institutions.length === 0 ? "Add institution first" : "Add programme"}
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add approved programme</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => void handleCreate(e)} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Institution <span className="text-destructive">*</span>
                </label>
                <select
                  id="prog-institution"
                  value={form.institution_id}
                  onChange={(e) => setForm((f) => ({ ...f, institution_id: e.target.value }))}
                  className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  required
                >
                  <option value="">Select institution</option>
                  {institutions.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Course code <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="prog-code"
                    value={form.course_code}
                    onChange={(e) => setForm((f) => ({ ...f, course_code: e.target.value }))}
                    placeholder="e.g. CSE-BTECH"
                    required
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Year</label>
                  <Input
                    id="prog-year"
                    type="number"
                    value={form.year}
                    onChange={(e) => setForm((f) => ({ ...f, year: Number(e.target.value) }))}
                    min={2000}
                    max={2100}
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Course name
                </label>
                <Input
                  id="prog-name"
                  value={form.course_name}
                  onChange={(e) => setForm((f) => ({ ...f, course_name: e.target.value }))}
                  placeholder="e.g. B.Tech Computer Science Engineering"
                />
              </div>
              <div className="grid grid-cols-3 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Approved seats
                  </label>
                  <Input
                    id="prog-intake"
                    type="number"
                    value={form.intake_approved}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, intake_approved: Number(e.target.value) }))
                    }
                    min={0}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    NRI seats
                  </label>
                  <Input
                    id="prog-nri"
                    type="number"
                    value={form.intake_nri}
                    onChange={(e) => setForm((f) => ({ ...f, intake_nri: Number(e.target.value) }))}
                    min={0}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Supernumerary
                  </label>
                  <Input
                    id="prog-supernumerary"
                    type="number"
                    value={form.intake_supernumerary}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, intake_supernumerary: Number(e.target.value) }))
                    }
                    min={0}
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Adding…" : "Add programme"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by course code, name or institution…"
        className="max-w-md"
        id="prog-search"
      />

      {programmes.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-4xl">📚</p>
          <p className="mt-4 font-display text-xl text-foreground">No programmes yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Add an institution first, then define approved programmes.
          </p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Course code</TableHead>
                <TableHead>Name</TableHead>
                <TableHead>Institution</TableHead>
                <TableHead>Year</TableHead>
                <TableHead className="text-right">Approved</TableHead>
                <TableHead className="text-right">NRI</TableHead>
                <TableHead className="text-right">Supernumerary</TableHead>
                <TableHead className="text-right">Total seats</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((prog) => {
                const total = prog.intake_approved + prog.intake_nri + prog.intake_supernumerary;
                return (
                  <TableRow key={prog.id}>
                    <TableCell className="font-mono text-sm font-medium">
                      {prog.course_code}
                    </TableCell>
                    <TableCell className="text-sm">{prog.course_name ?? "—"}</TableCell>
                    <TableCell className="text-sm">
                      {instMap.get(prog.institution_id) ?? prog.institution_id}
                    </TableCell>
                    <TableCell>{prog.year}</TableCell>
                    <TableCell className="text-right">{prog.intake_approved}</TableCell>
                    <TableCell className="text-right">
                      {prog.intake_nri > 0 ? (
                        <Badge variant="outline">{prog.intake_nri}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right">
                      {prog.intake_supernumerary > 0 ? (
                        <Badge variant="secondary">{prog.intake_supernumerary}</Badge>
                      ) : (
                        "—"
                      )}
                    </TableCell>
                    <TableCell className="text-right font-medium">{total}</TableCell>
                  </TableRow>
                );
              })}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell colSpan={8} className="py-8 text-center text-muted-foreground">
                    No programmes match "{search}".
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
