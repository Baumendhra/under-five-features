import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useState, useId } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  institutionalIntelligenceQueryOptions,
  askInstitutionalAssistant,
  generateInstitutionalReportFn,
  submitInsightFeedbackFn,
  type InstitutionalIntelligenceDashboardData,
} from "@/lib/institutional-intelligence.functions";
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
  Search,
  ExternalLink,
  Printer,
  Copy,
  ChevronRight,
  TrendingUp,
} from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/intelligence")({
  component: IntelligenceHubPage,
});

const SUGGESTED_QUESTIONS = [
  "How many student records need correction?",
  "Which programmes have the lowest capacity utilization?",
  "How many APAAR verifications are pending?",
  "What are the most frequent data-quality issues?",
  "Which duplicate cases require urgent review?",
  "What are our primary operational risks and bottlenecks?",
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

export function IntelligenceHubPage() {
  const queryClient = useQueryClient();
  const { data, isLoading, isError, refetch } = useQuery(institutionalIntelligenceQueryOptions);

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

  // Server function wrappers
  const askFn = useServerFn(askInstitutionalAssistant);
  const reportFn = useServerFn(generateInstitutionalReportFn);
  const feedbackFn = useServerFn(submitInsightFeedbackFn);

  // Handlers
  async function handleAskAssistant(qToAsk?: string) {
    const q = (qToAsk ?? question).trim();
    if (!q) return;

    const userMsgId = `usr-${Date.now()}`;
    setChatMessages((prev) => [...prev, { id: userMsgId, role: "user", text: q }]);
    setQuestion("");
    setIsAsking(true);

    try {
      const result = await askFn({ data: { question: q } });
      const asstMsgId = `ast-${Date.now()}`;
      setChatMessages((prev) => [...prev, { id: asstMsgId, role: "assistant", response: result }]);
    } catch (err) {
      toast.error("Failed to query Assistant. Please try again.");
    } finally {
      setIsAsking(false);
    }
  }

  async function handleGenerateReport() {
    setIsGeneratingReport(true);
    try {
      const rep = await reportFn({
        data: {
          reportType: selectedReportType,
          reportingPeriod,
        },
      });
      setGeneratedReport(rep);
      toast.success("Institutional report compiled successfully!");
    } catch {
      toast.error("Failed to generate report.");
    } finally {
      setIsGeneratingReport(false);
    }
  }

  async function handleFeedback(insightId: string, type: "helpful" | "inaccurate") {
    try {
      await feedbackFn({
        data: {
          insightId,
          feedbackType: type,
        },
      });
      setFeedbackRecorded((prev) => ({ ...prev, [insightId]: type }));
      toast.success(
        type === "helpful" ? "Marked as helpful" : "Feedback recorded for model tuning",
      );
    } catch {
      toast.error("Could not record feedback.");
    }
  }

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
        <RefreshCw className="h-8 w-8 animate-spin text-primary" />
        <p className="text-sm font-medium text-muted-foreground">
          Synthesizing multi-sprint institutional intelligence...
        </p>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center space-y-4">
        <AlertOctagon className="h-10 w-10 text-destructive" />
        <h2 className="text-lg font-semibold text-foreground">
          Unable to Load Institutional Intelligence
        </h2>
        <p className="text-sm text-muted-foreground">
          An error occurred while evaluating registry data.
        </p>
        <Button onClick={() => refetch()}>Try Again</Button>
      </div>
    );
  }

  const { metrics, aiInsights, providerStatus, isGeminiConfigured } = data;

  return (
    <div className="space-y-8 pb-16">
      {/* ── Header & Status Bar ────────────────────────────────────────── */}
      <div className="flex flex-col justify-between gap-4 border-b border-border pb-6 sm:flex-row sm:items-center">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Institutional Intelligence Hub
            </h1>
            <Badge
              variant={providerStatus === "gemini" ? "default" : "secondary"}
              className="flex items-center gap-1.5 px-2.5 py-0.5 text-xs font-semibold"
            >
              {providerStatus === "gemini" ? (
                <>
                  <Sparkles className="h-3 w-3 text-emerald-400" />
                  Gemini AI (Connected)
                </>
              ) : (
                <>
                  <Bot className="h-3 w-3 text-blue-500" />
                  Rule-Based Engine (Active)
                </>
              )}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Correlated AI decision support unifying Data Quality, Corrections, Identity Resolution,
            APAAR Orchestration & Capacity Intelligence for{" "}
            <span className="font-medium text-foreground">{metrics.institutionName}</span>.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
              toast.success("Intelligence telemetry refreshed.");
            }}
            className="flex items-center gap-1.5"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            Refresh Analysis
          </Button>
        </div>
      </div>

      {/* ── Section A: Executive Overview KPIs ─────────────────────────── */}
      <div>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-muted-foreground">
          Institutional Performance Summary
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {/* 1. Total Students */}
          <Card className="rounded-xl border border-border bg-card shadow-xs">
            <CardHeader className="p-3 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Students</p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold text-foreground">
                {metrics.registryHealth.totalStudents}
              </p>
              <p className="text-[11px] text-muted-foreground">Active registry</p>
            </CardContent>
          </Card>

          {/* 2. Data Quality Score */}
          <Card className="rounded-xl border border-border bg-card shadow-xs">
            <CardHeader className="p-3 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Quality Score</p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <div className="flex items-baseline gap-1">
                <p className="text-xl font-bold text-foreground">
                  {metrics.registryHealth.averageQualityScore}
                </p>
                <span className="text-[10px] text-muted-foreground">/100</span>
              </div>
              <Badge
                variant="outline"
                className={`mt-1 text-[10px] ${
                  metrics.registryHealth.averageQualityScore >= 80
                    ? "border-emerald-500/30 text-emerald-600 bg-emerald-50/50"
                    : "border-amber-500/30 text-amber-600 bg-amber-50/50"
                }`}
              >
                {metrics.registryHealth.averageQualityScore >= 80 ? "Healthy" : "Needs Review"}
              </Badge>
            </CardContent>
          </Card>

          {/* 3. Attention Needed */}
          <Card className="rounded-xl border border-border bg-card shadow-xs">
            <CardHeader className="p-3 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Defect Records</p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold text-amber-600">
                {metrics.registryHealth.attentionNeededCount}
              </p>
              <p className="text-[11px] text-muted-foreground">Require attention</p>
            </CardContent>
          </Card>

          {/* 4. Correction Backlog */}
          <Card className="rounded-xl border border-border bg-card shadow-xs">
            <CardHeader className="p-3 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Corrections</p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold text-foreground">
                {metrics.corrections.pendingCount}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {metrics.corrections.slaOverdueCount > 0 ? (
                  <span className="font-medium text-destructive">
                    {metrics.corrections.slaOverdueCount} SLA overdue
                  </span>
                ) : (
                  "All within SLA"
                )}
              </p>
            </CardContent>
          </Card>

          {/* 5. Duplicate Candidates */}
          <Card className="rounded-xl border border-border bg-card shadow-xs">
            <CardHeader className="p-3 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Duplicates</p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold text-foreground">
                {metrics.identity.highConfidenceMatches}
              </p>
              <p className="text-[11px] text-muted-foreground">
                {metrics.identity.identifierCollisions > 0 ? (
                  <span className="font-semibold text-destructive">
                    {metrics.identity.identifierCollisions} Collisions!
                  </span>
                ) : (
                  "0 Collisions"
                )}
              </p>
            </CardContent>
          </Card>

          {/* 6. APAAR Coverage */}
          <Card className="rounded-xl border border-border bg-card shadow-xs">
            <CardHeader className="p-3 pb-1">
              <p className="text-xs font-medium text-muted-foreground">APAAR Verified</p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold text-foreground">
                {metrics.apaar.coveragePercentage}%
              </p>
              <p className="text-[11px] text-muted-foreground">
                {metrics.apaar.officiallyVerifiedCount}/{metrics.registryHealth.totalStudents}{" "}
                verified
              </p>
            </CardContent>
          </Card>

          {/* 7. Intake Utilization */}
          <Card className="rounded-xl border border-border bg-card shadow-xs">
            <CardHeader className="p-3 pb-1">
              <p className="text-xs font-medium text-muted-foreground">Capacity Use</p>
            </CardHeader>
            <CardContent className="p-3 pt-0">
              <p className="text-xl font-bold text-foreground">
                {metrics.intake.overallCapacityUtilizationPct}%
              </p>
              <p className="text-[11px] text-muted-foreground">
                {metrics.intake.actualRegularAdmissions}/{metrics.intake.approvedCapacityTotal}{" "}
                seats
              </p>
            </CardContent>
          </Card>
        </div>
      </div>

      {/* ── Section B: AI Executive Insights ───────────────────────────── */}
      <div className="rounded-2xl border border-border bg-gradient-to-br from-card via-card to-accent/20 p-6 shadow-sm">
        <div className="flex flex-col justify-between gap-2 border-b border-border/60 pb-4 sm:flex-row sm:items-center">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground">
                AI Executive Intelligence Synthesis
              </h3>
              <p className="text-xs text-muted-foreground">
                Generated via {aiInsights.modelUsed} • Strictly grounded in verified registry
                metrics
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleFeedback("exec-summary", "helpful")}
              className={`h-7 px-2 text-xs ${
                feedbackRecorded["exec-summary"] === "helpful" ? "text-primary font-bold" : ""
              }`}
            >
              <ThumbsUp className="mr-1 h-3.5 w-3.5" />
              Helpful
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleFeedback("exec-summary", "inaccurate")}
              className={`h-7 px-2 text-xs ${
                feedbackRecorded["exec-summary"] === "inaccurate"
                  ? "text-destructive font-bold"
                  : ""
              }`}
            >
              <ThumbsDown className="mr-1 h-3.5 w-3.5" />
              Inaccurate
            </Button>
          </div>
        </div>

        <div className="mt-4 space-y-4">
          <p className="text-sm leading-relaxed text-foreground/90 font-medium">
            {aiInsights.summary}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            {aiInsights.keyObservations.map((obs, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2.5 rounded-xl border border-border/50 bg-background/60 p-3"
              >
                <ChevronRight className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                <span className="text-xs leading-normal text-foreground">{obs}</span>
              </div>
            ))}
          </div>

          {aiInsights.limitations && (
            <p className="text-[11px] italic text-muted-foreground">
              Note: {aiInsights.limitations}
            </p>
          )}
        </div>
      </div>

      {/* ── Section C: Natural-Language Institutional Assistant ─────────── */}
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2 space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-5 w-5 text-primary" />
              <h3 className="text-base font-semibold text-foreground">
                Institutional Decision Assistant
              </h3>
            </div>
            <span className="text-xs text-muted-foreground">Read-only • Strict privacy</span>
          </div>

          {/* Quick Prompts */}
          <div className="flex flex-wrap gap-1.5">
            {SUGGESTED_QUESTIONS.map((q, idx) => (
              <button
                key={idx}
                onClick={() => handleAskAssistant(q)}
                disabled={isAsking}
                className="rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/50 hover:bg-accent hover:text-foreground disabled:opacity-50"
              >
                {q}
              </button>
            ))}
          </div>

          {/* Assistant Chat Stream */}
          <div className="min-h-[280px] max-h-[480px] overflow-y-auto rounded-xl border border-border bg-card p-4 space-y-4">
            {chatMessages.length === 0 ? (
              <div className="flex min-h-[220px] flex-col items-center justify-center text-center">
                <Bot className="h-10 w-10 text-muted-foreground/40 mb-2" />
                <p className="text-sm font-medium text-foreground">
                  Ask any question about your institution's registry
                </p>
                <p className="text-xs text-muted-foreground max-w-sm mt-1">
                  Query student data quality, APAAR verification queues, capacity utilization, and
                  unresolved discrepancies.
                </p>
              </div>
            ) : (
              chatMessages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}
                >
                  {msg.role === "user" ? (
                    <div className="max-w-[85%] rounded-2xl bg-primary px-4 py-2.5 text-xs text-primary-foreground shadow-xs">
                      {msg.text}
                    </div>
                  ) : (
                    <div className="max-w-[95%] space-y-3 rounded-2xl border border-border bg-accent/30 p-4 text-xs shadow-xs">
                      <div className="flex items-center justify-between border-b border-border/40 pb-2">
                        <span className="font-semibold text-foreground flex items-center gap-1.5">
                          <Sparkles className="h-3.5 w-3.5 text-primary" />
                          EduTrace Intelligence
                        </span>
                        <Badge variant="outline" className="text-[10px]">
                          {msg.response?.provider === "gemini" ? "Gemini AI" : "Rule-Based"}
                        </Badge>
                      </div>

                      <p className="text-xs leading-relaxed text-foreground">
                        {msg.response?.summary}
                      </p>

                      {msg.response?.keyObservations && msg.response.keyObservations.length > 0 && (
                        <div className="space-y-1 rounded-lg bg-background/80 p-2.5 border border-border/40">
                          <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                            Key Findings:
                          </p>
                          <ul className="list-inside list-disc space-y-0.5 text-[11px] text-foreground">
                            {msg.response.keyObservations.map((o, i) => (
                              <li key={i}>{o}</li>
                            ))}
                          </ul>
                        </div>
                      )}

                      {msg.response?.suggestedActions &&
                        msg.response.suggestedActions.length > 0 && (
                          <div className="space-y-1.5 pt-1">
                            <p className="text-[11px] font-semibold text-muted-foreground uppercase">
                              Recommended Action:
                            </p>
                            {msg.response.suggestedActions.map((act, i) => (
                              <div
                                key={i}
                                className="flex items-center justify-between rounded-lg border border-border/60 bg-card p-2"
                              >
                                <span className="text-[11px] font-medium text-foreground">
                                  {act.action}
                                </span>
                                <Badge variant="outline" className="text-[10px]">
                                  {act.responsibleRole}
                                </Badge>
                              </div>
                            ))}
                          </div>
                        )}
                    </div>
                  )}
                </div>
              ))
            )}
            {isAsking && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground p-2">
                <RefreshCw className="h-3.5 w-3.5 animate-spin text-primary" />
                Analyzing registry metrics & compiling grounded response...
              </div>
            )}
          </div>

          {/* Question Input */}
          <div className="flex gap-2">
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder="e.g. Which programmes have the lowest capacity utilization?"
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleAskAssistant();
                }
              }}
              disabled={isAsking}
              className="rounded-xl bg-card text-xs"
            />
            <Button
              onClick={() => handleAskAssistant()}
              disabled={isAsking || !question.trim()}
              className="rounded-xl px-4 text-xs font-semibold"
            >
              Ask
            </Button>
          </div>
        </div>

        {/* ── Section D: Priority Action Centre ─────────────────────────── */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="text-base font-semibold text-foreground">Priority Action Centre</h3>
            </div>
            <Badge variant="outline" className="text-xs">
              {metrics.operationalPriorities.length} Active
            </Badge>
          </div>

          <div className="max-h-[480px] overflow-y-auto space-y-3 rounded-xl border border-border bg-card p-3">
            {metrics.operationalPriorities.length === 0 ? (
              <div className="p-6 text-center text-xs text-muted-foreground">
                <CheckCircle2 className="mx-auto h-8 w-8 text-emerald-500 mb-1" />
                No critical or high-priority operational bottlenecks detected.
              </div>
            ) : (
              metrics.operationalPriorities.map((item) => (
                <div
                  key={item.id}
                  className={`rounded-xl border p-3.5 space-y-2 transition-all ${
                    item.category === "CRITICAL"
                      ? "border-destructive/40 bg-destructive/5"
                      : item.category === "HIGH"
                        ? "border-amber-500/40 bg-amber-500/5"
                        : "border-border bg-background"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <Badge
                      variant={
                        item.category === "CRITICAL"
                          ? "destructive"
                          : item.category === "HIGH"
                            ? "default"
                            : "outline"
                      }
                      className="text-[10px] font-bold"
                    >
                      {item.category}
                    </Badge>
                    <span className="text-[10px] font-medium text-muted-foreground uppercase">
                      {item.responsibleRole.replace("_", " ")}
                    </span>
                  </div>

                  <p className="text-xs font-semibold text-foreground">{item.title}</p>
                  <p className="text-[11px] leading-relaxed text-muted-foreground">
                    {item.rationale}
                  </p>

                  <div className="pt-1 flex items-center justify-between">
                    <span className="text-[10px] font-medium text-primary">
                      Action: {item.suggestedAction}
                    </span>
                    <Button
                      asChild
                      variant="ghost"
                      size="sm"
                      className="h-6 px-2 text-[11px] font-semibold text-foreground hover:text-primary"
                    >
                      <Link to={item.routeLink}>
                        Open <ArrowRight className="ml-1 h-3 w-3" />
                      </Link>
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* ── Section E: Institutional Report Centre ─────────────────────── */}
      <div className="rounded-2xl border border-border bg-card p-6 shadow-xs space-y-6">
        <div className="flex flex-col justify-between gap-4 border-b border-border pb-4 sm:flex-row sm:items-center">
          <div>
            <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
              <FileText className="h-5 w-5 text-primary" />
              Institutional Report Centre
            </h3>
            <p className="text-xs text-muted-foreground">
              Generate official, evidence-grounded reports for academic council and statutory
              submissions.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedReportType}
              onChange={(e) => setSelectedReportType(e.target.value as InstitutionalReportType)}
              className="rounded-xl border border-border bg-background px-3 py-1.5 text-xs text-foreground"
            >
              {Object.entries(REPORT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>

            <Input
              value={reportingPeriod}
              onChange={(e) => setReportingPeriod(e.target.value)}
              placeholder="Reporting Period"
              className="w-44 rounded-xl text-xs h-8"
            />

            <Button
              onClick={handleGenerateReport}
              disabled={isGeneratingReport}
              size="sm"
              className="rounded-xl text-xs font-semibold"
            >
              {isGeneratingReport ? (
                <>
                  <RefreshCw className="mr-1.5 h-3.5 w-3.5 animate-spin" />
                  Compiling...
                </>
              ) : (
                "Generate Report"
              )}
            </Button>
          </div>
        </div>

        {/* Generated Report Display */}
        {generatedReport ? (
          <div className="rounded-xl border border-border bg-background p-6 space-y-4 shadow-xs">
            <div className="flex flex-col justify-between gap-2 border-b border-border pb-4 sm:flex-row sm:items-center">
              <div>
                <h4 className="text-base font-bold text-foreground">
                  {REPORT_TYPE_LABELS[selectedReportType]}
                </h4>
                <p className="text-xs text-muted-foreground">
                  {metrics.institutionName} • Period: {reportingPeriod} • Generated:{" "}
                  {new Date(generatedReport.generatedAt).toLocaleString()}
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    navigator.clipboard.writeText(
                      `# ${REPORT_TYPE_LABELS[selectedReportType]}\n` +
                        `Institution: ${metrics.institutionName}\n` +
                        `Period: ${reportingPeriod}\n\n` +
                        `## Executive Summary\n${generatedReport.summary}\n\n` +
                        `## Observations\n${generatedReport.keyObservations.map((o) => `- ${o}`).join("\n")}`,
                    );
                    toast.success("Report copied to clipboard in Markdown format!");
                  }}
                  className="h-8 text-xs flex items-center gap-1"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Copy Markdown
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => window.print()}
                  className="h-8 text-xs flex items-center gap-1"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print View
                </Button>
              </div>
            </div>

            <div className="space-y-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                  Executive Narrative
                </p>
                <p className="text-xs leading-relaxed text-foreground bg-accent/20 rounded-xl p-3 border border-border/50">
                  {generatedReport.summary}
                </p>
              </div>

              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Detailed Observations & Telemetry
                </p>
                <ul className="grid gap-2 sm:grid-cols-2">
                  {generatedReport.keyObservations.map((obs, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-border/40 bg-card p-2.5 text-xs text-foreground flex items-start gap-2"
                    >
                      <ChevronRight className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                      <span>{obs}</span>
                    </li>
                  ))}
                </ul>
              </div>

              {generatedReport.suggestedActions.length > 0 && (
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Actionable Recommendations
                  </p>
                  <div className="space-y-1.5">
                    {generatedReport.suggestedActions.map((act, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between rounded-lg border border-border bg-card p-2.5 text-xs"
                      >
                        <span className="font-medium text-foreground">{act.action}</span>
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-[10px]">
                            {act.priority}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground">
                            {act.responsibleRole}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {generatedReport.limitations && (
                <p className="text-[11px] italic text-muted-foreground border-t border-border pt-3">
                  Methodology & Limitations: {generatedReport.limitations}
                </p>
              )}
            </div>
          </div>
        ) : (
          <div className="flex min-h-[160px] flex-col items-center justify-center rounded-xl border border-dashed border-border p-6 text-center">
            <FileText className="h-8 w-8 text-muted-foreground/40 mb-1" />
            <p className="text-xs font-medium text-foreground">No Report Generated Yet</p>
            <p className="text-[11px] text-muted-foreground">
              Select a report type and period above and click "Generate Report".
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
