import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/use-user-profile";
import { useDemoRole } from "@/lib/demo-role-store";
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

export const Route = createFileRoute("/demo/institutions")({
  ssr: false,
  head: () => ({ meta: [{ title: "Institutions — EduTrace Demo" }] }),
  component: DemoInstitutions,
});

// Static demo institutions
const DEFAULT_INSTITUTIONS = [
  {
    id: "demo-inst",
    name: "National Institute of Technology, Surathkal",
    aicte_id: "1-1234567890",
    region: "South",
    affiliation: "Autonomous",
    contact_email: "admin@nitk.ac.in",
  },
  {
    id: "demo-inst-2",
    name: "Indian Institute of Technology, Bombay",
    aicte_id: "1-0987654321",
    region: "West",
    affiliation: "Autonomous",
    contact_email: "admin@iitb.ac.in",
  },
  {
    id: "demo-inst-3",
    name: "Anna University, Chennai",
    aicte_id: "1-1122334455",
    region: "South",
    affiliation: "University",
    contact_email: "admin@annauniv.edu",
  },
];

const REGIONS = ["North", "South", "East", "West", "Central", "Northeast"];

function DemoInstitutions() {
  const [currentRole, setRole] = useDemoRole();
  const { canManageInstitutions } = useUserProfile();
  const [institutions, setInstitutions] = useState(DEFAULT_INSTITUTIONS);
  const [search, setSearch] = useState("");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    name: "",
    aicte_id: "",
    region: "",
    affiliation: "",
    contact_email: "",
  });

  if (currentRole === "student") {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-8 text-center space-y-4 my-8">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-800 text-2xl">
          🛡️
        </div>
        <div className="space-y-1">
          <h2 className="font-display text-xl font-bold text-amber-950">
            Role Boundary: Institutions Directory
          </h2>
          <p className="max-w-md mx-auto text-xs text-amber-900 leading-relaxed">
            As an enrolled <strong>Student</strong>, your access is focused on your personal
            academic profile, APAAR verification status, and data correction requests. Nationwide
            institutions administration is reserved for AICTE Admins.
          </p>
        </div>
        <div className="flex justify-center gap-3 pt-2">
          <Button asChild variant="outline" size="sm">
            <Link to="/demo/dashboard">← Return to My Student Portal</Link>
          </Button>
          <Button size="sm" onClick={() => setRole("aicte_admin")}>
            Switch to AICTE Admin →
          </Button>
        </div>
      </div>
    );
  }

  const filtered = institutions.filter((i) =>
    [i.name, i.aicte_id, i.region, i.affiliation].some((f) =>
      f?.toLowerCase().includes(search.toLowerCase()),
    ),
  );

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) {
      toast.error("Institution name is required.");
      return;
    }
    setSaving(true);
    await new Promise((r) => setTimeout(r, 600)); // simulate latency
    setInstitutions((prev) => [
      ...prev,
      {
        id: `demo-inst-${Date.now()}`,
        name: form.name.trim(),
        aicte_id:
          form.aicte_id.trim() || `1-${Math.floor(Math.random() * 9000000000) + 1000000000}`,
        region: form.region || "—",
        affiliation: form.affiliation.trim() || "—",
        contact_email: form.contact_email.trim() || "—",
      },
    ]);
    toast.success("Demo institution created (sandbox only).");
    setOpen(false);
    setForm({ name: "", aicte_id: "", region: "", affiliation: "", contact_email: "" });
    setSaving(false);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">
            Institutions <span className="text-sm font-normal text-amber-600">(Demo)</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {institutions.length} registered institutions.
          </p>
        </div>
        {canManageInstitutions && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button id="demo-btn-add-institution">Add institution</Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Register new institution (Demo)</DialogTitle>
              </DialogHeader>
              <form onSubmit={(e) => void handleCreate(e)} className="mt-4 space-y-4">
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Institution name <span className="text-destructive">*</span>
                  </label>
                  <Input
                    id="demo-inst-name"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Indian Institute of Technology, Delhi"
                    required
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">
                      AICTE ID
                    </label>
                    <Input
                      id="demo-inst-aicte-id"
                      value={form.aicte_id}
                      onChange={(e) => setForm((f) => ({ ...f, aicte_id: e.target.value }))}
                      placeholder="e.g. 1-234567890"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-sm font-medium text-foreground">Region</label>
                    <select
                      id="demo-inst-region"
                      value={form.region}
                      onChange={(e) => setForm((f) => ({ ...f, region: e.target.value }))}
                      className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm shadow-sm"
                    >
                      <option value="">Select region</option>
                      {REGIONS.map((r) => (
                        <option key={r} value={r}>
                          {r}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Affiliation
                  </label>
                  <Input
                    id="demo-inst-affiliation"
                    value={form.affiliation}
                    onChange={(e) => setForm((f) => ({ ...f, affiliation: e.target.value }))}
                    placeholder="e.g. Anna University, Autonomous"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-sm font-medium text-foreground">
                    Contact email
                  </label>
                  <Input
                    id="demo-inst-email"
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm((f) => ({ ...f, contact_email: e.target.value }))}
                    placeholder="registrar@institution.ac.in"
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" disabled={saving}>
                    {saving ? "Creating…" : "Create institution"}
                  </Button>
                </div>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </div>

      <Input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search by name, AICTE ID, region…"
        className="max-w-md"
        id="demo-inst-search"
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {filtered.map((inst) => (
          <div
            key={inst.id}
            className="group rounded-xl border border-border bg-card p-5 transition-shadow hover:shadow-md"
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <h3 className="truncate font-semibold text-foreground">{inst.name}</h3>
                <p className="mt-0.5 font-mono text-xs text-muted-foreground">
                  AICTE: {inst.aicte_id}
                </p>
              </div>
              <Badge variant="secondary" className="shrink-0">
                {inst.region}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-muted-foreground">{inst.affiliation}</p>
            <p className="mt-1 truncate text-xs text-muted-foreground">{inst.contact_email}</p>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="col-span-full py-8 text-center text-sm text-muted-foreground">
            No institutions match "{search}".
          </p>
        )}
      </div>
    </div>
  );
}
