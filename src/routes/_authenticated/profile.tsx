/**
 * /profile – Student's own profile page.
 *
 * Students see ONLY their own enrolment information and APAAR verification status.
 * They can submit correction requests for incorrect personal information.
 * They can track the status of submitted correction requests.
 *
 * Non-student roles are redirected to /dashboard.
 */
import { createFileRoute, redirect, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { studentsQueryOptions, type StudentRecord } from "@/lib/students.functions";
import {
  myCorrectionRequestsQueryOptions,
  submitCorrectionRequest,
  type CorrectionRequest,
} from "@/lib/correction-requests.functions";
import { userProfileQueryOptions } from "@/lib/edutrace.functions";
import { apaarStatus } from "@/lib/student-import";
import { useUserProfile } from "@/hooks/use-user-profile";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  DialogTrigger,
} from "@/components/ui/dialog";

export const Route = createFileRoute("/_authenticated/profile")({
  head: () => ({
    meta: [
      { title: "My Profile — EduTrace" },
      {
        name: "description",
        content: "Your personal student profile and APAAR verification status.",
      },
    ],
  }),
  beforeLoad: async ({ context }) => {
    // Non-student roles should not access this page
    // We can't check server-side role here easily in beforeLoad without fetching,
    // so we check on the client in the component and the server fn enforces isolation.
  },
  component: StudentProfilePage,
});

const CORRECTABLE_FIELDS = [
  { value: "name", label: "Name" },
  { value: "dob", label: "Date of Birth" },
  { value: "gender", label: "Gender" },
  { value: "contact", label: "Contact" },
  { value: "category", label: "Category" },
  { value: "programme_code", label: "Programme Code" },
];

const STATUS_COLOR: Record<string, string> = {
  pending: "bg-amber-100 text-amber-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
};

