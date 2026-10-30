/**
 * /corrections – Comprehensive Correction Centre for EduTrace.
 * Allows institutional officers and administrators to triage, review,
 * approve, reject, or request additional information for student data discrepancies.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import {
  pendingCorrectionRequestsQueryOptions,
  reviewCorrectionRequest,
  correctionAnalyticsQueryOptions,
  type CorrectionRequestWithStudent,
} from "@/lib/correction-requests.functions";
import {
  CORRECTION_STATUS_CONFIG,
  generateSmartSuggestions,
  detectCorrectionConflicts,
  type CorrectionStatus,
  type CorrectableFieldName,
} from "@/lib/correction-engine";
import { maskApaar, maskContact } from "@/lib/data-quality";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Clock,
  Search,
  FileText,
  ArrowRight,
  ShieldCheck,
  ShieldAlert,
  Info,
  HelpCircle,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/corrections")({
  head: () => ({
    meta: [
      { title: "Correction Centre — EduTrace" },
      { name: "description", content: "Review and action student correction requests." },
    ],
  }),
  component: CorrectionsPage,
});

function CorrectionsPage() {
  const { role, isAicteAdmin, isInstitutionAdmin, isOfficer } = useUserProfile();
  const queryClient = useQueryClient();
  const reviewFn = useServerFn(reviewCorrectionRequest);

  const { data: requests = [], isLoading } = useQuery(pendingCorrectionRequestsQueryOptions());
  const { data: analytics } = useQuery(correctionAnalyticsQueryOptions);

  const [activeTab, setActiveTab] = useState<"all" | "pending" | "approved" | "rejected">(
    "pending",
  );
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<CorrectionRequestWithStudent | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [processing, setProcessing] = useState(false);

  // Filter requests
  const filteredRequests = useMemo(() => {
    let result = requests;

    if (activeTab === "pending") {
      result = result.filter((r) => r.status === "pending");
    } else if (activeTab === "approved") {
      result = result.filter((r) => r.status === "approved");
    } else if (activeTab === "rejected") {
      result = result.filter((r) => r.status === "rejected");
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.students?.name?.toLowerCase().includes(q) ||
          r.students?.student_id?.toLowerCase().includes(q) ||
          r.field_name?.toLowerCase().includes(q) ||
          r.reason?.toLowerCase().includes(q),
      );
    }

    return result;
  }, [requests, activeTab, search]);

  // Counts
  const counts = useMemo(
    () => ({
      all: requests.length,
      pending: requests.filter((r) => r.status === "pending").length,
      approved: requests.filter((r) => r.status === "approved").length,
      rejected: requests.filter((r) => r.status === "rejected").length,
    }),
    [requests],
  );

  async function handleDecision(decision: "approved" | "rejected") {
    if (!selectedRequest) return;

    if (decision === "rejected" && (!reviewerNotes || reviewerNotes.trim().length < 5)) {
      toast.error("Please provide a mandatory rejection reason (at least 5 characters).");
      return;
    }

    setProcessing(true);
    try {
      const result = await reviewFn({
        data: {
          requestId: selectedRequest.id,
          decision,
          ...(reviewerNotes.trim() ? { reviewerNotes: reviewerNotes.trim() } : {}),
        },
      });

      if (decision === "approved") {
        toast.success(
          result.qualitySummary
            ? `Correction approved & applied! ${result.qualitySummary}`
            : "Correction approved and student record updated.",
        );
      } else {
        toast.success("Request rejected with documented reason.");
      }

      await queryClient.invalidateQueries({ queryKey: ["pending-correction-requests"] });
      await queryClient.invalidateQueries({ queryKey: ["correction-analytics"] });
      await queryClient.invalidateQueries({ queryKey: ["students"] });
      setSelectedRequest(null);
      setReviewerNotes("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Action failed.";
      toast.error(msg);
    } finally {
      setProcessing(false);
    }
  }

  if (isLoading) return <p className="text-muted-foreground p-8">Loading correction requests…</p>;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="font-display text-3xl tracking-tight text-foreground">Correction Centre</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Review student data discrepancy requests with smart validation suggestions and audit
          tracking.
        </p>
      </div>

      {/* Analytics Summary Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Pending Triage</span>
            <Clock className="h-4 w-4 text-amber-500" />
          </div>
          <p className="mt-2 font-display text-3xl text-foreground">
            {counts.pending.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">
            {analytics?.overdueCount
              ? `${analytics.overdueCount} overdue (>48h)`
              : "Within response SLA"}
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Approved & Applied</span>
            <CheckCircle2 className="h-4 w-4 text-emerald-500" />
          </div>
          <p className="mt-2 font-display text-3xl text-foreground">
            {counts.approved.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-emerald-700 dark:text-emerald-400">
            Records safely updated
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Rejected Requests</span>
            <XCircle className="h-4 w-4 text-rose-500" />
          </div>
          <p className="mt-2 font-display text-3xl text-foreground">
            {counts.rejected.toLocaleString()}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">Documented rejections</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4">
          <div className="flex items-center justify-between text-muted-foreground text-xs font-medium">
            <span>Avg Resolution Time</span>
            <Info className="h-4 w-4 text-blue-500" />
          </div>
          <p className="mt-2 font-display text-3xl text-foreground">
            {analytics?.avgResolutionHours != null ? `${analytics.avgResolutionHours}h` : "—"}
          </p>
          <p className="mt-1 text-[11px] text-muted-foreground">From submission to decision</p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-y border-border/60 py-3">
        <div className="flex flex-wrap gap-1.5">
          {[
            { key: "pending" as const, label: `Pending (${counts.pending})` },
            { key: "approved" as const, label: `Approved (${counts.approved})` },
            { key: "rejected" as const, label: `Rejected (${counts.rejected})` },
            { key: "all" as const, label: `All (${counts.all})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "rounded-full px-3.5 py-1 text-xs font-medium transition-colors",
                activeTab === key
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-accent",
              )}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search student, roll no, field…"
            className="pl-8 text-xs h-8"
          />
        </div>
      </div>

      {/* Requests List */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <p className="text-sm text-muted-foreground">
            No correction requests found matching the current filter.
          </p>
        </div>
      ) : (
        <div className="space-y-3.5">
          {filteredRequests.map((req) => {
            const student = req.students;
            const statusConfig =
              CORRECTION_STATUS_CONFIG[
                req.status === "pending"
                  ? "submitted"
                  : ((req.status as CorrectionStatus) ?? "submitted")
              ];
            const isPending = req.status === "pending";

            // Smart suggestions preview
            const suggestions = student
              ? generateSmartSuggestions({
                  name: student.name,
                  dob: student.dob,
                  contact: student.contact,
                  programme_code: student.programme_code,
                  category: student.category,
                  intake_type: student.intake_type,
                  gender: student.gender,
                })
              : [];
            const matchingSuggestion = suggestions.find((s) => s.fieldName === req.field_name);

            // Overdue check
            const ageHours = (Date.now() - new Date(req.created_at).getTime()) / (1000 * 60 * 60);
            const isOverdue = isPending && ageHours > 48;

            return (
              <div
                key={req.id}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 transition-all hover:border-primary/40",
                  isPending ? "shadow-xs" : "opacity-80 bg-muted/15",
                )}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">
                        {student?.name ?? "Student"}
                      </span>
                      {student?.student_id && (
                        <span className="font-mono text-xs text-muted-foreground">
                          ({student.student_id})
                        </span>
                      )}
                      <Badge variant="outline" className="text-[11px] capitalize">
                        {req.field_name.replace(/_/g, " ")}
                      </Badge>
                      {isOverdue && (
                        <Badge
                          variant="destructive"
                          className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-400 border border-amber-300"
                        >
                          ⚠️ &gt;48h SLA
                        </Badge>
                      )}
                    </div>

                    {/* Diff comparison */}
                    <div className="flex flex-wrap items-center gap-2 text-xs pt-1">
                      <span className="text-muted-foreground">Current:</span>
                      <span className="rounded bg-muted px-2 py-0.5 font-mono text-muted-foreground">
                        {req.field_name === "contact"
                          ? maskContact(req.current_value)
                          : (req.current_value ?? "—")}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="text-muted-foreground">Proposed:</span>
                      <span className="rounded bg-primary/10 px-2 py-0.5 font-mono font-medium text-primary">
                        {req.field_name === "contact"
                          ? maskContact(req.proposed_value)
                          : req.proposed_value}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground pt-1">
                      <span className="font-medium text-foreground">Reason: </span>
                      {req.reason}
                    </p>

                    {/* Smart suggestion hint */}
                    {matchingSuggestion && (
                      <div className="mt-1 flex items-center gap-1.5 text-[11px] text-blue-700 dark:text-blue-400">
                        <SparklesIcon className="h-3.5 w-3.5" />
                        <span>Smart Suggestion: {matchingSuggestion.reason}</span>
                      </div>
                    )}

                    {/* Reviewer notes */}
                    {req.reviewer_notes && (
                      <p className="text-xs text-muted-foreground mt-1 rounded bg-muted/40 p-2">
                        <span className="font-semibold">Reviewer Note: </span>
                        {req.reviewer_notes}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-col items-end gap-2 shrink-0">
                    <Badge
                      className={cn(
                        "text-xs capitalize font-medium",
                        statusConfig.badgeBg,
                        statusConfig.badgeText,
                      )}
                    >
                      {req.status}
                    </Badge>

                    <Button
                      size="sm"
                      variant={isPending ? "default" : "outline"}
                      className="text-xs h-7 gap-1"
                      onClick={() => {
                        setSelectedRequest(req);
                        setReviewerNotes(req.reviewer_notes ?? "");
                      }}
                    >
                      {isPending ? "Review & Action" : "View Details"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Review & Action Dialog */}
      <Dialog
        open={selectedRequest !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedRequest(null);
            setReviewerNotes("");
          }
        }}
      >
        <DialogContent className="max-w-xl max-h-[85vh] overflow-y-auto">
          {selectedRequest && (
            <>
              <DialogHeader>
                <div className="flex items-center justify-between gap-2">
                  <DialogTitle className="font-display text-xl text-foreground">
                    Review Correction Request
                  </DialogTitle>
                  <Badge
                    className={cn(
                      "text-xs capitalize",
                      CORRECTION_STATUS_CONFIG[
                        selectedRequest.status === "pending"
                          ? "submitted"
                          : ((selectedRequest.status as CorrectionStatus) ?? "submitted")
                      ].badgeBg,
                      CORRECTION_STATUS_CONFIG[
                        selectedRequest.status === "pending"
                          ? "submitted"
                          : ((selectedRequest.status as CorrectionStatus) ?? "submitted")
                      ].badgeText,
                    )}
                  >
                    {selectedRequest.status}
                  </Badge>
                </div>
                <DialogDescription>
                  Student: {selectedRequest.students?.name}
                  {selectedRequest.students?.student_id
                    ? ` (Roll: ${selectedRequest.students.student_id})`
                    : ""}
                </DialogDescription>
              </DialogHeader>

              {/* Side-by-side comparison */}
              <div className="rounded-lg border border-border p-3.5 space-y-3 bg-muted/20 text-xs">
                <div className="flex items-center justify-between">
                  <span className="font-semibold capitalize text-foreground">
                    Target Field: {selectedRequest.field_name.replace(/_/g, " ")}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    Submitted{" "}
                    {new Date(selectedRequest.created_at).toLocaleDateString("en-IN", {
                      dateStyle: "medium",
                    })}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="rounded-md border border-border bg-background p-2.5">
                    <p className="text-[11px] font-medium text-muted-foreground">Current Value</p>
                    <p className="mt-1 font-mono font-medium text-foreground">
                      {selectedRequest.field_name === "contact"
                        ? maskContact(selectedRequest.current_value)
                        : (selectedRequest.current_value ?? "—")}
                    </p>
                  </div>
                  <div className="rounded-md border border-emerald-300/60 bg-emerald-50/30 dark:bg-emerald-950/20 p-2.5">
                    <p className="text-[11px] font-medium text-emerald-800 dark:text-emerald-300">
                      Proposed Correct Value
                    </p>
                    <p className="mt-1 font-mono font-medium text-emerald-900 dark:text-emerald-200">
                      {selectedRequest.field_name === "contact"
                        ? maskContact(selectedRequest.proposed_value)
                        : selectedRequest.proposed_value}
                    </p>
                  </div>
                </div>

                <div>
                  <span className="font-medium text-foreground">Requester's Reason: </span>
                  <span className="text-muted-foreground">{selectedRequest.reason}</span>
                </div>
              </div>

              {/* Concurrency & Conflict Detection Banner */}
              {(() => {
                const student = selectedRequest.students;
                if (!student) return null;
                const conflict = detectCorrectionConflicts(
                  { ...student, id: student.id ?? selectedRequest.student_id },
                  {
                    field_name: selectedRequest.field_name as CorrectableFieldName,
                    current_value: selectedRequest.current_value,
                    proposed_value: selectedRequest.proposed_value,
                  },
                  [],
                  [],
                );

                if (conflict.hasConflict) {
                  return (
                    <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-300">
                      <div className="flex items-center gap-2 font-semibold">
                        <AlertTriangle className="h-4 w-4 text-amber-600" />
                        <span>Potential Conflict Detected</span>
                      </div>
                      <p className="mt-1 text-[11px]">{conflict.message}</p>
                    </div>
                  );
                }

                return (
                  <div className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50/50 p-2.5 text-xs text-emerald-800 dark:bg-emerald-950/20 dark:text-emerald-300">
                    <ShieldCheck className="h-4 w-4 text-emerald-600" />
                    <span>No record conflicts detected. Safe to apply upon approval.</span>
                  </div>
                );
              })()}

              {/* Reviewer Notes & Decision Input */}
              {selectedRequest.status === "pending" ? (
                <div className="space-y-3 pt-2">
                  <div>
                    <label className="text-xs font-medium text-foreground block mb-1">
                      Reviewer Notes / Justification
                    </label>
                    <Textarea
                      value={reviewerNotes}
                      onChange={(e) => setReviewerNotes(e.target.value)}
                      placeholder="Add notes for the student. Required if rejecting (min 5 characters)."
                      rows={3}
                      className="text-xs"
                    />
                    <p className="text-[10px] text-muted-foreground mt-1">
                      * Mandatory justification is required when declining requests.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-border">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={processing}
                      onClick={() => setSelectedRequest(null)}
                    >
                      Cancel
                    </Button>
                    <Button
                      variant="destructive"
                      size="sm"
                      disabled={processing}
                      onClick={() => void handleDecision("rejected")}
                    >
                      Reject Request
                    </Button>
                    <Button
                      size="sm"
                      disabled={processing}
                      onClick={() => void handleDecision("approved")}
                    >
                      {processing ? "Applying…" : "Approve & Apply"}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex justify-end pt-2 border-t border-border">
                  <Button variant="outline" size="sm" onClick={() => setSelectedRequest(null)}>
                    Close
                  </Button>
                </div>
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SparklesIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z" />
    </svg>
  );
}
