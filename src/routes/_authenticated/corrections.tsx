/**
 * /corrections – Staff page to review and action student correction requests.
 * Visible to: aicte_admin, institution_admin, officer
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import {
  pendingCorrectionRequestsQueryOptions,
  reviewCorrectionRequest,
} from "@/lib/correction-requests.functions";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/corrections")({
  head: () => ({
    meta: [
      { title: "Correction Requests — EduTrace" },
      { name: "description", content: "Review and approve student correction requests." },
    ],
  }),
  component: CorrectionsPage,
});

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function CorrectionsPage() {
  const { role, isAicteAdmin, isInstitutionAdmin, isOfficer } = useUserProfile();
  const queryClient = useQueryClient();
  const reviewFn = useServerFn(reviewCorrectionRequest);
  const { data: requests = [], isLoading } = useQuery(pendingCorrectionRequestsQueryOptions);

  const [notes, setNotes] = useState<Record<string, string>>({});
  const [processing, setProcessing] = useState<string | null>(null);

  async function handleDecision(requestId: string, decision: "approved" | "rejected") {
    setProcessing(requestId);
    try {
      const result = await reviewFn({
        data: { requestId, decision, reviewerNotes: notes[requestId] },
      });
      toast.success(decision === "approved" ? "Correction approved and applied." : "Request rejected.");
      await queryClient.invalidateQueries({ queryKey: ["pending-correction-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    } catch (err: any) {
      toast.error(err?.message ?? "Action failed.");
    } finally {
      setProcessing(null);
    }
  }

  if (isLoading) return <p className="text-muted-foreground">Loading requests…</p>;

  const pending = requests.filter((r) => r.status === "pending");
  const actioned = requests.filter((r) => r.status !== "pending");

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl tracking-tight text-foreground">Correction Requests</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review student-submitted data correction requests. Only approved corrections update the official record.
        </p>
      </div>

      {/* Pending */}
      <section>
        <h2 className="font-display text-xl text-foreground mb-4">
          Pending <Badge className="ml-2">{pending.length}</Badge>
        </h2>
        {pending.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-muted-foreground text-sm">No pending correction requests.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {pending.map((req) => (
              <div key={req.id} className="rounded-xl border border-border bg-card p-5">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-semibold text-foreground">
                      {(req as any).students?.name ?? "Unknown student"} —{" "}
                      <span className="capitalize font-normal">{req.field_name.replace(/_/g, " ")} correction</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Current:</span>{" "}
                      <span className="font-mono">{req.current_value ?? "—"}</span>
                      {" → "}
                      <span className="font-medium">Proposed:</span>{" "}
                      <span className="font-mono text-foreground">{req.proposed_value}</span>
                    </p>
                    <p className="text-sm text-muted-foreground">
                      <span className="font-medium">Reason:</span> {req.reason}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Submitted {new Date(req.created_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                    </p>
                  </div>
                  <Badge className={STATUS_COLOR[req.status]}>{req.status}</Badge>
                </div>

                <div className="mt-4 space-y-2">
                  <Textarea
                    placeholder="Reviewer notes (optional)"
                    rows={2}
                    value={notes[req.id] ?? ""}
                    onChange={(e) => setNotes((prev) => ({ ...prev, [req.id]: e.target.value }))}
                  />
                  <div className="flex gap-2">
                    <Button
                      id={`btn-approve-${req.id}`}
                      size="sm"
                      disabled={processing === req.id}
                      onClick={() => void handleDecision(req.id, "approved")}
                    >
                      {processing === req.id ? "Processing…" : "Approve"}
                    </Button>
                    <Button
                      id={`btn-reject-${req.id}`}
                      variant="outline"
                      size="sm"
                      disabled={processing === req.id}
                      onClick={() => void handleDecision(req.id, "rejected")}
                    >
                      Reject
                    </Button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Actioned */}
      {actioned.length > 0 && (
        <section>
          <h2 className="font-display text-xl text-foreground mb-4">Recently Actioned</h2>
          <div className="space-y-3">
            {actioned.map((req) => (
              <div key={req.id} className={cn("rounded-xl border border-border bg-card p-4 opacity-70")}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground">
                      {(req as any).students?.name ?? "—"} — {req.field_name.replace(/_/g, " ")} correction
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {req.current_value ?? "—"} → {req.proposed_value}
                    </p>
                    {req.reviewer_notes && (
                      <p className="text-xs text-muted-foreground mt-0.5">Note: {req.reviewer_notes}</p>
                    )}
                  </div>
                  <Badge className={STATUS_COLOR[req.status] ?? "bg-muted text-muted-foreground"}>
                    {req.status}
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
