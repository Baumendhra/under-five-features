import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
  getDemoInstitutionalIntelligence,
  askDemoAssistant,
  generateDemoReport,
  resetDemoSandboxData,
} from "@/lib/demo.functions";
import type { InstitutionalReportType, InstitutionalAIResponse } from "@/lib/institutional-ai";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Sparkles,
  Bot,
  RefreshCw,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Clock,
  ArrowRight,
  FileText,
  ThumbsUp,
  ThumbsDown,
  Layers,
  Copy,
  ChevronRight,
  TrendingUp,
  Download,
  RotateCcw,
} from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/demo/intelligence")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Institutional Intelligence Hub — EduTrace Demo" },
      {
        name: "description",
        content: "Executive Decision Support & Cross-Module Intelligence Hub",
      },
    ],
  }),
  component: DemoIntelligencePage,
});

const SUGGESTED_QUESTIONS = [
  "What are our primary operational risks and regulatory bottlenecks?",
  "Summarize our programme intake capacity and utilization rates.",
  "How many student records have data-quality or verification problems?",
  "What is the status of pending corrections and SLA overdue requests?",
  "Which duplicate identity candidates require urgent review?",
];

const REPORT_TYPE_LABELS: Record<InstitutionalReportType, string> = {
  executive_summary: "Executive Summary",
  registry_health: "Student Registry Health",
  data_quality: "Data Quality Audit",
  corrections: "Correction Workflow & SLA",
  duplicate_identity: "Duplicate Identity Review",
  apaar_verification: "APAAR Verification Summary",
  intake_capacity: "Intake & Capacity Forecast",
  operational_risk: "Operational Risk & Priorities",
};

