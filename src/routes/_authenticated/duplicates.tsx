import { createFileRoute } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  duplicateCasesQueryOptions,
  resolveDuplicateCase,
} from "@/lib/edutrace.functions";
import { studentsQueryOptions } from "@/lib/students.functions";
import { detectDuplicates } from "@/lib/duplicate-detection";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/duplicates")({
  head: () => ({
    meta: [
      { title: "Duplicate Review — EduTrace" },
      { name: "description", content: "Review and resolve suspected duplicate student records." },
    ],
  }),
  loader: async ({ context }) => {
    await Promise.all([
      context.queryClient.ensureQueryData(studentsQueryOptions),
      context.queryClient.ensureQueryData(duplicateCasesQueryOptions),
    ]);
  },
  component: DuplicatesPage,
});

const REASON_LABEL: Record<string, string> = {
  apaar_duplicate: "Same APAAR ID",
  name_dob_exact: "Exact name + DOB match",
  fuzzy_name_dob: "Similar name + same DOB",
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  under_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  resolved: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
  dismissed: "bg-muted text-muted-foreground",
};

function DuplicatesPage() {
  const { data: cases } = useSuspenseQuery(duplicateCasesQueryOptions);
  const { data: students } = useSuspenseQuery(studentsQueryOptions);
  const queryClient = useQueryClient();
  const resolveFn = useServerFn(resolveDuplicateCase);

  // Detect duplicates within the current student registry
  const inMemoryDups = detectDuplicates(
    students.map((s, index) => ({
      index,
      apaarId: s.apaar_id,
      name: s.name,
      dob: s.dob,
    })),
  );

  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const [resolution, setResolution] = useState("");
  const [newStatus, setNewStatus] = useState("resolved");

  async function handleResolve(caseId: string) {
    if (!resolution.trim()) {
      toast.error("Please add a resolution note.");
      return;
    }
    try {
      await resolveFn({ data: { caseId, status: newStatus, resolution } });
      toast.success("Case updated.");
      await queryClient.invalidateQueries({ queryKey: ["duplicate-cases"] });
      setResolvingId(null);
      setResolution("");
    } catch {
      toast.error("Failed to update case.");
    }
  }

  const openCases = cases.filter((c) => c.status === "open" || c.status === "under_review");
  const closedCases = cases.filter((c) => c.status === "resolved" || c.status === "dismissed");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-foreground">Duplicate Review</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Suspected duplicate student records flagged during import or live scan.
        </p>
      </div>

      {/* Live scan results */}
      <section>
        <div className="flex items-center justify-between">
          <h2 className="font-display text-xl text-foreground">Live scan — current registry</h2>
          <Badge variant="secondary">{inMemoryDups.length} pair{inMemoryDups.length !== 1 ? "s" : ""} detected</Badge>
        </div>
        {inMemoryDups.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            ✅ No duplicate patterns detected in current registry.
          </div>
        ) : (
          <div className="mt-4 space-y-3">
            {inMemoryDups.map((pair, i) => {
              const a = students[pair.indexA];
              const b = students[pair.indexB];
              if (!a || !b) return null;
              return (
                <div key={i} className="rounded-xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
                        {REASON_LABEL[pair.reason] ?? pair.reason}
                      </Badge>
                      <p className="mt-2 text-sm text-muted-foreground">{pair.detail}</p>
                    </div>
                    <span className="shrink-0 text-xs text-muted-foreground">
                      {pair.score < 1 ? `${(pair.score * 100).toFixed(0)}% match` : "Exact"}
                    </span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3">
                    {[a, b].map((s, j) => (
                      <div key={j} className="rounded-lg border border-border bg-card p-3">
                        <p className="font-medium text-foreground">{s.name}</p>
                        <p className="mt-0.5 font-mono text-xs text-muted-foreground">{s.apaar_id ?? "No APAAR"}</p>
                        <p className="text-xs text-muted-foreground">{s.dob ?? "No DOB"} · {s.category ?? "—"} · {s.programme_code ?? "—"}</p>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Saved cases from DB */}
      <section>
        <h2 className="font-display text-xl text-foreground">Open cases</h2>
        {openCases.length === 0 ? (
          <div className="mt-4 rounded-xl border border-border bg-card p-6 text-center text-sm text-muted-foreground">
            No open duplicate cases.
          </div>
        ) : (
          <div className="mt-4 space-y-4">
            {openCases.map((c) => (
              <div key={c.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <Badge className={cn("text-xs", STATUS_BADGE[c.status] ?? "")}>{c.status}</Badge>
                    <Badge variant="outline" className="text-xs">{REASON_LABEL[c.reason] ?? c.reason}</Badge>
                    <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("en-IN")}</span>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setResolvingId(resolvingId === c.id ? null : c.id)}
                  >
                    {resolvingId === c.id ? "Cancel" : "Resolve"}
                  </Button>
                </div>
                <p className="mt-2 text-xs text-muted-foreground">
                  Student IDs: {c.student_ids.join(", ")}
                </p>

                {resolvingId === c.id && (
                  <div className="mt-4 space-y-3 border-t border-border pt-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="mb-1 block text-sm font-medium">New status</label>
                        <Select value={newStatus} onValueChange={setNewStatus}>
                          <SelectTrigger id={`resolve-status-${c.id}`}>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="under_review">Under review</SelectItem>
                            <SelectItem value="resolved">Resolved</SelectItem>
                            <SelectItem value="dismissed">Dismissed</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <div>
                      <label className="mb-1 block text-sm font-medium">Resolution note</label>
                      <Textarea
                        id={`resolve-note-${c.id}`}
                        value={resolution}
                        onChange={(e) => setResolution(e.target.value)}
                        placeholder="Describe how this case was resolved…"
                        rows={2}
                      />
                    </div>
                    <Button size="sm" onClick={() => void handleResolve(c.id)}>
                      Save resolution
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {closedCases.length > 0 && (
        <section>
          <h2 className="font-display text-xl text-foreground">Resolved cases</h2>
          <div className="mt-4 space-y-2">
            {closedCases.map((c) => (
              <div key={c.id} className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-5 py-3">
                <div className="flex items-center gap-3">
                  <Badge className={cn("text-xs", STATUS_BADGE[c.status] ?? "")}>{c.status}</Badge>
                  <span className="text-sm text-muted-foreground">{REASON_LABEL[c.reason] ?? c.reason}</span>
                </div>
                <div className="text-right text-xs text-muted-foreground">
                  <p>{c.resolution ?? "—"}</p>
                  <p>{new Date(c.created_at).toLocaleDateString("en-IN")}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
