import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { institutionsQueryOptions, createInstitution } from "@/lib/edutrace.functions";
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
import { useQueryClient } from "@tanstack/react-query";

export const Route = createFileRoute("/_authenticated/institutions")({
  head: () => ({
    meta: [
      { title: "Institutions — EduTrace" },
      { name: "description", content: "Manage registered institutions in the EduTrace platform." },
    ],
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(institutionsQueryOptions),
  component: InstitutionsPage,
});

function InstitutionsPage() {
  const { data: institutions } = useSuspenseQuery(institutionsQueryOptions);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const queryClient = useQueryClient();
  const createFn = useServerFn(createInstitution);

  const [form, setForm] = useState({
    name: "",
    aicte_id: "",
    region: "",
    affiliation: "",
    address: "",
    contact_email: "",
  });

  const filtered = institutions.filter((i) =>
    [i.name, i.aicte_id, i.region, i.affiliation]
      .some((f) => f?.toLowerCase().includes(search.toLowerCase())),
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Institution name is required.");
      return;
    }
    setSaving(true);
    try {
      await createFn({
        data: {
          name: form.name.trim(),
          aicte_id: form.aicte_id.trim() || null,
          region: form.region.trim() || null,
          affiliation: form.affiliation.trim() || null,
          address: form.address.trim() || null,
          contact_email: form.contact_email.trim() || null,
        },
      });
      toast.success("Institution created.");
      await queryClient.invalidateQueries({ queryKey: ["institutions"] });
      setOpen(false);
      setForm({ name: "", aicte_id: "", region: "", affiliation: "", address: "", contact_email: "" });
    } catch (err) {
      toast.error("Failed to create institution. Check AICTE ID uniqueness.");
    } finally {
      setSaving(false);
    }
  }

  const REGIONS = ["North", "South", "East", "West", "Central", "Northeast"];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">Institutions</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {institutions.length} registered institution{institutions.length !== 1 ? "s" : ""}.
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button id="btn-add-institution">Add institution</Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Register new institution</DialogTitle>
            </DialogHeader>
            <form onSubmit={(e) => void handleCreate(e)} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">
                  Institution name <span className="text-destructive">*</span>
                </label>
                <Input
                  id="inst-name"
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Indian Institute of Technology, Delhi"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">AICTE ID</label>
                  <Input
                    id="inst-aicte-id"
                    value={form.aicte_id}
                    onChange={(e) => setForm((f) => ({ ...f, aicte_id: e.target.value }))}
                    placeholder="e.g. 1-234567890"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">Region</label>
                  <select
                    id="inst-region"
                    value={form.region}
                    onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                    className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                  >
                    <option value="">Select region</option>
                    {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Affiliation</label>
                <Input
                  id="inst-affiliation"
                  value={form.affiliation}
                  onChange={(e) => setForm((f) => ({ ...f, affiliation: e.target.value }))}
                  placeholder="e.g. Anna University, Autonomous"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium text-foreground">Contact email</label>
                <Input
                  id="inst-email"
                  type="email"
                  value={form.contact_email}
                  onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                  placeholder="registrar@institution.ac.in"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                <Button type="submit" disabled={saving}>
                  {saving ? "Creating…" : "Create institution"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, AICTE ID, region, affiliation…"
        className="max-w-md"
        id="inst-search"
      />

      {institutions.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-4xl">🏫</p>
          <p className="mt-4 font-display text-xl text-foreground">No institutions yet</p>
          <p className="mt-2 text-sm text-muted-foreground">Add the first institution to get started.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((inst) => (
            <div
              key={inst.id}
              className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="truncate font-semibold text-foreground">{inst.name}</h3>
                  {inst.aicte_id && (
                    <p className="mt-0.5 font-mono text-xs text-muted-foreground">AICTE: {inst.aicte_id}</p>
                  )}
                </div>
                {inst.region && (
                  <Badge variant="secondary" className="shrink-0">{inst.region}</Badge>
                )}
              </div>
              {inst.affiliation && (
                <p className="mt-2 text-sm text-muted-foreground">{inst.affiliation}</p>
              )}
              {inst.contact_email && (
                <p className="mt-1 truncate text-xs text-muted-foreground">{inst.contact_email}</p>
              )}
              <div className="mt-4 flex gap-2">
                <Link
                  to="/programmes"
                  className="text-xs font-medium text-primary underline-offset-4 hover:underline"
                >
                  View programmes →
                </Link>
              </div>
            </div>
          ))}
          {filtered.length === 0 && (
            <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
              No institutions match "{search}".
            </p>
          )}
        </div>
      )}
    </div>
  );
}