function DemoIntelligencePage() {
  const queryClient = useQueryClient();

  const { data, isLoading, isRefetching, refetch } = useQuery({
    queryKey: ["demo-institutional-intelligence"],
    queryFn: () => getDemoInstitutionalIntelligence(),
  });

  // Assistant State
  const [question, setQuestion] = useState("");
  const [chatMessages, setChatMessages] = useState<
    Array<{
      id: string;
      role: "user" | "assistant";
      text?: string;
      response?: InstitutionalAIResponse;
    }>
  >([]);
  const [isAsking, setIsAsking] = useState(false);

  // Report State
  const [selectedReportType, setSelectedReportType] =
    useState<InstitutionalReportType>("executive_summary");
  const [reportingPeriod, setReportingPeriod] = useState("Academic Year 2024-25");
  const [generatedReport, setGeneratedReport] = useState<InstitutionalAIResponse | null>(null);
  const [isGeneratingReport, setIsGeneratingReport] = useState(false);

  // Feedback State
  const [feedbackRecorded, setFeedbackRecorded] = useState<Record<string, string>>({});

  // Handlers
  async function handleAskAssistant(qToAsk?: string) {
    const q = (qToAsk ?? question).trim();
    if (!q) return;

    const userMsgId = `usr-${Date.now()}`;
    setChatMessages((prev) => [...prev, { id: userMsgId, role: "user", text: q }]);
    setQuestion("");
    setIsAsking(true);

    try {
      const res = await askDemoAssistant({ data: { question: q } });
      const assistantMsgId = `ast-${Date.now()}`;
      setChatMessages((prev) => [
        ...prev,
        {
          id: assistantMsgId,
          role: "assistant",
          response: res,
        },
      ]);
    } catch {
      toast.error("Failed to generate assistant response.");
    } finally {
      setIsAsking(false);
    }
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    try {
      const res = await generateDemoReport({
        data: {
          reportType: selectedReportType,
          period: reportingPeriod,
        },
      });
      setGeneratedReport(res);
      toast.success("Institutional report generated.");
    } catch {
      toast.error("Failed to generate report.");
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function handleResetData() {
    try {
      await resetDemoSandboxData();
      await queryClient.invalidateQueries({ queryKey: ["demo-institutional-intelligence"] });
      await queryClient.invalidateQueries({ queryKey: ["demo-students"] });
      toast.success("Demo sandbox reset to initial state.");
    } catch {
      toast.error("Reset failed.");
    }
  }

  function handleRecordFeedback(insightKey: string, rating: "helpful" | "unhelpful") {
    setFeedbackRecorded((prev) => ({ ...prev, [insightKey]: rating }));
    toast.success(`Feedback recorded: ${rating}`);
  }

  function handleDownloadReport() {
    if (!generatedReport) return;
    const content = `# EduTrace Institutional Intelligence Report\n**Report Type:** ${REPORT_TYPE_LABELS[selectedReportType]}\n**Generated At:** ${generatedReport.generatedAt}\n**Model:** ${generatedReport.modelUsed}\n\n## Executive Summary\n${generatedReport.summary}\n\n## Key Observations\n${generatedReport.keyObservations.map((o) => `- ${o}`).join("\n")}\n\n## Action Recommendations\n${generatedReport.suggestedActions.map((a) => `- [${a.priority}] ${a.action} (${a.responsibleRole})`).join("\n")}\n\n## Supporting Metrics\n${Object.entries(
      generatedReport.supportingMetrics,
    )
      .map(([k, v]) => `- **${k}:** ${v}`)
      .join("\n")}\n`;
    const blob = new Blob([content], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `edutrace-report-${selectedReportType}-${new Date().toISOString().slice(0, 10)}.md`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    toast.success("Report downloaded.");
  }

  if (isLoading) {
    return (
      <div className="flex h-96 items-center justify-center space-y-4">
        <div className="flex flex-col items-center gap-3">
          <RefreshCw className="h-8 w-8 animate-spin text-primary" />
          <p className="text-sm font-medium text-muted-foreground">
            Synthesizing institutional intelligence across all 5 innovation modules…
          </p>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8 text-center">
        <p className="text-muted-foreground">Unable to synthesize intelligence.</p>
        <Button onClick={() => void refetch()} className="mt-4">
          Retry
        </Button>
      </div>
    );
  }

  const {
    registryHealth,
    corrections,
    identity,
    apaar,
    intake,
    operationalPriorities,
    overallHealthIndex,
    overallHealthStatus,
  } = data;

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight text-foreground">
              Institutional Intelligence Hub
            </h1>
            <Badge className="bg-amber-100 text-amber-800">Sprint 6 Demo</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Cross-module decision support, predictive intake, identity governance & APAAR
            orchestration.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void refetch()}
            disabled={isRefetching}
            className="gap-1.5"
          >
            <RefreshCw className={cn("h-4 w-4", isRefetching && "animate-spin")} />
            Refresh Intelligence
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={() => void handleResetData()}
            className="gap-1.5 text-muted-foreground hover:text-foreground"
          >
            <RotateCcw className="h-4 w-4" />
            Reset Demo Data
          </Button>
        </div>
      </div>

      {/* ── Executive Health Banner ───────────────────────────────── */}
      <div className="rounded-2xl border border-primary/20 bg-linear-to-r from-primary/5 via-card to-accent/10 p-6 shadow-sm">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary text-primary-foreground text-sm font-bold">
                ✓
              </span>
              <h2 className="text-lg font-semibold text-foreground">
                National Institute of Technology (Demo Sandbox)
              </h2>
            </div>
            <p className="max-w-2xl text-xs text-muted-foreground sm:text-sm">
              All 5 innovation engines are actively aggregated. Overall registry health score is
              computed through transparent, explainable weights across quality, verification,
              compliance, and discrepancy resolution.
            </p>
          </div>

          <div className="flex items-center gap-4 border-t border-border pt-4 md:border-t-0 md:pt-0">
            <div className="text-right">
              <p className="text-xs uppercase tracking-wider text-muted-foreground">
                Health Status
              </p>
              <div className="flex items-center justify-end gap-2">
                <span
                  className={cn(
                    "inline-block h-3 w-3 rounded-full",
                    overallHealthStatus === "HEALTHY"
                      ? "bg-green-500"
                      : overallHealthStatus === "ATTENTION_REQUIRED"
                        ? "bg-amber-500"
                        : "bg-red-500",
                  )}
                />
                <span className="font-display text-lg font-bold uppercase tracking-tight">
                  {overallHealthStatus.replace("_", " ")}
                </span>
              </div>
            </div>

            <div className="flex flex-col items-center justify-center rounded-xl bg-card px-5 py-3 shadow-sm border border-border">
              <span className="text-xs font-semibold text-muted-foreground">Index</span>
              <span className="font-display text-3xl font-extrabold text-foreground">
                {overallHealthIndex}
                <span className="text-sm font-normal text-muted-foreground">/100</span>
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* ── 4 Core Domain Cards ───────────────────────────────────── */}
      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {/* Domain 1: Data Quality */}
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Data Quality Health
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                Sprint 1
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold">
                {registryHealth.averageQualityScore}%
              </span>
              <span className="text-xs text-muted-foreground">
                {registryHealth.completeRecordsCount} of {registryHealth.totalStudents} pristine
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-emerald-500 transition-all"
                style={{ width: `${registryHealth.averageQualityScore}%` }}
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
              <span>Critical: {registryHealth.qualityBands.critical}</span>
              <Link to="/demo/students" className="text-primary hover:underline font-medium">
                View registry →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Domain 2: APAAR Verification */}
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                APAAR Coverage
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                Sprint 5
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold">
                {apaar.verificationCoveragePct}%
              </span>
              <span className="text-xs text-muted-foreground">{apaar.verifiedCount} verified</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className="h-full bg-blue-500 transition-all"
                style={{ width: `${apaar.verificationCoveragePct}%` }}
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
              <span>Pending: {apaar.unverifiedCount}</span>
              <Link to="/demo/students" className="text-primary hover:underline font-medium">
                Batch verify →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Domain 3: Intake & Capacity */}
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Capacity Utilization
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                Sprint 4
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold">
                {intake.overallCapacityUtilizationPct}%
              </span>
              <span className="text-xs text-muted-foreground">
                {intake.actualRegularAdmissions} / {intake.approvedCapacityTotal} seats
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  intake.overallCapacityUtilizationPct > 100
                    ? "bg-red-500"
                    : intake.overallCapacityUtilizationPct < 50
                      ? "bg-amber-500"
                      : "bg-emerald-500",
                )}
                style={{ width: `${Math.min(100, intake.overallCapacityUtilizationPct)}%` }}
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
              <span className="text-amber-600 font-medium">
                {intake.earlyWarnings.length} Warnings
              </span>
              <Link to="/demo/programmes" className="text-primary hover:underline font-medium">
                Forecasts →
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Domain 4: Corrections & Duplicates */}
        <Card className="transition-all hover:shadow-md">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                Corrections & SLA
              </CardTitle>
              <Badge variant="outline" className="text-xs">
                Sprint 2 & 3
              </Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-baseline justify-between">
              <span className="font-display text-3xl font-bold">
                {corrections.pendingCorrections}
              </span>
              <span
                className={cn(
                  "text-xs font-semibold",
                  corrections.breachedSlaCorrections > 0 ? "text-red-600" : "text-green-600",
                )}
              >
                {corrections.breachedSlaCorrections > 0
                  ? `🚨 ${corrections.breachedSlaCorrections} Overdue`
                  : "On track"}
              </span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all",
                  corrections.breachedSlaCorrections > 0 ? "bg-red-500" : "bg-emerald-500",
                )}
                style={{
                  width: `${Math.min(
                    100,
                    (corrections.pendingCorrections / (corrections.totalCorrections || 1)) * 100,
                  )}%`,
                }}
              />
            </div>
            <div className="flex items-center justify-between pt-1 text-xs text-muted-foreground">
              <span>{identity.totalCandidates} Duplicates</span>
              <Link to="/demo/corrections" className="text-primary hover:underline font-medium">
                Action center →
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* ── Priority Action Centre ─────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertOctagon className="h-5 w-5 text-amber-600" />
            <h2 className="font-display text-xl tracking-tight text-foreground">
              Priority Action Centre
            </h2>
          </div>
          <span className="text-xs text-muted-foreground">
            {operationalPriorities.length} explainable priorities derived
          </span>
        </div>

        <div className="grid gap-3">
          {operationalPriorities.map((item) => (
            <div
              key={item.id}
              className={cn(
                "flex flex-col justify-between gap-4 rounded-xl border p-4 transition-all sm:flex-row sm:items-center",
                item.category === "CRITICAL"
                  ? "border-red-300 bg-red-50/50"
                  : item.category === "HIGH"
                    ? "border-amber-300 bg-amber-50/50"
                    : "border-border bg-card",
              )}
            >
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge
                    variant="outline"
                    className={cn(
                      "font-semibold uppercase tracking-wider text-[10px]",
                      item.category === "CRITICAL"
                        ? "border-red-400 bg-red-100 text-red-800"
                        : item.category === "HIGH"
                          ? "border-amber-400 bg-amber-100 text-amber-800"
                          : "border-blue-400 bg-blue-100 text-blue-800",
                    )}
                  >
                    {item.category}
                  </Badge>
                  <span className="font-semibold text-foreground text-sm">{item.title}</span>
                  <Badge variant="secondary" className="text-[10px]">
                    {item.responsibleRole.replace("_", " ")}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground">{item.rationale}</p>
                <p className="text-xs font-medium text-foreground/90">
                  <span className="text-primary font-semibold">Recommended Action:</span>{" "}
                  {item.suggestedAction}
                </p>
              </div>

              <div className="shrink-0">
                <Button
                  size="sm"
                  asChild
                  variant={item.category === "CRITICAL" ? "destructive" : "default"}
                  className="gap-1.5 text-xs"
                >
                  <Link to={item.routeLink.replace("/_", "/demo/")}>
                    Execute Action <ChevronRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Interactive AI Decision Assistant ─────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Bot className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Institutional Decision Assistant
              </h2>
              <p className="text-xs text-muted-foreground">
                Grounded offline AI engine analyzing real-time institutional metrics & registry
                health.
              </p>
            </div>
          </div>
          <Badge variant="outline" className="bg-muted text-muted-foreground text-xs">
            Offline Deterministic Provider
          </Badge>
        </div>

        {/* Suggested Question Chips */}
        <div className="space-y-2">
          <p className="text-xs font-medium text-muted-foreground">Recommended Inquiries:</p>
          <div className="flex flex-wrap gap-2">
            {SUGGESTED_QUESTIONS.map((q) => (
              <button
                key={q}
                onClick={() => void handleAskAssistant(q)}
                disabled={isAsking}
                className="rounded-full border border-border bg-background px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-primary hover:text-foreground hover:bg-accent text-left"
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Chat Stream */}
        {chatMessages.length > 0 && (
          <div className="space-y-4 rounded-xl border border-border bg-muted/30 p-4 max-h-[500px] overflow-y-auto">
            {chatMessages.map((msg) => (
              <div
                key={msg.id}
                className={cn(
                  "flex flex-col gap-2 rounded-xl p-4 text-sm",
                  msg.role === "user"
                    ? "ml-auto max-w-xl bg-primary text-primary-foreground"
                    : "mr-auto max-w-3xl bg-card border border-border text-foreground shadow-xs",
                )}
              >
                {msg.role === "user" ? (
                  <p className="font-medium">{msg.text}</p>
                ) : msg.response ? (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between border-b border-border pb-2 text-xs text-muted-foreground">
                      <span className="font-semibold text-primary">AI Decision Engine</span>
                      <span>Confidence: {msg.response.confidence}</span>
                    </div>

                    <p className="font-semibold text-foreground leading-relaxed">
                      {msg.response.summary}
                    </p>

                    {msg.response.keyObservations.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Key Diagnostic Observations:
                        </p>
                        <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                          {msg.response.keyObservations.map((obs, i) => (
                            <li key={i}>{obs}</li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {msg.response.suggestedActions.length > 0 && (
                      <div className="space-y-1.5 pt-1">
                        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                          Recommended Interventions:
                        </p>
                        <div className="grid gap-1.5">
                          {msg.response.suggestedActions.map((act, i) => (
                            <div
                              key={i}
                              className="flex items-start gap-2 rounded-lg bg-accent/40 p-2 text-xs"
                            >
                              <Badge variant="outline" className="text-[10px] uppercase shrink-0">
                                {act.priority}
                              </Badge>
                              <span>
                                {act.action}{" "}
                                <span className="text-muted-foreground">
                                  ({act.responsibleRole})
                                </span>
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    <div className="flex items-center justify-between border-t border-border pt-2 text-xs">
                      <span className="text-muted-foreground">Was this insight helpful?</span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecordFeedback(msg.id, "helpful")}
                          className={cn(
                            "h-6 px-2 text-xs gap-1",
                            feedbackRecorded[msg.id] === "helpful" && "text-green-600 bg-green-50",
                          )}
                        >
                          <ThumbsUp className="h-3 w-3" /> Yes
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleRecordFeedback(msg.id, "unhelpful")}
                          className={cn(
                            "h-6 px-2 text-xs gap-1",
                            feedbackRecorded[msg.id] === "unhelpful" && "text-red-600 bg-red-50",
                          )}
                        >
                          <ThumbsDown className="h-3 w-3" /> No
                        </Button>
                      </div>
                    </div>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}

        {/* Input Form */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void handleAskAssistant();
          }}
          className="flex gap-2"
        >
          <Input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about regulatory risks, student bottlenecks, capacity forecasting, or data issues…"
            disabled={isAsking}
            className="flex-1"
          />
          <Button type="submit" disabled={isAsking || !question.trim()} className="gap-2">
            {isAsking ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Analyzing…
              </>
            ) : (
              <>
                Ask Assistant <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
        </form>
      </div>

      {/* ── Executive Report Generator ─────────────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
        <div className="flex items-center justify-between border-b border-border pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <FileText className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-lg font-semibold text-foreground">
                Executive Report Generator
              </h2>
              <p className="text-xs text-muted-foreground">
                Generate auditable markdown reports synthesizing real-time institutional metrics.
              </p>
            </div>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-1.5 sm:col-span-2">
            <label className="text-xs font-semibold text-muted-foreground">Report Scope:</label>
            <select
              value={selectedReportType}
              onChange={(e) => setSelectedReportType(e.target.value as InstitutionalReportType)}
              className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {Object.entries(REPORT_TYPE_LABELS).map(([k, label]) => (
                <option key={k} value={k}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">Period:</label>
            <Input
              value={reportingPeriod}
              onChange={(e) => setReportingPeriod(e.target.value)}
              className="text-sm"
            />
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <Button
            onClick={() => void handleGenerateReport()}
            disabled={isGeneratingReport}
            className="gap-2"
          >
            {isGeneratingReport ? (
              <>
                <RefreshCw className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" /> Generate Report
              </>
            )}
          </Button>
        </div>

        {/* Render Generated Report */}
        {generatedReport && (
          <div className="mt-4 rounded-xl border border-border bg-muted/20 p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <div>
                <h3 className="font-display font-semibold text-foreground text-base">
                  {REPORT_TYPE_LABELS[selectedReportType]}
                </h3>
                <p className="text-xs text-muted-foreground">
                  Generated at {new Date(generatedReport.generatedAt).toLocaleString()} · Model:{" "}
                  {generatedReport.modelUsed}
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadReport}
                className="gap-1.5 text-xs"
              >
                <Download className="h-3.5 w-3.5" /> Download (.md)
              </Button>
            </div>

            <div className="prose prose-sm dark:prose-invert max-w-none space-y-3">
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-primary">
                  Executive Summary
                </h4>
                <p className="text-sm text-foreground leading-relaxed">{generatedReport.summary}</p>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Key Findings & Observations
                </h4>
                <ul className="list-disc pl-5 space-y-1 text-xs text-muted-foreground">
                  {generatedReport.keyObservations.map((obs, i) => (
                    <li key={i}>{obs}</li>
                  ))}
                </ul>
              </div>

              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                  Action Recommendations
                </h4>
                <div className="grid gap-2">
                  {generatedReport.suggestedActions.map((act, i) => (
                    <div
                      key={i}
                      className="flex items-start gap-2 rounded-lg bg-card border border-border p-2.5 text-xs"
                    >
                      <Badge variant="outline" className="text-[10px] uppercase">
                        {act.priority}
                      </Badge>
                      <div>
                        <span className="font-medium text-foreground">{act.action}</span>
                        <span className="text-muted-foreground block text-[11px]">
                          Responsible Role: {act.responsibleRole}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
