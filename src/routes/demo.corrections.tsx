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
import { useDemoRole, useDemoActiveStudent } from "@/lib/demo-role-store";
import { maskApaar, maskContact } from "@/lib/data-quality";
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
  Download,
  Eye,
  Sparkles,
  UploadCloud,
} from "lucide-react";
import {
  extractEvidenceEntitiesAI,
  downloadEvidenceDocument,
  PRELOADED_EVIDENCE_DOCS,
  type DemoEvidenceDoc,
  type EvidenceVerificationResult,
} from "@/lib/evidence-ai";
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
  const [currentRole, setRole] = useDemoRole();
  const [activeStudentId, setActiveStudentId] = useDemoActiveStudent();

  const isStudent = currentRole === "student";
  const isOfficer = currentRole === "officer";
  const isAdmin = currentRole === "institution_admin" || currentRole === "aicte_admin";

  const { data: requests = [], isLoading } = useQuery({
    queryKey: ["demo-corrections"],
    queryFn: () => getDemoCorrections(),
  });

  const { data: students = [] } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });

  const activeStudent =
    students.find((s) => s.id === activeStudentId) ??
    students.find((s) => s.id === "demo-3") ??
    students[0];

  const [activeTab, setActiveTab] = useState<
    "all" | "pending" | "in_review" | "approved" | "rejected"
  >("pending");
  const [search, setSearch] = useState("");
  const [selectedRequest, setSelectedRequest] = useState<DemoCorrectionRequest | null>(null);
  const [reviewerNotes, setReviewerNotes] = useState("");
  const [processing, setProcessing] = useState(false);
  const [isNewDialogOpen, setIsNewDialogOpen] = useState(false);

  // Document Viewer & AI Verification State
  const [viewingDoc, setViewingDoc] = useState<DemoEvidenceDoc | null>(null);
  const [isDocViewerOpen, setIsDocViewerOpen] = useState(false);

  // New correction form state
  const [newStudentId, setNewStudentId] = useState(activeStudent?.id ?? "");
  const [newField, setNewField] = useState<
    "name" | "dob" | "apaar_id" | "contact" | "category" | "programme_code"
  >("apaar_id");
  const [newRequestedValue, setNewRequestedValue] = useState("");
  const [newReason, setNewReason] = useState("");
  const [newDocPreset, setNewDocPreset] = useState<string>("sita-apaar");
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [uploadedFileText, setUploadedFileText] = useState<string>("");
  const [newAiResult, setNewAiResult] = useState<EvidenceVerificationResult | null>(null);

  // Resolve matching evidence document for a given request
  const getDocForRequest = (req: DemoCorrectionRequest): DemoEvidenceDoc => {
    const sName = (req.student_name || "").toLowerCase();
    if (sName.includes("sita") || req.field_name === "apaar_id") {
      return PRELOADED_EVIDENCE_DOCS["sita-apaar"];
    }
    if (sName.includes("ravi") || req.field_name === "contact") {
      return PRELOADED_EVIDENCE_DOCS["ravi-contact"];
    }
    if (sName.includes("anita") || req.field_name === "dob") {
      return PRELOADED_EVIDENCE_DOCS["anita-dob"];
    }
    if (sName.includes("rohan") || req.field_name === "name") {
      return PRELOADED_EVIDENCE_DOCS["rohan-name"];
    }
    return {
      id: `doc-${req.id}`,
      fileName: req.supporting_doc || `${req.student_name.replace(/\s+/g, "_")}_evidence.pdf`,
      documentType: "AFFIDAVIT",
      title: "Supporting Student Registry Evidence Document",
      issuingAuthority: "Competent Authority / Notary Public",
      issuedDate: req.created_at.slice(0, 10),
      fileSizeKb: 128,
      rawText: `SUPPORTING DOCUMENTATION FOR ${req.student_name.toUpperCase()}\nRoll Number: ${req.roll_number}\nField under request: ${req.field_name}\nDeclared Value: ${req.requested_value}\nReason: ${req.reason}\n\nAttested by Institutional Verification Cell.`,
    };
  };

  const selectedDoc = useMemo(() => {
    if (!selectedRequest) return null;
    return getDocForRequest(selectedRequest);
  }, [selectedRequest]);

  const selectedAiVerification = useMemo(() => {
    if (!selectedRequest || !selectedDoc) return null;
    return extractEvidenceEntitiesAI(
      selectedDoc.rawText,
      selectedRequest.field_name,
      selectedRequest.current_value,
      selectedRequest.requested_value,
    );
  }, [selectedRequest, selectedDoc]);

  // Current document for the new correction modal
  const currentFormDoc = useMemo(() => {
    if (newDocPreset === "custom") {
      return {
        id: "custom-upload",
        fileName: uploadedFileName || "student_uploaded_credential.pdf",
        documentType: "AFFIDAVIT" as const,
        title: "User Uploaded Identity Credential",
        issuingAuthority: "Student Self-Submission",
        issuedDate: new Date().toISOString().slice(0, 10),
        fileSizeKb: Math.max(24, Math.round((uploadedFileText.length * 1.5) / 1024)),
        rawText: uploadedFileText || "No text content detected in document.",
      };
    }
    return PRELOADED_EVIDENCE_DOCS[newDocPreset] || PRELOADED_EVIDENCE_DOCS["sita-apaar"];
  }, [newDocPreset, uploadedFileName, uploadedFileText]);

  function handleScanDocumentAI() {
    if (!currentFormDoc) return;
    const res = extractEvidenceEntitiesAI(
      currentFormDoc.rawText,
      newField,
      "",
      newRequestedValue || "",
    );
    setNewAiResult(res);

    if (res.fieldSuggestedValue) {
      setNewRequestedValue(res.fieldSuggestedValue);
      setNewReason(
        `AI OCR verified from ${currentFormDoc.title} (${res.issuingAuthority}). Confirmed value: ${res.fieldSuggestedValue} (${res.confidenceScore}% confidence).`,
      );
      toast.success(
        `AI Extracted ${newField.replace(/_/g, " ")}: ${res.fieldSuggestedValue} (${res.confidenceScore}% confidence)`,
      );
    } else {
      toast.info("Document scanned. Check extracted entities below.");
    }
  }

  function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFileName(file.name);
    setNewDocPreset("custom");

    if (file.type.includes("text") || file.name.endsWith(".txt")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const txt = (ev.target?.result as string) || "";
        setUploadedFileText(txt);
        toast.success(`Loaded file ${file.name}`);
      };
      reader.readAsText(file);
    } else {
      const targetVal =
        newField === "apaar_id"
          ? "123456789010"
          : newField === "contact"
            ? "9876501234"
            : newField === "dob"
              ? "2005-04-21"
              : "Rohan K. Verma";
      const simulatedText = `GOVERNMENT OF INDIA — OFFICIAL CREDENTIAL\nCandidate: ${activeStudent?.name || "Student"}\nRoll: ${activeStudent?.student_id || "STU001"}\nProgramme: ${activeStudent?.programme_code || "CSE01"}\nExtracted Value: ${targetVal}\nDigiLocker PKI Verification: Verified.`;
      setUploadedFileText(simulatedText);
      toast.success(`Uploaded ${file.name} (${Math.round(file.size / 1024)} KB)`);
    }
  }

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

  // Filter requests based on role
  const relevantRequests = useMemo(() => {
    if (isStudent && activeStudent) {
      // Student only sees their own requests
      return requests.filter(
        (r) => r.student_id === activeStudent.id || r.student_name === activeStudent.name,
      );
    }
    return requests;
  }, [requests, isStudent, activeStudent]);

  const filteredRequests = useMemo(() => {
    let result = relevantRequests;

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
  }, [relevantRequests, activeTab, search]);

  // Analytics summary
  const totalCount = relevantRequests.length;
  const pendingCount = relevantRequests.filter((r) => r.status === "pending").length;
  const inReviewCount = relevantRequests.filter(
    (r) => r.status === "in_review" || r.status === "more_info_required",
  ).length;
  const approvedCount = relevantRequests.filter((r) => r.status === "approved").length;
  const rejectedCount = relevantRequests.filter((r) => r.status === "rejected").length;
  const breachedCount = relevantRequests.filter((r) => {
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
    const targetStudentId = isStudent ? activeStudent?.id : newStudentId;

    if (!targetStudentId || !newRequestedValue.trim() || !newReason.trim()) {
      toast.error("Please fill in all required fields.");
      return;
    }

    const st = students.find((s) => s.id === targetStudentId);
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
          supporting_doc: currentFormDoc.fileName,
          suggested_fix: newAiResult?.fieldSuggestedValue
            ? `${newAiResult.fieldSuggestedValue} (AI OCR Verified ${newAiResult.confidenceScore}%)`
            : undefined,
        },
      });

      await queryClient.invalidateQueries({ queryKey: ["demo-corrections"] });
      toast.success(`Correction requested for ${st.name} with attached evidence document.`);
      setIsNewDialogOpen(false);
      setNewRequestedValue("");
      setNewReason("");
      setNewAiResult(null);
      setNewRequestedValue("");
      setNewReason("");
    } catch {
      toast.error("Failed to create correction request.");
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground p-8 text-center">Loading Correction Centre…</p>;
  }

  return (
    <div className="space-y-6 pb-16">
      {/* ── Role Banner Guidance ───────────────────────────────────── */}
      {isStudent && activeStudent && (
        <div className="rounded-xl border border-amber-300 bg-amber-50/70 p-4 text-xs text-amber-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs">
          <div>
            <p className="font-bold text-amber-900 uppercase text-[11px]">
              👤 Student Self-Service: {activeStudent.name} ({activeStudent.student_id})
            </p>
            <p className="text-amber-800 mt-0.5">
              You are viewing your own data correction requests. To scrutinize or approve requests,
              switch your role above to <strong>Officer</strong> or{" "}
              <strong>Institution Admin</strong>.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setRole("officer")}
            className="bg-amber-900 hover:bg-amber-950 text-white shrink-0 text-xs"
          >
            Switch to Officer Scrutiny →
          </Button>
        </div>
      )}

      {isOfficer && (
        <div className="rounded-xl border border-green-300 bg-green-50/70 p-4 text-xs text-green-950 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-2xs">
          <div>
            <p className="font-bold text-green-900 uppercase text-[11px]">
              📋 Officer Scrutiny Queue
            </p>
            <p className="text-green-800 mt-0.5">
              Examine student evidence documents, add scrutiny notes, or request more info. Once
              vetted, an Institution Admin can grant final statutory approval.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setRole("institution_admin")}
            className="bg-green-800 hover:bg-green-900 text-white shrink-0 text-xs"
          >
            Switch to Admin Approval →
          </Button>
        </div>
      )}

      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight text-foreground">
              {isStudent ? "My Correction Requests" : "Correction Centre"}
            </h1>
            <Badge
              className={cn(
                "capitalize text-xs",
                isStudent
                  ? "bg-amber-100 text-amber-800"
                  : isOfficer
                    ? "bg-green-100 text-green-800"
                    : "bg-blue-100 text-blue-800",
              )}
            >
              {currentRole.replace(/_/g, " ")} View
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            {isStudent
              ? "Submit corrections for your academic records and track officer resolution."
              : "Automated discrepancy review, smart suggestions, SLA monitoring & resolution."}
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
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {isStudent ? "Your submissions" : "Across institute"}
          </p>
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
          <p className="text-[11px] text-muted-foreground mt-0.5">Under scrutiny</p>
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
            {isStudent
              ? "You have no correction requests in this category."
              : "No correction requests match the selected tab and filter."}
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
                      {isStudent
                        ? "View Request Details"
                        : isOfficer
                          ? "Scrutinize Evidence"
                          : req.status === "pending" || req.status === "in_review"
                            ? "Approve / Reject"
                            : "View Audit"}
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Review / Details Dialog ─────────────────────────────────── */}
      {selectedRequest && (
        <Dialog open={!!selectedRequest} onOpenChange={() => setSelectedRequest(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <span>
                  {isStudent
                    ? "Correction Request Status"
                    : isOfficer
                      ? "Officer Scrutiny & Triage"
                      : "Administrative Approval Decision"}
                </span>
                <Badge variant="outline" className="text-xs uppercase">
                  {selectedRequest.status.replace(/_/g, " ")}
                </Badge>
              </DialogTitle>
              <DialogDescription>
                {isStudent
                  ? "Track the verification and review progress for your submission."
                  : "Examine student identity evidence and take role-authorized action."}
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

              {/* Attached Evidence Document & AI Verification Panel */}
              {selectedRequest.supporting_doc && (
                <div className="rounded-xl border border-border bg-card p-3 space-y-3 shadow-2xs">
                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2.5">
                    <div className="flex items-center gap-2">
                      <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
                        <FileText className="h-4 w-4" />
                      </div>
                      <div>
                        <p className="font-semibold text-xs text-foreground">
                          {selectedDoc?.fileName || selectedRequest.supporting_doc}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {selectedDoc?.issuingAuthority || "Official Depository Credential"} ·{" "}
                          {selectedDoc?.fileSizeKb || 142} KB
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (selectedDoc) {
                            setViewingDoc(selectedDoc);
                            setIsDocViewerOpen(true);
                          }
                        }}
                        className="h-7 text-xs gap-1"
                      >
                        <Eye className="h-3.5 w-3.5 text-primary" /> View Document
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          if (selectedDoc) {
                            downloadEvidenceDocument(selectedDoc);
                            toast.success(`Downloaded ${selectedDoc.fileName}`);
                          }
                        }}
                        className="h-7 text-xs gap-1"
                      >
                        <Download className="h-3.5 w-3.5" /> Download
                      </Button>
                    </div>
                  </div>

                  {/* AI Verification Callout */}
                  {selectedAiVerification && (
                    <div
                      className={cn(
                        "rounded-lg border p-3 text-xs space-y-2",
                        selectedAiVerification.status === "MATCH_CONFIRMED"
                          ? "border-emerald-300 bg-emerald-50/70 text-emerald-950"
                          : "border-amber-300 bg-amber-50/70 text-amber-950",
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 font-bold text-[11px] uppercase tracking-wide">
                          <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
                          <span>
                            AI OCR Verification: {selectedAiVerification.status.replace(/_/g, " ")}
                          </span>
                        </div>
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-[10px] font-bold",
                            selectedAiVerification.status === "MATCH_CONFIRMED"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                              : "bg-amber-100 text-amber-800 border-amber-300",
                          )}
                        >
                          {selectedAiVerification.confidenceScore}% Confidence
                        </Badge>
                      </div>

                      <p className="text-[11px] leading-relaxed">
                        {selectedAiVerification.explanation}
                      </p>

                      {selectedAiVerification.checksumValidated && (
                        <p className="text-[10px] font-medium text-emerald-800 flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-emerald-600" />
                          Verhoeff Mathematical Checksum Validated (Passed Algorithm D=0)
                        </p>
                      )}

                      <div className="flex flex-wrap items-center justify-between pt-1 border-t border-emerald-200/50 text-[10px] gap-1">
                        <span className="text-muted-foreground font-medium">
                          Scrutiny Recommendation:
                        </span>
                        <span className="font-semibold">
                          {selectedAiVerification.suggestedAction}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Reviewer Notes (editable for Officer / Admin, read-only for Student) */}
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-foreground">
                  {isStudent ? "Officer Feedback / Reviewer Notes:" : "Reviewer Notes:"}
                </label>
                {isStudent ? (
                  <p className="rounded-md border border-border bg-muted/40 p-2 text-xs text-muted-foreground">
                    {selectedRequest.reviewer_notes || "No officer comments entered yet."}
                  </p>
                ) : (
                  <Textarea
                    value={reviewerNotes}
                    onChange={(e) => setReviewerNotes(e.target.value)}
                    placeholder="Record rationale for approval, rejection, or scrutiny details…"
                    rows={3}
                    className="text-xs"
                  />
                )}
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

              {/* Action buttons differ by role */}
              {isStudent ? (
                <span className="text-xs text-muted-foreground self-center italic">
                  Awaiting institutional officer scrutiny
                </span>
              ) : isOfficer ? (
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
                    size="sm"
                    onClick={() => handleReviewAction("in_review")}
                    disabled={processing}
                    className="bg-green-700 hover:bg-green-800 text-white text-xs"
                  >
                    Mark Verified & In Review
                  </Button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
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
                    Approve & Apply to Registry
                  </Button>
                </div>
              )}
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
              {isStudent
                ? "Request a formal correction for your student record."
                : "Create a traceable correction request for an enrolled student."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreateNewCorrection} className="space-y-4 py-2 text-xs">
            {/* If Student, display fixed active student */}
            {isStudent && activeStudent ? (
              <div className="rounded-lg bg-muted/30 p-2.5 border border-border">
                <p className="text-[11px] text-muted-foreground">Requesting for Student:</p>
                <p className="font-semibold text-foreground">
                  {activeStudent.name} (Roll: {activeStudent.student_id})
                </p>
                <p className="text-[11px] text-muted-foreground">{activeStudent.programme_code}</p>
              </div>
            ) : (
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
            )}

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

            {/* Evidence Document Attachment & AI Extraction Section */}
            <div className="rounded-xl border border-primary/20 bg-muted/20 p-3 space-y-2.5">
              <div className="flex items-center justify-between">
                <label className="font-semibold text-foreground flex items-center gap-1.5 text-xs">
                  <FileText className="h-3.5 w-3.5 text-primary" />
                  Supporting Evidence Document:
                </label>
                <Badge
                  variant="outline"
                  className="text-[10px] bg-primary/5 text-primary border-primary/20"
                >
                  AI OCR Enabled
                </Badge>
              </div>

              {/* Document Preset Selection */}
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newDocPreset}
                  onChange={(e) => {
                    setNewDocPreset(e.target.value);
                    setNewAiResult(null);
                  }}
                  className="rounded-md border border-input bg-background px-2.5 py-1.5 text-xs shadow-2xs"
                >
                  <option value="sita-apaar">DigiLocker APAAR Allotment (PDF)</option>
                  <option value="anita-dob">CBSE Class X Certificate (PDF)</option>
                  <option value="ravi-contact">Notarized Parent Affidavit (PDF)</option>
                  <option value="rohan-name">Gazette Name Notification (PDF)</option>
                  <option value="custom">Upload Local File / Document...</option>
                </select>

                <div className="flex gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (currentFormDoc) {
                        setViewingDoc(currentFormDoc);
                        setIsDocViewerOpen(true);
                      }
                    }}
                    className="flex-1 h-8 text-[11px] gap-1"
                  >
                    <Eye className="h-3.5 w-3.5" /> View
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      if (currentFormDoc) {
                        downloadEvidenceDocument(currentFormDoc);
                        toast.success(`Downloaded ${currentFormDoc.fileName}`);
                      }
                    }}
                    className="h-8 px-2 text-[11px]"
                    title="Download document file"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>

              {/* If Custom Upload selected, show real file input */}
              {newDocPreset === "custom" && (
                <div className="space-y-1">
                  <Input
                    type="file"
                    accept=".pdf,.txt,.png,.jpg,.jpeg"
                    onChange={handleFileUpload}
                    className="text-xs file:text-xs file:mr-2 file:py-0.5 file:px-2 file:rounded file:border-0 file:bg-primary file:text-primary-foreground"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    Upload certificate (.pdf, .txt, image) to simulate local OCR processing.
                  </p>
                </div>
              )}

              {/* AI OCR Scan & Auto-Fill Trigger */}
              <div className="flex items-center justify-between pt-1">
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleScanDocumentAI}
                  className="w-full gap-1.5 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/20 text-xs font-semibold h-8"
                >
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  Scan Document & Auto-Extract Value with AI
                </Button>
              </div>

              {/* AI Extraction Banner */}
              {newAiResult && (
                <div
                  className={cn(
                    "rounded-lg border p-2.5 text-[11px] space-y-1",
                    newAiResult.status === "MATCH_CONFIRMED"
                      ? "border-emerald-300 bg-emerald-50/80 text-emerald-950"
                      : "border-blue-300 bg-blue-50/80 text-blue-950",
                  )}
                >
                  <div className="flex items-center justify-between font-bold">
                    <span>✓ Extracted: {newAiResult.fieldSuggestedValue || "Detected"}</span>
                    <Badge variant="outline" className="text-[10px] bg-white text-emerald-800">
                      {newAiResult.confidenceScore}% Confidence
                    </Badge>
                  </div>
                  <p className="text-[10px] text-muted-foreground">{newAiResult.explanation}</p>
                  {newAiResult.checksumValidated && (
                    <p className="text-[10px] font-medium text-emerald-700">
                      ✓ Verhoeff Mathematical Checksum Validated
                    </p>
                  )}
                </div>
              )}
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

      {/* ── Evidence Document Viewer & Downloader Modal ─────────────── */}
      <Dialog open={isDocViewerOpen} onOpenChange={setIsDocViewerOpen}>
        <DialogContent className="max-w-2xl max-h-[88vh] overflow-y-auto">
          {viewingDoc && (
            <div className="space-y-4">
              <DialogHeader>
                <div className="flex items-start justify-between gap-3 border-b border-border pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10 text-primary shrink-0">
                      <FileText className="h-5 w-5" />
                    </div>
                    <div>
                      <DialogTitle className="text-base font-bold text-foreground">
                        {viewingDoc.title}
                      </DialogTitle>
                      <DialogDescription className="text-xs">
                        {viewingDoc.fileName} · {viewingDoc.fileSizeKb} KB ·{" "}
                        <span className="font-semibold text-foreground">
                          {viewingDoc.issuingAuthority}
                        </span>
                      </DialogDescription>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    onClick={() => {
                      downloadEvidenceDocument(viewingDoc);
                      toast.success(`Downloaded ${viewingDoc.fileName}`);
                    }}
                    className="gap-1.5 text-xs bg-primary text-primary-foreground shrink-0"
                  >
                    <Download className="h-3.5 w-3.5" /> Download
                  </Button>
                </div>
              </DialogHeader>

              {/* Official Credential Header Card */}
              <div className="rounded-xl border border-primary/20 bg-linear-to-r from-primary/5 via-card to-accent/5 p-3.5 space-y-1.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-bold uppercase tracking-wider text-primary text-[11px]">
                    🏛️ Government of India / National Repository
                  </span>
                  <Badge
                    variant="outline"
                    className="bg-emerald-50 text-emerald-800 border-emerald-300 text-[10px]"
                  >
                    ✓ DigiLocker PKI Valid
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  Official digitally signed credential. Validated under Section 65B of Indian
                  Information Technology Act 2000.
                </p>
              </div>

              {/* Document Transcript in Official Monospace View */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-foreground uppercase tracking-wide">
                    Document Transcript & Verification Stream:
                  </span>
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(viewingDoc.rawText);
                      toast.success("Document text copied to clipboard.");
                    }}
                    className="text-[11px] text-primary hover:underline font-medium"
                  >
                    Copy Text
                  </button>
                </div>
                <div className="rounded-lg border border-border bg-muted/40 p-4 font-mono text-[11px] leading-relaxed text-foreground whitespace-pre-wrap select-all max-h-72 overflow-y-auto">
                  {viewingDoc.rawText}
                </div>
              </div>

              <div className="flex justify-between items-center border-t border-border pt-3">
                <span className="text-[11px] text-muted-foreground">
                  Document ID: {viewingDoc.id} · Issued {viewingDoc.issuedDate}
                </span>
                <Button variant="outline" size="sm" onClick={() => setIsDocViewerOpen(false)}>
                  Close Viewer
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
