/**
 * /profile – Student's own profile page for EduTrace (SIH26263).
 *
 * Students see ONLY their own enrolment information, data quality score,
 * and APAAR verification status.
 * They can view detected discrepancies, inspect smart correction suggestions,
 * submit requests with evidence, provide additional information, and track status.
 */
import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { studentsQueryOptions, type StudentRecord } from "@/lib/students.functions";
import {
  myCorrectionRequestsQueryOptions,
  submitCorrectionRequest,
  provideAdditionalInformation,
  type CorrectionRequest,
} from "@/lib/correction-requests.functions";
import {
  CORRECTION_STATUS_CONFIG,
  generateSmartSuggestions,
  type CorrectionStatus,
  type CorrectableFieldName,
  type SmartSuggestion,
} from "@/lib/correction-engine";
import {
  evaluateStudentRecord,
  maskApaar,
  maskContact,
  QUALITY_BAND_CONFIG,
} from "@/lib/data-quality";
import { apaarStatus } from "@/lib/student-import";
import { verifyStudentWithOrchestrator } from "@/lib/apaar-verification.functions";
import { validateLocalApaar, maskApaarId } from "@/lib/apaar-orchestrator";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  Paperclip,
  Clock,
  ArrowRight,
  MessageSquare,
  RefreshCw,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — EduTrace" },
      {
        name: "description",
        content:
          "Your personal student profile, data quality score, and APAAR verification status.",
      },
    ],
  }),
  component: StudentProfilePage,
});

const CORRECTABLE_FIELDS = [
  { value: "name", label: "Full Name" },
  { value: "dob", label: "Date of Birth" },
  { value: "gender", label: "Gender" },
  { value: "contact", label: "Contact (Mobile / Email)" },
  { value: "category", label: "Social Category" },
  { value: "programme_code", label: "Programme Code" },
  { value: "intake_type", label: "Intake Quota" },
];

