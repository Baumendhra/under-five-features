import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import {
  getDemoCorrections,
  reviewDemoCorrection,
  submitDemoCorrection,
  getDemoStudents,
  type DemoCorrectionRequest,
} from "@/lib/demo.functions";
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
  PlusCircle,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/demo/corrections")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Correction Centre — EduTrace Demo" },
      { name: "description", content: "Review and resolve student data discrepancies (Demo)" },
    ],
  }),
  component: DemoCorrectionsPage,
});

function DemoCorrectionsPage() {
  const queryClient = useQueryClient();
  const { role, isAicteAdmin, isInstitutionAdmin, isOfficer } = useUserProfile();

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["demo-corrections"],
    queryFn: () => getDemoCorrections(),
  });

  const { data: students = [] } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });

  const [activeTab, setActiveTab] = useState<
    "all" | "pending" | "in_review" | "approved" | "rejected"
  >("pending");
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<DemoCorrectionRequest | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);

  // New correction form state
  const [newStudentId, setNewStudentId] = useState("");
  const [newField, setNewField] = useState<
    "name" | "dob" | "apaar_id" | "contact" | "category" | "programme_code"
  >("apaar_id");
  const [newRequestedValue, setNewRequestedValue] = useState("");
  const [newReason, setNewReason] = useState("");

  // SLA calculation helper
  function getSlaStatus(deadlineStr: string, status: string) {
    if (status === "approved" || status === "rejected") return null;
    const deadline = new Date(deadlineStr).getTime();
    const now = Date.now();
    const diffHours = Math.round((deadline - now) / 3600000);

    if (diffHours < 0) {
      return {
        isBreached: true,
        text: `🚨 SLA Breached (${Math.abs(diffHours)}h overdue)`,
        className: "bg-red-100 text-red-800 border-red-300",
      };
    }
    return {
      isBreached: false,
      text: `⏱️ ${diffHours}h remaining`,
      className:
        diffHours < 12
          ? "bg-amber-100 text-amber-800 border-amber-300"
          : "bg-blue-50 text-blue-700 border-blue-200",
    };
  }

  // Filter requests
  const filteredRequests = useMemo(() => {
    let result = requests;

    if (activeTab === "pending") {
      result = result.filter((r) => r.status === "pending");
    } else if (activeTab === "in_review") {
      result = result.filter((r) => r.status === "in_review" || r.status === "more_info_required");
    } else if (activeTab === "approved") {
      result = result.filter((r) => r.status === "approved");
    } else if (activeTab === "rejected") {
      result = result.filter((r) => r.status === "rejected");
    }

    if (search.trim()) {
      const q = search.trim().toLowerCase();
      result = result.filter(
        (r) =>
          r.student_name.toLowerCase().includes(q) ||
          r.roll_number.toLowerCase().includes(q) ||
          r.field_name.toLowerCase().includes(q) ||
          r.reason.toLowerCase().includes(q),
      );
    }

    return result;
  }, [requests, activeTab, search]);

  // Analytics summary
  const totalCount = requests.length;
  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const inReviewCount = requests.filter(
    (r) => r.status === "in_review" || r.status === "more_info_required",
  ).length;
  const approvedCount = requests.filter((r) => r.status === "approved").length;
  const rejectedCount = requests.filter((r) => r.status === "rejected").length;
  const breachedCount = requests.filter((r) => {
    const sla = getSlaStatus(r.sla_deadline, r.status);
    return sla?.isBreached;
  }).length;

  async function handleReviewAction(
    newStatus: "in_review" | "more_info_required" | "approved" | "rejected",
  ) {
    if (!selectedRequest) return;
    setProcessing(true);

    try {
      await reviewDemoCorrection({
        data: {
          correctionId: selectedRequest.id,
          status: newStatus,
          notes: reviewerNotes.trim() || undefined,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["demo-corrections"] });
      await queryClient.invalidateQueries({ queryKey: ["demo-students"] });
      await queryClient.invalidateQueries({ queryKey: ["demo-institutional-intelligence"] });

      toast.success(
        newStatus === "approved"
          ? `Correction approved and applied to ${selectedRequest.student_name}.`
          : newStatus === "rejected"
            ? `Correction rejected.`
            : `Status updated to ${newStatus.replace(/_/g, " ")}.`,
      );

      setSelectedRequest(null);
      setReviewerNotes("");
    } catch {
      toast.error("Failed to update correction request.");
    } finally {
      setProcessing(false);
    }
  }

  async function handleCreateNewCorrection(e: React.FormEvent) {
    e.preventDefault();
    if (!newStudentId || !newRequestedValue.trim() || !newReason.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const st = students.find((s) => s.id === newStudentId);
    if (!st) return;

    const currVal = String((st as any)[newField] ?? "");

    try {
      await submitDemoCorrection({
        data: {
          student_id: st.id,
          student_name: st.name,
          roll_number: st.student_id || "N/A",
          programme_code: st.programme_code || "N/A",
          field_name: newField,
          current_value: currVal,
          requested_value: newRequestedValue.trim(),
          reason: newReason.trim(),
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["demo-corrections"] });
      toast.success(`Correction requested for ${st.name}.`);
      setIsNewDialogOpen(false);
      setNewStudentId("");
      setNewRequestedValue("");
      setNewReason("");
    } catch {
      toast.error("Failed to create correction request.");
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground p-8 text-center">Loading Demo Correction Centre…</p>;
  }

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight text-foreground">
              Correction Centre
            </h1>
            <Badge className="bg-amber-100 text-amber-800">Sprint 2 Demo</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Automated discrepancy review, smart suggestions, SLA monitoring & resolution.
          </p>
        </div>

        <Button onClick={() => setIsNewDialogOpen(true)} className="gap-2">
          <PlusCircle className="h-4 w-4" /> Request Correction
        </Button>
      </div>

      {/* ── Metrics Row ────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-xs font-medium text-muted-foreground">Total Requests</p>
          <p className="font-display text-2xl font-bold text-foreground mt-1">{totalCount}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Across all programmes</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-amber-500">
          <p className="text-xs font-medium text-muted-foreground">Pending Review</p>
          <p className="font-display text-2xl font-bold text-amber-600 mt-1">{pendingCount}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Awaiting triage</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-red-500">
          <p className="text-xs font-medium text-muted-foreground">SLA Breached</p>
          <p className="font-display text-2xl font-bold text-red-600 mt-1">{breachedCount}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">&gt;48 hours overdue</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-blue-500">
          <p className="text-xs font-medium text-muted-foreground">In Review / Info</p>
          <p className="font-display text-2xl font-bold text-blue-600 mt-1">{inReviewCount}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Under investigation</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-green-500">
          <p className="text-xs font-medium text-muted-foreground">Approved</p>
          <p className="font-display text-2xl font-bold text-green-600 mt-1">{approvedCount}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Applied to registry</p>
        </div>
      </div>

      {/* ── Filter Tabs & Search ────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap gap-1 rounded-lg border border-border bg-muted/40 p-1">
          <button
            onClick={() => setActiveTab("pending")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "pending"
                ? "bg-card text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Pending ({pendingCount})
          </button>
          <button
            onClick={() => setActiveTab("in_review")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "in_review"
                ? "bg-card text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            In Review ({inReviewCount})
          </button>
          <button
            onClick={() => setActiveTab("approved")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "approved"
                ? "bg-card text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Approved ({approvedCount})
          </button>
          <button
            onClick={() => setActiveTab("rejected")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "rejected"
                ? "bg-card text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            Rejected ({rejectedCount})
          </button>
          <button
            onClick={() => setActiveTab("all")}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium transition-colors",
              activeTab === "all"
                ? "bg-card text-foreground shadow-2xs"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            All ({totalCount})
          </button>
        </div>

        <div className="relative w-full max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by student, ID, reason…"
            className="pl-8 text-xs"
          />
        </div>
      </div>

      {/* ── Request List ────────────────────────────────────────────── */}
      {filteredRequests.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
          <p className="mt-3 font-display text-lg text-foreground">No requests found</p>
          <p className="text-xs text-muted-foreground mt-1">
            No correction requests match the selected tab and search filter.
          </p>
        </div>
      ) : (
        <div className="grid gap-3">
          {filteredRequests.map((req) => {
            const sla = getSlaStatus(req.sla_deadline, req.status);

            return (
              <div
                key={req.id}
                className={cn(
                  "rounded-xl border border-border bg-card p-4 transition-all hover:shadow-2xs",
                  req.status === "approved" && "border-l-4 border-l-green-500",
                  req.status === "rejected" && "border-l-4 border-l-red-400 opacity-80",
                  sla?.isBreached && "border-l-4 border-l-red-500 bg-red-50/20",
                )}
              >
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                  <div className="space-y-1.5">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground text-sm">
                        {req.student_name}
                      </span>
                      <Badge variant="outline" className="text-[11px]">
                        ID: {req.roll_number}
                      </Badge>
                      <Badge variant="secondary" className="text-[11px]">
                        {req.programme_code}
                      </Badge>
                      <Badge
                        variant="outline"
                        className={cn(
                          "capitalize text-[10px] font-semibold",
                          req.status === "pending"
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : req.status === "approved"
                              ? "bg-green-100 text-green-800 border-green-300"
                              : req.status === "rejected"
                                ? "bg-red-100 text-red-800 border-red-300"
                                : "bg-blue-100 text-blue-800 border-blue-300",
                        )}
                      >
                        {req.status.replace(/_/g, " ")}
                      </Badge>

                      {sla && (
                        <span
                          className={cn(
                            "rounded-md border px-2 py-0.5 text-[10px] font-semibold",
                            sla.className,
                          )}
                        >
                          {sla.text}
                        </span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="font-semibold text-muted-foreground uppercase">
                        {req.field_name}:
                      </span>
                      <span className="line-through text-muted-foreground">
                        {req.field_name === "apaar_id"
                          ? maskApaar(req.current_value)
                          : req.current_value || "—"}
                      </span>
                      <ArrowRight className="h-3 w-3 text-muted-foreground" />
                      <span className="font-semibold text-primary">
                        {req.field_name === "apaar_id"
                          ? maskApaar(req.requested_value)
                          : req.requested_value}
                      </span>
                    </div>

                    <p className="text-xs text-muted-foreground">
                      <span className="font-medium text-foreground">Reason:</span> {req.reason}
                    </p>

                    {req.reviewer_notes && (
                      <p className="text-xs text-blue-900 bg-blue-50 border border-blue-200 rounded p-1.5 mt-1">
                        <span className="font-semibold">Reviewer Notes:</span> {req.reviewer_notes}
                      </p>
                    )}
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setSelectedRequest(req);
                        setReviewerNotes(req.reviewer_notes ?? "");
                      }}
                      className="text-xs gap-1.5"
                    >
                      <FileText className="h-3.5 w-3.5" />
                      {req.status === "pending" || req.status === "in_review"
                        ? "Review & Action"
                        : "View Audit"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Review Dialog ───────────────────────────────────────────── */}
      {selectedRequest && (
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>Discrepancy Scrutiny & Action</span>
                <Badge variant="outline" className="text-xs uppercase">
                  {selectedRequest.status.replace(/_/g, " ")}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                Examine student identity evidence and update registry state.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2 text-sm">
              <div className="rounded-lg border border-border bg-muted/30 p-3 space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Student Name:</span>
                  <span className="font-semibold text-foreground">
                    {selectedRequest.student_name}
                  </span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Roll Number:</span>
                  <span className="font-mono text-foreground">{selectedRequest.roll_number}</span>
                </div>
                <div className="flex justify-between text-xs">
                  <span className="text-muted-foreground">Programme:</span>
                  <span className="text-foreground">{selectedRequest.programme_code}</span>
                </div>
              </div>

              {/* Comparison Box */}
              <div className="grid grid-cols-2 gap-3 rounded-lg border border-border p-3">
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Current Registry Value
                  </p>
                  <p className="font-mono text-xs text-red-600 bg-red-50 p-1.5 rounded">
                    {selectedRequest.field_name === "apaar_id"
                      ? maskApaar(selectedRequest.current_value)
                      : selectedRequest.current_value || "Empty"}
                  </p>
                </div>
                <div className="space-y-1">
                  <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                    Proposed Correction
                  </p>
                  <p className="font-mono text-xs text-emerald-700 bg-emerald-50 p-1.5 rounded font-semibold">
                    {selectedRequest.field_name === "apaar_id"
                      ? maskApaar(selectedRequest.requested_value)
                      : selectedRequest.requested_value}
                  </p>
                </div>
              </div>

              {/* Smart Suggestion */}
              {selectedRequest.suggested_fix && (
                <div className="rounded-lg border border-blue-200 bg-blue-50/50 p-2.5 text-xs text-blue-900 space-y-1">
                  <div className="flex items-center gap-1.5 font-semibold text-blue-950">
                    <Info className="h-3.5 w-3.5 text-blue-700" />
                    Intelligent Engine Suggestion:
                  </div>
                  <p className="pl-5 text-blue-900 font-mono text-[11px]">
                    {selectedRequest.suggested_fix}
                  </p>
                </div>
              )}

              {/* Attached Evidence Document */}
              {selectedRequest.supporting_doc && (
                <div className="flex items-center justify-between rounded-lg border border-border bg-card p-2 text-xs">
                  <div className="flex items-center gap-2">
                    <FileText className="h-4 w-4 text-primary" />
                    <span>{selectedRequest.supporting_doc}</span>
                  </div>
                  <Badge variant="secondary" className="text-[10px]">
                    PDF Verified
                  </Badge>
                </div>
              )}

              {/* Reviewer Notes */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">Reviewer Notes:</label>
                <Textarea
                  value={reviewerNotes}
                  onChange={(e) => setReviewerNotes(e.target.value)}
                  placeholder="Record rationale for approval, rejection, or scrutiny details…"
                  rows={3}
                  className="text-xs"
                />
              </div>
            </div>

            <div className="flex flex-wrap justify-between gap-2 border-t border-border pt-4">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSelectedRequest(null)}
                disabled={processing}
              >
                Close
              </Button>

              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleReviewAction("more_info_required")}
                  disabled={processing}
                  className="text-xs"
                >
                  Request Info
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => handleReviewAction("rejected")}
                  disabled={processing}
                  className="text-xs"
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={() => handleReviewAction("approved")}
                  disabled={processing}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs"
                >
                  Approve & Apply
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      )}

      {/* ── New Correction Dialog ───────────────────────────────────── */}
      <Dialog open={isNewDialogOpen} onOpenChange={setIsNewDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Submit Data Correction Request</DialogTitle>
            <DialogDescription>
              Create a traceable correction request for an enrolled student.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateNewCorrection} className="space-y-4 py-2 text-xs">
            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Select Student:</label>
              <select
                value={newStudentId}
                onChange={(e) => setNewStudentId(e.target.value)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-2xs"
                required
              >
                <option value="">-- Choose enrolled student --</option>
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name} ({s.student_id}) - {s.programme_code}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Field to Correct:</label>
              <select
                value={newField}
                onChange={(e) => setNewField(e.target.value as any)}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-xs shadow-2xs"
              >
                <option value="apaar_id">APAAR ID</option>
                <option value="name">Full Name</option>
                <option value="dob">Date of Birth (YYYY-MM-DD)</option>
                <option value="contact">Contact Number</option>
                <option value="category">Category (General, OBC, SC, ST)</option>
                <option value="programme_code">Programme Code</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">New Requested Value:</label>
              <Input
                value={newRequestedValue}
                onChange={(e) => setNewRequestedValue(e.target.value)}
                placeholder="Enter verified corrected value…"
                required
                className="text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="font-semibold text-foreground">Justification / Reason:</label>
              <Textarea
                value={newReason}
                onChange={(e) => setNewReason(e.target.value)}
                placeholder="Reference supporting certificates or registration errors…"
                required
                rows={2}
                className="text-xs"
              />
            </div>

            <div className="flex justify-end gap-2 border-t border-border pt-3">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setIsNewDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm">
                Submit Request
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