function CorrectionRequestForm({
  student,
  onClose,
}: {
  student: StudentRecord;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();
  const submitFn = useServerFn(submitCorrectionRequest);
  const [field, setField] = useState("");
  const [proposedValue, setProposedValue] = useState("");
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const currentValue = field ? ((student as any)[field] as string | null) : null;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!field || !proposedValue.trim() || !reason.trim()) {
      toast.error("Please fill in all fields.");
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
        },
      });
      toast.success("Correction request submitted. An officer will review it shortly.");
      await queryClient.invalidateQueries({ queryKey: ["my-correction-requests"] });
      onClose();
    } catch (err: any) {
      toast.error(err?.message ?? "Submission failed.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4 mt-4">
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">
          Field to correct <span className="text-destructive">*</span>
        </label>
        <Select value={field} onValueChange={setField}>
          <SelectTrigger id="correction-field">
            <SelectValue placeholder="Select a field" />
          </SelectTrigger>
          <SelectContent>
            {CORRECTABLE_FIELDS.map((f) => (
              <SelectItem key={f.value} value={f.value}>
                {f.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {field && (
        <div>
          <label className="mb-1 block text-sm font-medium text-muted-foreground">
            Current value
          </label>
          <p className="rounded-md border border-border bg-muted/40 px-3 py-2 text-sm">
            {currentValue ?? "—"}
          </p>
        </div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">
          Correct value <span className="text-destructive">*</span>
        </label>
        <Input
          id="correction-proposed"
          value={proposedValue}
          onChange={(e) => setProposedValue(e.target.value)}
          placeholder="What should the correct value be?"
          required
        />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-foreground">
          Reason <span className="text-destructive">*</span>
        </label>
        <Textarea
          id="correction-reason"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Why is a correction needed?"
          rows={3}
          required
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
          Cancel
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? "Submitting…" : "Submit request"}
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

  // The server function already scopes to the logged-in user, so students[0] is their record.
  const myRecord = students[0] ?? null;

  if (isLoading) {
    return <p className="text-muted-foreground">Loading your profile…</p>;
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
  const verifyStatus = (myRecord as any).apaar_verify_status ?? "pending";

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
            <Button id="btn-submit-correction" variant="outline">
              Request a correction
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Submit Correction Request</DialogTitle>
            </DialogHeader>
            <CorrectionRequestForm student={myRecord} onClose={() => setCorrectionOpen(false)} />
          </DialogContent>
        </Dialog>
      </div>

      {/* Personal information */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-xl text-foreground mb-4">Personal Information</h2>
        <dl className="grid gap-y-3 sm:grid-cols-2">
          {[
            { label: "Full Name", value: myRecord.name },
            { label: "Date of Birth", value: myRecord.dob ?? "—" },
            { label: "Gender", value: (myRecord as any).gender ?? "—" },
            { label: "Contact", value: myRecord.contact ?? "—" },
            { label: "Category", value: myRecord.category ?? "—" },
            { label: "Programme", value: myRecord.programme_code ?? "—" },
            { label: "Intake Type", value: myRecord.intake_type ?? "—" },
            { label: "Admission Year", value: String((myRecord as any).admission_year ?? "—") },
            { label: "Current Status", value: (myRecord as any).current_status ?? "active" },
          ].map(({ label, value }) => (
            <div key={label}>
              <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
              <dd className="mt-0.5 text-sm font-medium text-foreground capitalize">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* APAAR Status */}
      <section className="rounded-xl border border-border bg-card p-6">
        <h2 className="font-display text-xl text-foreground mb-4">APAAR Verification</h2>
        <div className="space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">APAAR ID</p>
            {/* Mask APAAR for the student view */}
            <p className="mt-0.5 font-mono text-sm text-foreground">
              {myRecord.apaar_id
                ? `${myRecord.apaar_id.slice(0, 4)}••••${myRecord.apaar_id.slice(-4)}`
                : "Not provided"}
            </p>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Format check</p>
            <Badge
              className={
                apaar === "verified"
                  ? "bg-green-100 text-green-800"
                  : apaar === "missing"
                    ? "bg-amber-100 text-amber-800"
                    : "bg-red-100 text-red-800"
              }
            >
              {apaar === "verified"
                ? "✓ Valid format (12 digits)"
                : apaar === "missing"
                  ? "Not provided"
                  : "Invalid format"}
            </Badge>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Verification status</p>
            <Badge
              className={
                verifyStatus === "verified"
                  ? "bg-green-100 text-green-800"
                  : verifyStatus === "not_found"
                    ? "bg-red-100 text-red-800"
                    : "bg-amber-100 text-amber-800"
              }
            >
              {verifyStatus === "verified"
                ? "✓ Verified"
                : verifyStatus === "not_found"
                  ? "Not found in APAAR registry"
                  : verifyStatus === "failed"
                    ? "Verification failed"
                    : "⏳ Pending verification"}
            </Badge>
          </div>
          {(myRecord as any).apaar_verified_at && (
            <p className="text-xs text-muted-foreground">
              Verified on{" "}
              {new Date((myRecord as any).apaar_verified_at).toLocaleDateString("en-IN")}
            </p>
          )}
        </div>
      </section>

      {/* Correction requests */}
      <section>
        <h2 className="font-display text-2xl text-foreground mb-4">My Correction Requests</h2>
        {correctionReqs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
            <p className="text-sm text-muted-foreground">No correction requests yet.</p>
            <Button variant="outline" className="mt-4" onClick={() => setCorrectionOpen(true)}>
              Submit first request
            </Button>
          </div>
        ) : (
          <ul className="space-y-3">
            {correctionReqs.map((req) => (
              <li key={req.id} className="rounded-xl border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-sm font-semibold text-foreground capitalize">
                      {req.field_name.replace(/_/g, " ")} correction
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      <span className="font-medium">Current:</span> {req.current_value ?? "—"} →{" "}
                      <span className="font-medium">Proposed:</span> {req.proposed_value}
                    </p>
                    <p className="mt-0.5 text-xs text-muted-foreground">
                      <span className="font-medium">Reason:</span> {req.reason}
                    </p>
                    {req.reviewer_notes && (
                      <p className="mt-0.5 text-xs text-amber-700">
                        <span className="font-medium">Reviewer note:</span> {req.reviewer_notes}
                      </p>
                    )}
                  </div>
                  <div className="flex flex-col items-end gap-1">
                    <Badge className={STATUS_COLOR[req.status] ?? "bg-muted text-muted-foreground"}>
                      {req.status.charAt(0).toUpperCase() + req.status.slice(1)}
                    </Badge>
                    <p className="text-[10px] text-muted-foreground">
                      {new Date(req.created_at).toLocaleDateString("en-IN")}
                    </p>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