function CorrectionRequestForm({
  student,
  prefill,
  onClose,
}: {
  student: StudentRecord;
  prefill?: { field: string; proposedValue: string; reason: string } | undefined;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const submitFn = useServerFn(submitCorrectionRequest);

  const [field, setField] = useState(prefill?.field ?? "");
  const [proposedValue, setProposedValue] = useState(prefill?.proposedValue ?? "");
  const [reason, setReason] = useState(prefill?.reason ?? "");
  const [evidenceName, setEvidenceName] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentValue = field
    ? ((student as unknown as Record<string, unknown>)[field] as string | null)
    : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!field || !proposedValue.trim() || !reason.trim()) {
      toast.error("Please fill in all mandatory fields.");
      return;
    }
    setSubmitting(true);
    try {
      await submitFn({
        data: {
          studentId: student.id,
          fieldName: field,
          currentValue: currentValue ?? null,
          proposedValue: proposedValue.trim(),
          reason: reason.trim(),
          evidence: evidenceName.trim()
            ? {
                fileName: evidenceName.trim(),
                fileType: "application/pdf",
                fileSize: 1024 * 250, // mock reference size
              }
            : undefined,
        },
      });
      toast.success("Correction request submitted. An officer will review it shortly.");
      await queryClient.invalidateQueries({ queryKey: ["my-correction-requests"] });
      onClose();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Submission failed.";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 mt-2">
      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">
          Field to correct <span className="text-destructive">*</span>
        </label>
        <Select value={field} onValueChange={setField}>
          <SelectTrigger id="correction-field" className="text-xs">
            <SelectValue placeholder="Select a field" />
          </SelectTrigger>
          <SelectContent>
            {CORRECTABLE_FIELDS.map((f) => (
              <SelectItem key={f.value} value={f.value} className="text-xs">
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {field && (
        <div>
          <label className="mb-1 block text-xs font-medium text-muted-foreground">
            Current Record Value
          </label>
          <p className="rounded-md border border-border bg-muted/30 px-3 py-1.5 font-mono text-xs text-foreground">
            {field === "contact" ? maskContact(currentValue) : (currentValue ?? "—")}
          </p>
        </div>
      )}

      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">
          Correct Value <span className="text-destructive">*</span>
        </label>
        <Input
          id="correction-proposed"
          value={proposedValue}
          onChange={(e) => setProposedValue(e.target.value)}
          placeholder="Enter the accurate value"
          className="text-xs"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-foreground">
          Reason for Correction <span className="text-destructive">*</span>
        </label>
        <Textarea
          id="correction-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="State the justification or certificate evidence details..."
          rows={3}
          className="text-xs"
          required
        />
      </div>

      <div>
        <label className="mb-1 block text-xs font-medium text-muted-foreground">
          Evidence Document Name (Optional)
        </label>
        <Input
          value={evidenceName}
          onChange={(e) => setEvidenceName(e.target.value)}
          placeholder="e.g. Class10_Certificate.pdf or Aadhaar_Card.pdf"
          className="text-xs"
        />
        <p className="text-[10px] text-muted-foreground mt-1">
          Supporting documents are required by AICTE regulations for legal name and DOB updates.
        </p>
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-border">
        <Button type="button" variant="outline" size="sm" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit Request"}
        </Button>
      </div>
    </form>
  );
}

function StudentProfilePage() {
  const { role, isStudent } = useUserProfile();
  const { data: students = [], isLoading } = useQuery(studentsQueryOptions);
  const { data: correctionReqs = [] } = useQuery(myCorrectionRequestsQueryOptions);

  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [prefillData, setPrefillData] = useState<
    { field: string; proposedValue: string; reason: string } | undefined
  >(undefined);

  // Response dialog state
  const [respondingToReq, setRespondingToReq] = useState<CorrectionRequest | null>(null);
  const [responseNotes, setResponseNotes] = useState("");
  const [sendingResponse, setSendingResponse] = useState(false);

  const queryClient = useQueryClient();
  const respondFn = useServerFn(provideAdditionalInformation);
  const orchestrateVerifyFn = useServerFn(verifyStudentWithOrchestrator);

  const [studentConsentGiven, setStudentConsentGiven] = useState(true);
  const [verifyingSelf, setVerifyingSelf] = useState(false);

  const myRecord = students[0] ?? null;

  async function handleVerifySelf() {
    if (!myRecord?.id || !myRecord.apaar_id) return;
    setVerifyingSelf(true);
    try {
      const result = await orchestrateVerifyFn({
        data: {
          studentId: myRecord.id,
          consentRecorded: studentConsentGiven,
          forceRefresh: true,
        },
      });
      if (result.externalStatus === "VERIFIED") {
        toast.success(`APAAR verified via ${result.providerName} (Simulated Demo Mode)`);
      } else if (result.externalStatus === "PENDING_CONSENT") {
        toast.info("Please confirm your consent to proceed with verification.");
      } else {
        toast.error(result.humanReadableResult);
      }
      await queryClient.invalidateQueries({ queryKey: ["students"] });
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Verification request failed.");
    } finally {
      setVerifyingSelf(false);
    }
  }

  // Data Quality evaluation for current student
  const qualityReport = useMemo(() => {
    if (!myRecord) return null;
    return evaluateStudentRecord({
      id: myRecord.id,
      studentId: myRecord.student_id,
      name: myRecord.name,
      dob: myRecord.dob,
      apaarId: myRecord.apaar_id,
      gender: (myRecord as unknown as { gender?: string | null })?.gender ?? null,
      contact: myRecord.contact,
      category: myRecord.category,
      programmeCode: myRecord.programme_code,
      intakeType: myRecord.intake_type,
      apaarVerifyStatus:
        (myRecord as unknown as { apaar_verify_status?: string | null })?.apaar_verify_status ??
        null,
    });
  }, [myRecord]);

  // Smart suggestions
  const smartSuggestions = useMemo(() => {
    if (!myRecord || !qualityReport) return [];
    return generateSmartSuggestions(
      {
        name: myRecord.name,
        dob: myRecord.dob,
        contact: myRecord.contact,
        programme_code: myRecord.programme_code,
        category: myRecord.category,
        intake_type: myRecord.intake_type,
        gender: (myRecord as unknown as { gender?: string | null })?.gender ?? null,
      },
      qualityReport.issues,
    );
  }, [myRecord, qualityReport]);

  async function handleSendResponse(e: React.FormEvent) {
    e.preventDefault();
    if (!respondingToReq || !responseNotes.trim()) return;

    setSendingResponse(true);
    try {
      await respondFn({
        data: {
          requestId: respondingToReq.id,
          additionalNotes: responseNotes.trim(),
        },
      });
      toast.success("Additional information sent to reviewing officer.");
      await queryClient.invalidateQueries({ queryKey: ["my-correction-requests"] });
      setRespondingToReq(null);
      setResponseNotes("");
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to send response.";
      toast.error(msg);
    } finally {
      setSendingResponse(false);
    }
  }

  if (isLoading) {
    return <p className="text-muted-foreground p-8">Loading your profile…</p>;
  }

  if (!myRecord) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
        <p className="text-4xl">📋</p>
        <h1 className="mt-4 font-display text-2xl text-foreground">No record found</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Your student record has not been linked to this account yet. Please contact your
          institution.
        </p>
      </div>
    );
  }

  const apaar = apaarStatus(myRecord.apaar_id);
  const verifyStatus =
    (myRecord as unknown as { apaar_verify_status?: string | null })?.apaar_verify_status ??
    "pending";

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl tracking-tight text-foreground">My Profile</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Student ID: <span className="font-mono">{myRecord.student_id ?? "—"}</span>
          </p>
        </div>

        <Dialog open={correctionOpen} onOpenChange={setCorrectionOpen}>
          <DialogTrigger asChild>
            <Button
              id="btn-submit-correction"
              variant="outline"
              onClick={() => setPrefillData(undefined)}
            >
              Request a correction
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Submit Correction Request</DialogTitle>
              <DialogDescription>
                Submit accurate personal or academic details for institutional review.
              </DialogDescription>
            </DialogHeader>
            <CorrectionRequestForm
              student={myRecord}
              prefill={prefillData}
              onClose={() => setCorrectionOpen(false)}
            />
          </DialogContent>
        </Dialog>
      </div>

      {/* Quality Score & Discrepancy Alert */}
      {qualityReport && (
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <ShieldCheck className="h-5 w-5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="font-display text-lg text-foreground">Enrolment Data Quality</h2>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs font-semibold",
                      QUALITY_BAND_CONFIG[qualityReport.band].badgeBg,
                      QUALITY_BAND_CONFIG[qualityReport.band].badgeText,
                    )}
                  >
                    {qualityReport.overallScore}/100 ·{" "}
                    {QUALITY_BAND_CONFIG[qualityReport.band].label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Completeness: {qualityReport.completenessScore}% · Validity:{" "}
                  {qualityReport.validityScore}%
                </p>
              </div>
            </div>

            <Button
              variant="outline"
              size="sm"
              className="text-xs"
              onClick={() => {
                setPrefillData(undefined);
                setCorrectionOpen(true);
              }}
            >
              Submit New Request
            </Button>
          </div>

          {/* Smart Suggestions Callout */}
          {smartSuggestions.length > 0 && (
            <div className="mt-4 space-y-2 border-t border-border pt-4">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                Detected Discrepancies & Smart Suggestions ({smartSuggestions.length})
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {smartSuggestions.map((sug, i) => (
                  <div
                    key={i}
                    className="flex flex-col justify-between rounded-lg border border-border/80 bg-muted/20 p-3 text-xs"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold capitalize text-foreground">
                          {sug.fieldName.replace(/_/g, " ")}
                        </span>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {sug.category}
                        </Badge>
                      </div>
                      <p className="text-muted-foreground text-[11px]">{sug.reason}</p>
                      <p className="text-[11px]">
                        <span className="text-muted-foreground">Suggested: </span>
                        <span className="font-mono font-medium text-primary">
                          {sug.proposedValue}
                        </span>
                      </p>
                    </div>

                    <div className="mt-2 pt-2 border-t border-border/40 flex justify-end">
                      <Button
                        size="sm"
                        variant="secondary"
                        className="text-[11px] h-6 px-2"
                        onClick={() => {
                          setPrefillData({
                            field: sug.fieldName,
                            proposedValue: sug.proposedValue,
                            reason: sug.reason,
                          });
                          setCorrectionOpen(true);
                        }}
                      >
                        Use Suggestion →
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Personal information */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-xl text-foreground mb-4">Personal Information</h2>
        <dl className="grid gap-y-3 sm:grid-cols-2">
          {[
            { label: "Full Name", value: myRecord.name },
            { label: "Date of Birth", value: myRecord.dob ?? "—" },
            {
              label: "Gender",
              value: (myRecord as unknown as { gender?: string | null })?.gender ?? "—",
            },
            { label: "Contact", value: maskContact(myRecord.contact) },
            { label: "Category", value: myRecord.category ?? "—" },
            { label: "Programme", value: myRecord.programme_code ?? "—" },
            { label: "Intake Type", value: myRecord.intake_type ?? "—" },
            {
              label: "Admission Year",
              value: String(
                (myRecord as unknown as { admission_year?: number | null })?.admission_year ?? "—",
              ),
            },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground capitalize">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* APAAR Status & Orchestrated Verification */}
      {(() => {
        const local = validateLocalApaar(myRecord.apaar_id);
        return (
          <section className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-xl text-foreground">APAAR Verification Engine</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Decoupled local checksum validation and external DigiLocker/ABC registry gateway
                  verification.
                </p>
              </div>
              <Badge variant="secondary" className="text-[11px] font-normal">
                Provider: Mock DigiLocker/ABC (Simulated)
              </Badge>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 pt-1">
              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Masked APAAR ID</p>
                <p className="font-mono text-sm font-bold text-foreground">
                  {maskApaarId(myRecord.apaar_id)}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {myRecord.apaar_id ? "Protected national student identifier" : "Not yet assigned"}
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">Local Validation</p>
                <div className="flex flex-wrap gap-1">
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      local.formatStatus === "FORMAT_VALID"
                        ? "border-emerald-300 text-emerald-700 dark:text-emerald-400"
                        : "border-rose-300 text-rose-700 dark:text-rose-400",
                    )}
                  >
                    {local.formatStatus === "FORMAT_VALID" ? "12 Digits ✓" : "Format Invalid"}
                  </Badge>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-[10px]",
                      local.checksumStatus === "CHECKSUM_VALID"
                        ? "border-emerald-300 text-emerald-700 dark:text-emerald-400"
                        : "border-rose-300 text-rose-700 dark:text-rose-400",
                    )}
                  >
                    {local.checksumStatus === "CHECKSUM_VALID"
                      ? "Verhoeff OK ✓"
                      : "Checksum Failed"}
                  </Badge>
                </div>
                <p className="text-[10px] text-muted-foreground">
                  Format and mathematical checksum algorithm
                </p>
              </div>

              <div className="rounded-lg border border-border bg-muted/20 p-3 space-y-1">
                <p className="text-xs font-medium text-muted-foreground">External Gateway</p>
                <div>
                  {verifyStatus === "verified" ? (
                    <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400 text-xs">
                      ✓ Verified (Simulated)
                    </Badge>
                  ) : verifyStatus === "not_found" || verifyStatus === "failed" ? (
                    <Badge variant="destructive" className="text-xs">
                      Not found in registry
                    </Badge>
                  ) : verifyStatus === "manual_review" ? (
                    <Badge variant="outline" className="border-amber-400 text-amber-700 text-xs">
                      Manual review required
                    </Badge>
                  ) : (
                    <Badge className="bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 text-xs">
                      ⏳ Unverified
                    </Badge>
                  )}
                </div>
                <p className="text-[10px] text-muted-foreground">
                  {myRecord.apaar_verified_at
                    ? `Verified at ${new Date(myRecord.apaar_verified_at).toLocaleDateString()}`
                    : "Awaiting gateway reconciliation"}
                </p>
              </div>
            </div>

            {/* Student Self-Verification Action */}
            {local.isValid && verifyStatus !== "verified" && (
              <div className="rounded-lg border border-primary/20 bg-primary/5 p-4 space-y-3">
                <div className="flex items-start gap-2">
                  <input
                    type="checkbox"
                    id="consent-check"
                    checked={studentConsentGiven}
                    onChange={(e) => setStudentConsentGiven(e.target.checked)}
                    className="mt-0.5 accent-primary cursor-pointer"
                  />
                  <label
                    htmlFor="consent-check"
                    className="text-xs text-muted-foreground leading-relaxed cursor-pointer"
                  >
                    I explicitly authorize EduTrace to query the Academic Bank of Credits (ABC) /
                    DigiLocker verification gateway to authenticate my academic identifier and
                    student enrolment record.
                  </label>
                </div>
                <div className="flex justify-end">
                  <Button
                    size="sm"
                    disabled={!studentConsentGiven || verifyingSelf}
                    onClick={() => void handleVerifySelf()}
                    className="gap-1.5 text-xs"
                  >
                    {verifyingSelf ? (
                      <RefreshCw className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    {verifyingSelf ? "Verifying with Gateway..." : "Verify My APAAR Now"}
                  </Button>
                </div>
              </div>
            )}
          </section>
        );
      })()}

      {/* Correction requests */}
      <section>
        <h2 className="font-display text-2xl text-foreground mb-4">My Correction Requests</h2>
        {correctionReqs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No correction requests submitted yet.</p>
            <Button
              variant="outline"
              className="mt-4 text-xs"
              onClick={() => {
                setPrefillData(undefined);
                setCorrectionOpen(true);
              }}
            >
              Submit first request
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {correctionReqs.map((req) => {
              const statusConfig =
                CORRECTION_STATUS_CONFIG[
                  req.status === "pending"
                    ? "submitted"
                    : ((req.status as CorrectionStatus) ?? "submitted")
                ];

              const hasNotes = Boolean(req.reviewer_notes);

              return (
                <li key={req.id} className="rounded-xl border border-border bg-card p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="space-y-1">
                      <p className="text-sm font-semibold text-foreground capitalize">
                        {req.field_name.replace(/_/g, " ")} correction
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Current:</span>{" "}
                        {req.field_name === "contact"
                          ? maskContact(req.current_value)
                          : (req.current_value ?? "—")}{" "}
                        → <span className="font-medium">Proposed:</span>{" "}
                        <span className="font-medium text-foreground">
                          {req.field_name === "contact"
                            ? maskContact(req.proposed_value)
                            : req.proposed_value}
                        </span>
                      </p>
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium">Reason:</span> {req.reason}
                      </p>
                      {req.reviewer_notes && (
                        <div className="mt-1.5 rounded-md border border-amber-200 bg-amber-50/50 dark:bg-amber-950/20 p-2 text-xs text-amber-900 dark:text-amber-300">
                          <span className="font-semibold">Reviewer Note: </span>
                          {req.reviewer_notes}
                        </div>
                      )}
                    </div>
                    <div className="flex flex-col items-end gap-1.5">
                      <Badge
                        className={cn(
                          "text-xs capitalize font-medium",
                          statusConfig.badgeBg,
                          statusConfig.badgeText,
                        )}
                      >
                        {req.status}
                      </Badge>
                      <p className="text-[10px] text-muted-foreground">
                        {new Date(req.created_at).toLocaleDateString("en-IN")}
                      </p>
                      {req.status === "pending" && hasNotes && (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-[11px] h-6 px-2 mt-1"
                          onClick={() => setRespondingToReq(req)}
                        >
                          Provide Response
                        </Button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* Response to Reviewer Dialog */}
      <Dialog
        open={respondingToReq !== null}
        onOpenChange={(open) => !open && setRespondingToReq(null)}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Respond to Reviewer</DialogTitle>
            <DialogDescription>
              Provide additional context or clarification for your{" "}
              {respondingToReq?.field_name.replace(/_/g, " ")} correction request.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={(e) => void handleSendResponse(e)} className="space-y-3 pt-2">
            <Textarea
              value={responseNotes}
              onChange={(e) => setResponseNotes(e.target.value)}
              placeholder="Enter your response or document reference details..."
              rows={4}
              className="text-xs"
              required
            />
            <div className="flex justify-end gap-2 pt-2 border-t border-border">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setRespondingToReq(null)}
                disabled={sendingResponse}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" disabled={sendingResponse}>
                {sendingResponse ? "Sending…" : "Send Response"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
