import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
  getDemoStudents,
  getDemoProgrammes,
  getDemoCorrections,
  getDemoInstitutionalIntelligence,
  type DemoCorrectionRequest,
} from "@/lib/demo.functions";
import { useDemoRole, useDemoActiveStudent } from "@/lib/demo-role-store";
import { evaluateStudentRecord } from "@/lib/data-quality";
import { validateLocalApaar } from "@/lib/apaar-orchestrator";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  CartesianGrid,
  Legend,
} from "recharts";
import {
  Sparkles,
  Bot,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  ArrowRight,
  FileText,
  Users,
  Layers,
  TrendingUp,
  ShieldCheck,
  ShieldAlert,
  UserCheck,
  Building,
  School,
  ExternalLink,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { maskApaar, maskContact } from "@/lib/data-quality";

export const Route = createFileRoute("/demo/dashboard")({
  ssr: false,
  head: () => ({ meta: [{ title: "Dashboard — EduTrace Demo" }] }),
  component: DemoDashboard,
});

const PIE_COLORS = ["#10b981", "#ef4444", "#f59e0b", "#3b82f6"];

function DemoDashboard() {
  const [currentRole, setRole] = useDemoRole();
  const [activeStudentId, setActiveStudentId] = useDemoActiveStudent();

  const { data: students = [], isLoading: loadingStudents } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });

  const { data: programmes = [], isLoading: loadingProgrammes } = useQuery({
    queryKey: ["demo-programmes"],
    queryFn: () => getDemoProgrammes(),
  });

  const { data: corrections = [], isLoading: loadingCorrections } = useQuery({
    queryKey: ["demo-corrections"],
    queryFn: () => getDemoCorrections(),
  });

  const { data: intelligence, isLoading: loadingIntel } = useQuery({
    queryKey: ["demo-institutional-intelligence"],
    queryFn: () => getDemoInstitutionalIntelligence(),
  });

  if (loadingStudents || loadingProgrammes || loadingCorrections || loadingIntel) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-sm font-medium text-muted-foreground">Loading workspace…</p>
      </div>
    );
  }

  // Find active student record for student role
  const activeStudent =
    students.find((s) => s.id === activeStudentId) ??
    students.find((s) => s.id === "demo-3") ??
    students[0];

  // -------------------------------------------------------------------------
  // 1. STUDENT VIEW ("Student do their stuffs")
  // -------------------------------------------------------------------------
  if (currentRole === "student" && activeStudent) {
    const studentQuality = evaluateStudentRecord({
      id: activeStudent.id,
      name: activeStudent.name,
      student_id: activeStudent.student_id,
      apaar_id: activeStudent.apaar_id,
      dob: activeStudent.dob,
      contact: activeStudent.contact,
      category: activeStudent.category,
      gender: activeStudent.gender,
      programme_code: activeStudent.programme_code,
      intake_type: activeStudent.intake_type,
      apaar_verify_status: activeStudent.apaar_verify_status,
      consent_recorded: activeStudent.consent_recorded,
    });

    const localApaar = validateLocalApaar(activeStudent.apaar_id || "");
    const studentCorrections = corrections.filter(
      (c) => c.student_id === activeStudent.id || c.student_name === activeStudent.name,
    );

    return (
      <div className="space-y-6 pb-12">
        {/* Guided Step Banner */}
        <div className="rounded-xl border border-amber-300 bg-linear-to-r from-amber-50 to-orange-50 p-4 text-xs shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-amber-950 uppercase tracking-wider text-[11px]">
                🎯 Step 1: Student Persona
              </span>
              <p className="text-amber-900">
                You are currently viewing EduTrace as an enrolled <strong>Student</strong>. Students
                can only access their own educational records, verify APAAR identity numbers, and
                submit data correction requests.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setRole("officer")}
              className="bg-amber-900 hover:bg-amber-950 text-white shrink-0 text-xs"
            >
              Continue to Step 2: Officer →
            </Button>
          </div>
        </div>

        {/* Student Header & Persona Selector */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              My Student Academic Portal
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              National Institute of Technology · Academic Year 2024-25
            </p>
          </div>

          {/* Persona Switcher for testing different students */}
          <div className="flex items-center gap-2 text-xs">
            <span className="font-semibold text-muted-foreground">Demo Student:</span>
            <select
              value={activeStudent.id}
              onChange={(e) => setActiveStudentId(e.target.value)}
              className="rounded-md border border-input bg-background px-2.5 py-1 text-xs font-semibold shadow-2xs"
            >
              <option value="demo-3">Sita Devi (STU003) – Invalid Checksum</option>
              <option value="demo-1">Anita Sharma (STU001) – Verified</option>
              <option value="demo-2">Ravi Kumar (STU002) – Missing APAAR</option>
              <option value="demo-4">Rohan Verma (STU004) – Name Correction</option>
            </select>
          </div>
        </div>

        {/* Top Cards: Identity & APAAR Card */}
        <div className="grid gap-5 md:grid-cols-2">
          {/* Identity Card */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10 text-primary font-bold text-lg">
                  {activeStudent.name.charAt(0)}
                </div>
                <div>
                  <h2 className="font-display text-lg font-bold text-foreground">
                    {activeStudent.name}
                  </h2>
                  <p className="text-xs text-muted-foreground">
                    Roll No: {activeStudent.student_id}
                  </p>
                </div>
              </div>
              <Badge variant="outline" className="text-xs">
                {activeStudent.current_status ?? "Active"}
              </Badge>
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <p className="text-muted-foreground text-[11px]">Enrolled Programme</p>
                <p className="font-semibold text-foreground mt-0.5">
                  {activeStudent.programme_code}
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px]">Date of Birth</p>
                <p className="font-semibold text-foreground mt-0.5">{activeStudent.dob || "—"}</p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px]">Category / Allotment</p>
                <p className="font-semibold text-foreground mt-0.5">
                  {activeStudent.category} ({activeStudent.intake_type})
                </p>
              </div>
              <div>
                <p className="text-muted-foreground text-[11px]">Contact Mobile</p>
                <p className="font-mono text-foreground mt-0.5">
                  {activeStudent.contact ? maskContact(activeStudent.contact) : "Not registered"}
                </p>
              </div>
            </div>

            <div className="rounded-lg bg-muted/40 p-2.5 text-[11px] text-muted-foreground flex items-center justify-between">
              <span>Digital Consent Recorded:</span>
              <span className="font-semibold text-foreground">
                {activeStudent.consent_recorded ? "✓ Yes (Aadhaar e-KYC)" : "❌ Not recorded"}
              </span>
            </div>
          </div>

          {/* APAAR Digital Identity Status Card */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-primary" />
                <h3 className="font-display text-base font-bold text-foreground">
                  APAAR Digital Identity
                </h3>
              </div>
              {activeStudent.apaar_verify_status === "verified" ? (
                <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300 gap-1 text-xs">
                  <CheckCircle2 className="h-3 w-3" /> Verified
                </Badge>
              ) : activeStudent.apaar_id ? (
                <Badge className="bg-red-100 text-red-800 border-red-300 gap-1 text-xs">
                  <AlertOctagon className="h-3 w-3" /> Discrepancy Found
                </Badge>
              ) : (
                <Badge className="bg-amber-100 text-amber-800 border-amber-300 gap-1 text-xs">
                  <Clock className="h-3 w-3" /> Missing APAAR
                </Badge>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs text-muted-foreground">Registered 12-Digit APAAR ID:</p>
                <p className="font-mono text-lg font-bold tracking-widest text-foreground mt-0.5">
                  {activeStudent.apaar_id
                    ? `${activeStudent.apaar_id.slice(0, 4)} ${activeStudent.apaar_id.slice(4, 8)} ${activeStudent.apaar_id.slice(8, 12)}`
                    : "NOT REGISTERED"}
                </p>
              </div>

              {/* Local Checksum Validation Result */}
              {activeStudent.apaar_id ? (
                localApaar.isValid ? (
                  <div className="rounded-lg border border-emerald-300 bg-emerald-50/60 p-3 text-xs text-emerald-950 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5 text-emerald-900">
                      <CheckCircle2 className="h-4 w-4 text-emerald-700" />
                      Local Verhoeff Checksum Valid
                    </p>
                    <p className="text-emerald-800 text-[11px]">
                      Your 12-digit APAAR format conforms to Ministry of Education Verhoeff
                      modulo-10 standards.
                    </p>
                  </div>
                ) : (
                  <div className="rounded-lg border border-red-300 bg-red-50/70 p-3 text-xs text-red-950 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5 text-red-900">
                      <AlertOctagon className="h-4 w-4 text-red-700" />
                      Checksum Validation Error Detected
                    </p>
                    <p className="text-red-800 text-[11px]">
                      The last digit fails the Verhoeff mathematical checksum algorithm. A typo
                      occurred during registration. Please submit a correction request with your
                      official card.
                    </p>
                  </div>
                )
              ) : (
                <div className="rounded-lg border border-amber-300 bg-amber-50/70 p-3 text-xs text-amber-950">
                  <p className="font-semibold">APAAR ID Required</p>
                  <p className="text-[11px] text-amber-800 mt-0.5">
                    Your institutional record lacks a One Nation One Student ID (APAAR). Submit your
                    ID below.
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Personal Quality Health & Correction Requests */}
        <div className="grid gap-5 md:grid-cols-2">
          {/* Data Quality Completeness */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-display text-sm font-bold text-foreground">
                My Record Quality Score
              </h3>
              <Badge
                variant="outline"
                className={cn(
                  "text-xs uppercase font-bold",
                  studentQuality.overallScore >= 90
                    ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                    : studentQuality.overallScore >= 60
                      ? "bg-amber-100 text-amber-800 border-amber-300"
                      : "bg-red-100 text-red-800 border-red-300",
                )}
              >
                {studentQuality.tier} ({studentQuality.overallScore}%)
              </Badge>
            </div>

            <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  studentQuality.overallScore >= 90
                    ? "bg-emerald-500"
                    : studentQuality.overallScore >= 60
                      ? "bg-amber-500"
                      : "bg-red-500",
                )}
                style={{ width: `${studentQuality.overallScore}%` }}
              />
            </div>

            <div className="space-y-1.5 pt-1 text-xs">
              <p className="font-semibold text-muted-foreground uppercase text-[10px]">
                Field Health Checklist:
              </p>
              <div className="grid grid-cols-2 gap-2 text-[11px]">
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Full Name Complete
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> DOB Verified
                </div>
                <div className="flex items-center gap-1.5 text-emerald-700">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Category Assigned
                </div>
                <div
                  className={cn(
                    "flex items-center gap-1.5",
                    localApaar.isValid ? "text-emerald-700" : "text-red-600 font-semibold",
                  )}
                >
                  {localApaar.isValid ? (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  ) : (
                    <AlertTriangle className="h-3.5 w-3.5" />
                  )}
                  APAAR: {localApaar.isValid ? "Valid" : "Correction Needed"}
                </div>
              </div>
            </div>
          </div>

          {/* My Correction Requests */}
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-3">
            <div className="flex items-center justify-between border-b border-border pb-2">
              <h3 className="font-display text-sm font-bold text-foreground">
                My Discrepancy Requests ({studentCorrections.length})
              </h3>
              <Button asChild size="sm" variant="outline" className="text-xs h-7">
                <Link to="/demo/corrections">Request Correction</Link>
              </Button>
            </div>

            {studentCorrections.length === 0 ? (
              <div className="py-6 text-center text-xs text-muted-foreground">
                <p>No active correction requests submitted.</p>
                <p className="mt-1">
                  Spot a mistake in your record? Click above to submit a change.
                </p>
              </div>
            ) : (
              <div className="space-y-2">
                {studentCorrections.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-lg border border-border p-3 text-xs space-y-1 bg-muted/20"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-foreground uppercase text-[11px]">
                        Correcting: {req.field_name}
                      </span>
                      <Badge
                        variant="outline"
                        className={cn(
                          "text-[10px] uppercase font-bold",
                          req.status === "pending"
                            ? "bg-amber-100 text-amber-800 border-amber-300"
                            : req.status === "approved"
                              ? "bg-emerald-100 text-emerald-800 border-emerald-300"
                              : "bg-blue-100 text-blue-800 border-blue-300",
                        )}
                      >
                        {req.status.replace(/_/g, " ")}
                      </Badge>
                    </div>

                    <div className="flex items-center gap-2 text-muted-foreground">
                      <span className="line-through">{req.current_value}</span>
                      <ArrowRight className="h-3 w-3" />
                      <span className="font-semibold text-primary">{req.requested_value}</span>
                    </div>

                    <p className="text-[11px] text-muted-foreground pt-0.5">
                      <span className="font-medium text-foreground">Reason:</span> {req.reason}
                    </p>

                    {req.reviewer_notes && (
                      <p className="text-[11px] text-blue-900 bg-blue-50 border border-blue-200 rounded p-1 mt-1">
                        <span className="font-semibold">Officer Feedback:</span>{" "}
                        {req.reviewer_notes}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // 2. OFFICER VIEW ("then officer...")
  // -------------------------------------------------------------------------
  if (currentRole === "officer") {
    const unverifiedCount = students.filter((s) => s.apaar_verify_status !== "verified").length;
    const pendingCorrections = corrections.filter(
      (c) => c.status === "pending" || c.status === "in_review",
    );

    return (
      <div className="space-y-6 pb-12">
        {/* Guided Step Banner */}
        <div className="rounded-xl border border-green-300 bg-linear-to-r from-green-50 to-emerald-50 p-4 text-xs shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-green-950 uppercase tracking-wider text-[11px]">
                🎯 Step 2: Officer Persona (Verification & Scrutiny)
              </span>
              <p className="text-green-900">
                You are viewing as an institutional <strong>Verification Officer</strong>. Your
                daily responsibilities include scrutinizing incoming student correction requests,
                inspecting supporting documents, and verifying APAAR numbers.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setRole("institution_admin")}
              className="bg-green-800 hover:bg-green-900 text-white shrink-0 text-xs"
            >
              Continue to Step 3: Admin →
            </Button>
          </div>
        </div>

        {/* Officer Header */}
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
          <div>
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              Officer Verification & Scrutiny Desk
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Triage discrepancies, review identity certificates, and verify student records.
            </p>
          </div>

          <div className="flex gap-2">
            <Button asChild size="sm" variant="outline">
              <Link to="/demo/students">Verify Students Registry</Link>
            </Button>
            <Button asChild size="sm">
              <Link to="/demo/corrections">Scrutiny Queue ({pendingCorrections.length})</Link>
            </Button>
          </div>
        </div>

        {/* 3 Operational KPI Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs border-l-4 border-l-amber-500">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Pending Corrections to Scrutinize
            </p>
            <p className="font-display text-3xl font-bold text-amber-600 mt-1">
              {pendingCorrections.length}
            </p>
            <p className="text-xs text-muted-foreground mt-1">Awaiting document examination</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs border-l-4 border-l-blue-500">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Students Awaiting APAAR Verification
            </p>
            <p className="font-display text-3xl font-bold text-blue-600 mt-1">{unverifiedCount}</p>
            <p className="text-xs text-muted-foreground mt-1">
              Unverified or checksum discrepancies
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-2xs border-l-4 border-l-red-500">
            <p className="text-xs font-semibold text-muted-foreground uppercase">
              Duplicate Identity Alerts
            </p>
            <p className="font-display text-3xl font-bold text-red-600 mt-1">
              {intelligence?.identity?.totalCandidates ?? 1}
            </p>
            <p className="text-xs text-muted-foreground mt-1">
              Requiring identity resolution review
            </p>
          </div>
        </div>

        {/* Quick Triage Queue */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h2 className="font-display text-base font-bold text-foreground">
              Incoming Student Requests Awaiting Scrutiny
            </h2>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/demo/corrections">Open Queue →</Link>
            </Button>
          </div>

          <div className="grid gap-3">
            {pendingCorrections.map((req) => (
              <div
                key={req.id}
                className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border p-3.5 text-xs hover:bg-muted/20"
              >
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-foreground">{req.student_name}</span>
                    <Badge variant="outline" className="text-[10px]">
                      {req.roll_number}
                    </Badge>
                    <Badge variant="secondary" className="text-[10px]">
                      {req.programme_code}
                    </Badge>
                    <Badge className="bg-amber-100 text-amber-800 text-[10px]">
                      {req.field_name}
                    </Badge>
                  </div>
                  <p className="text-muted-foreground">
                    <span className="font-medium text-foreground">Requested change:</span>{" "}
                    {req.current_value} →{" "}
                    <span className="font-bold text-primary">{req.requested_value}</span>
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Evidence: {req.supporting_doc ?? "No document attached"}
                  </p>
                </div>

                <Button asChild size="sm" variant="outline" className="text-xs shrink-0">
                  <Link to="/demo/corrections">Scrutinize & Action</Link>
                </Button>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // 3. INSTITUTION ADMIN VIEW ("and then institution admin...")
  // -------------------------------------------------------------------------
  if (currentRole === "institution_admin") {
    const verifiedApaar = students.filter((s) => s.apaar_verify_status === "verified").length;
    const totalApprovedCapacity = programmes.reduce((s, p) => s + p.intake_approved, 0);
    const totalEnrolled = programmes.reduce((s, p) => s + p.regular_admitted, 0);
    const capacityPct =
      totalApprovedCapacity > 0
        ? Math.round((totalEnrolled / totalApprovedCapacity) * 1000) / 10
        : 0;

    const pendingCorrections = corrections.filter((c) => c.status === "pending").length;
    const slaOverdue = corrections.filter((c) => {
      if (c.status === "approved" || c.status === "rejected") return false;
      return new Date(c.sla_deadline).getTime() < Date.now();
    }).length;

    const capacityBarData = programmes.map((p) => ({
      name: p.course_code,
      Approved: p.intake_approved,
      Enrolled: p.regular_admitted,
    }));

    return (
      <div className="space-y-8 pb-16">
        {/* Guided Step Banner */}
        <div className="rounded-xl border border-blue-300 bg-linear-to-r from-blue-50 to-indigo-50 p-4 text-xs shadow-2xs">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="space-y-0.5">
              <span className="font-bold text-blue-950 uppercase tracking-wider text-[11px]">
                🎯 Step 3: Institution Admin Persona
              </span>
              <p className="text-blue-900">
                You hold executive authority over the institution. You can approve/reject student
                corrections, manage intake capacity, inspect 2025 AI forecasts, and ask the
                Institutional AI Assistant.
              </p>
            </div>
            <Button
              size="sm"
              onClick={() => setRole("aicte_admin")}
              className="bg-blue-800 hover:bg-blue-900 text-white shrink-0 text-xs"
            >
              Continue to Step 4: AICTE Admin →
            </Button>
          </div>
        </div>

        {/* Executive Header */}
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="font-display text-3xl tracking-tight text-foreground">
                Institutional Executive Dashboard
              </h1>
              <Badge className="bg-blue-100 text-blue-800">Institution Admin</Badge>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">
              National Institute of Technology · All 6 Innovation Sprints Active
            </p>
          </div>

          <div className="flex gap-2">
            <Button asChild variant="outline">
              <Link to="/demo/programmes">Intake Capacities</Link>
            </Button>
            <Button asChild className="gap-2">
              <Link to="/demo/intelligence">
                <Sparkles className="h-4 w-4" /> Intelligence Hub
              </Link>
            </Button>
          </div>
        </div>

        {/* 6 Key Executive Metric Cards */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-purple-500">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
              Health Index
            </p>
            <p className="font-display text-2xl font-bold mt-1">
              {intelligence?.overallHealthIndex ?? 84}/100
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Optimal standing</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-emerald-500">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
              Data Quality
            </p>
            <p className="font-display text-2xl font-bold mt-1">
              {intelligence?.registryHealth?.averageQualityScore ?? 84}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Average record score</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-blue-500">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
              APAAR Verified
            </p>
            <p className="font-display text-2xl font-bold mt-1">
              {intelligence?.apaar?.verificationCoveragePct ?? 71}%
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Verified coverage</p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-amber-500">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">
              Capacity Intake
            </p>
            <p className="font-display text-2xl font-bold mt-1">{capacityPct}%</p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {totalEnrolled}/{totalApprovedCapacity} seats
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-red-500">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Corrections</p>
            <p className="font-display text-2xl font-bold text-red-600 mt-1">
              {pendingCorrections}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">
              {slaOverdue > 0 ? `🚨 ${slaOverdue} overdue` : "Within SLA"}
            </p>
          </div>

          <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-orange-500">
            <p className="text-[11px] font-semibold uppercase text-muted-foreground">Duplicates</p>
            <p className="font-display text-2xl font-bold mt-1">
              {intelligence?.identity?.totalCandidates ?? 1}
            </p>
            <p className="text-[11px] text-muted-foreground mt-0.5">Candidate pairs</p>
          </div>
        </div>

        {/* Quick Launch Cards */}
        <div className="grid gap-4 sm:grid-cols-3">
          <Link
            to="/demo/intelligence"
            className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-all shadow-2xs space-y-1 block"
          >
            <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
              <Bot className="h-4 w-4 text-primary" /> Intelligence Hub & AI Assistant
            </div>
            <p className="text-xs text-muted-foreground">
              Interact with the decision support assistant and generate institutional audit reports.
            </p>
          </Link>

          <Link
            to="/demo/programmes"
            className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-all shadow-2xs space-y-1 block"
          >
            <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
              <TrendingUp className="h-4 w-4 text-blue-600" /> Programmes & Intake Forecasting
            </div>
            <p className="text-xs text-muted-foreground">
              Monitor approved quotas, overcapacity regulatory risks, and 2025 AI demand
              projections.
            </p>
          </Link>

          <Link
            to="/demo/corrections"
            className="rounded-xl border border-border bg-card p-4 hover:border-primary/50 transition-all shadow-2xs space-y-1 block"
          >
            <div className="flex items-center gap-2 font-semibold text-foreground text-sm">
              <CheckCircle2 className="h-4 w-4 text-emerald-600" /> Final Correction Approvals
            </div>
            <p className="text-xs text-muted-foreground">
              Review scrutinized requests and grant final approvals that permanently update student
              records.
            </p>
          </Link>
        </div>

        {/* Recharts Capacity Chart */}
        <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-base font-bold text-foreground">
              Programme Intake vs Approved Statutory Limit
            </h3>
            <Button asChild variant="ghost" size="sm" className="text-xs">
              <Link to="/demo/programmes">View Capacities →</Link>
            </Button>
          </div>

          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={capacityBarData}
                margin={{ top: 10, right: 10, left: -20, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" vertical={false} opacity={0.3} />
                <XAxis dataKey="name" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="Approved" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Enrolled" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------------------
  // 4. AICTE ADMIN VIEW ("and then admin do their stuffs")
  // -------------------------------------------------------------------------
  return (
    <div className="space-y-8 pb-16">
      {/* Guided Step Banner */}
      <div className="rounded-xl border border-purple-300 bg-linear-to-r from-purple-50 to-fuchsia-50 p-4 text-xs shadow-2xs">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5">
            <span className="font-bold text-purple-950 uppercase tracking-wider text-[11px]">
              🎯 Step 4: AICTE Central Admin (Macro Oversight)
            </span>
            <p className="text-purple-900">
              You are viewing as the <strong>AICTE Central Administrator</strong>. You hold
              statutory oversight over all technical institutions, national compliance, and
              regulatory cap enforcement.
            </p>
          </div>
          <Button
            size="sm"
            onClick={() => setRole("student")}
            className="bg-purple-900 hover:bg-purple-950 text-white shrink-0 text-xs"
          >
            Restart Tour from Step 1: Student ↺
          </Button>
        </div>
      </div>

      {/* AICTE Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-4">
        <div>
          <div className="flex items-center gap-2">
            <Building className="h-6 w-6 text-purple-700" />
            <h1 className="font-display text-2xl font-bold tracking-tight text-foreground">
              AICTE National Regulatory Oversight
            </h1>
            <Badge className="bg-purple-100 text-purple-800">Apex Authority</Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            All India Council for Technical Education · National Student Registry Monitoring
          </p>
        </div>

        <div className="flex gap-2">
          <Button asChild size="sm">
            <Link to="/demo/institutions">Institutions Directory</Link>
          </Button>
          <Button asChild size="sm" variant="outline">
            <Link to="/demo/audit">System Audit Logs</Link>
          </Button>
        </div>
      </div>

      {/* AICTE Oversight Metric Cards */}
      <div className="grid gap-4 sm:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-purple-500">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            Registered Institutions
          </p>
          <p className="font-display text-3xl font-bold text-foreground mt-1">3</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Autonomous & Affiliated</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-emerald-500">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            National Compliance Rate
          </p>
          <p className="font-display text-3xl font-bold text-emerald-600 mt-1">94.2%</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">Statutory quota adherence</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-red-500">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            Intake Violation Alerts
          </p>
          <p className="font-display text-3xl font-bold text-red-600 mt-1">1</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            NIT Surathkal: AIDS01 (105% intake)
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs border-l-4 border-l-amber-500">
          <p className="text-xs font-semibold text-muted-foreground uppercase">
            National Duplicate Conflicts
          </p>
          <p className="font-display text-3xl font-bold text-amber-600 mt-1">1</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Cross-record identifier collisions
          </p>
        </div>
      </div>

      {/* Statutory Regulatory Actions */}
      <div className="rounded-xl border border-border bg-card p-5 shadow-2xs space-y-4">
        <h2 className="font-display text-base font-bold text-foreground">
          Regulatory Actions & Institutional Audits
        </h2>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border border-red-200 bg-red-50/40 p-4 space-y-2 text-xs text-red-950">
            <div className="flex items-center gap-2 font-bold text-red-900">
              <AlertOctagon className="h-4 w-4 text-red-600" /> Statutory Over-Intake Notice
            </div>
            <p>
              National Institute of Technology has exceeded approved capacity in{" "}
              <strong>AIDS01</strong> (63 admitted vs 60 approved). AICTE regulatory penalty or
              emergency regularization review is pending.
            </p>
            <Button asChild size="sm" variant="destructive" className="text-xs">
              <Link to="/demo/programmes">Inspect Intake Caps</Link>
            </Button>
          </div>

          <div className="rounded-lg border border-border bg-muted/20 p-4 space-y-2 text-xs">
            <div className="flex items-center gap-2 font-bold text-foreground">
              <Building className="h-4 w-4 text-primary" /> Institutions Directory & Affiliations
            </div>
            <p className="text-muted-foreground">
              Manage all accredited colleges, scrutinize extension of approval (EOA) filings, and
              verify campus intake quotas.
            </p>
            <Button asChild size="sm" variant="outline" className="text-xs">
              <Link to="/demo/institutions">View All Institutions</Link>
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
