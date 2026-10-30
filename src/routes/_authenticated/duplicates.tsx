import { createFileRoute, Link } from "@tanstack/react-router";
import { useSuspenseQuery, useQueryClient, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { toast } from "sonner";
import {
  duplicateCasesQueryOptions,
  duplicateAnalyticsQueryOptions,
  resolveDuplicateCase,
  createDuplicateCase,
  type DuplicateCase,
} from "@/lib/edutrace.functions";
import { studentsQueryOptions } from "@/lib/students.functions";
import {
  generateCandidatePairs,
  clusterDuplicateCandidates,
  maskSensitiveValue,
  type StudentIdentityRecord,
  type ScoredDuplicatePair,
  type DuplicateCluster,
  type ConfidenceCategory,
} from "@/lib/identity-resolution";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Users,
  Layers,
  ShieldAlert,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  HelpCircle,
  ArrowRight,
  Search,
  Clock,
  FileCheck,
  Send,
  Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/_authenticated/duplicates")({
  head: () => ({
    meta: [
      { title: "Identity Resolution & Duplicate Review — EduTrace" },
      {
        name: "description",
        content:
          "Advanced identity resolution, candidate blocking, and explainable duplicate management.",
      },
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

const CONFIDENCE_CONFIG: Record<
  ConfidenceCategory,
  { label: string; badgeBg: string; badgeText: string; border: string }
> = {
  HIGH_CONFIDENCE: {
    label: "High Confidence Match",
    badgeBg: "bg-rose-100 dark:bg-rose-950/40",
    badgeText: "text-rose-800 dark:text-rose-300",
    border: "border-rose-300 dark:border-rose-800",
  },
  REVIEW_RECOMMENDED: {
    label: "Review Recommended",
    badgeBg: "bg-amber-100 dark:bg-amber-950/40",
    badgeText: "text-amber-800 dark:text-amber-300",
    border: "border-amber-300 dark:border-amber-800",
  },
  LOW_CONFIDENCE: {
    label: "Low Confidence Candidate",
    badgeBg: "bg-blue-100 dark:bg-blue-950/40",
    badgeText: "text-blue-800 dark:text-blue-300",
    border: "border-blue-300 dark:border-blue-800",
  },
  NO_MATCH: {
    label: "No Significant Match",
    badgeBg: "bg-muted",
    badgeText: "text-muted-foreground",
    border: "border-border",
  },
};

const STATUS_BADGE: Record<string, string> = {
  open: "bg-rose-100 text-rose-800 dark:bg-rose-900/30 dark:text-rose-400",
  under_review: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  resolved: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  confirmed: "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400",
  dismissed: "bg-muted text-muted-foreground",
};

function DuplicatesPage() {
  const { data: cases } = useSuspenseQuery(duplicateCasesQueryOptions);
  const { data: students } = useSuspenseQuery(studentsQueryOptions);
  const { data: analytics } = useQuery(duplicateAnalyticsQueryOptions);
  const queryClient = useQueryClient();

  const resolveFn = useServerFn(resolveDuplicateCase);
  const createCaseFn = useServerFn(createDuplicateCase);

  // Filter and search state
  const [activeTab, setActiveTab] = useState<"candidates" | "clusters" | "cases" | "analytics">(
    "candidates",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [confidenceFilter, setConfidenceFilter] = useState<string>("all");
  const [selectedPair, setSelectedPair] = useState<ScoredDuplicatePair | null>(null);

  // Review modal state
  const [reviewNote, setReviewNote] = useState("");
  const [reviewAction, setReviewAction] = useState<
    "confirm_duplicate" | "not_duplicate" | "needs_information" | "escalate"
  >("confirm_duplicate");
  const [isSubmitting, setIsSubmitting] = useState(false);

  // 1. Map students to identity records
  const identityRecords: StudentIdentityRecord[] = useMemo(
    () =>
      students.map((s) => ({
        id: s.id,
        studentId: s.student_id,
        apaarId: s.apaar_id,
        name: s.name,
        dob: s.dob,
        gender: s.gender,
        contact: s.contact,
        category: s.category,
        programmeCode: s.programme_code,
        admissionYear: s.admission_year,
        institutionId: s.institution_id,
      })),
    [students],
  );

  // 2. Multi-Pass Candidate Generation & Blocking
  const candidates = useMemo(() => generateCandidatePairs(identityRecords), [identityRecords]);

  // 3. Duplicate Candidate Clustering (Connected Components)
  const clusters = useMemo(() => clusterDuplicateCandidates(candidates), [candidates]);

  // Filtered candidate list
  const filteredCandidates = useMemo(() => {
    return candidates.filter((c) => {
      // Confidence filter
      if (confidenceFilter === "high" && c.match.confidence !== "HIGH_CONFIDENCE") return false;
      if (confidenceFilter === "review" && c.match.confidence !== "REVIEW_RECOMMENDED")
        return false;
      if (confidenceFilter === "low" && c.match.confidence !== "LOW_CONFIDENCE") return false;
      if (confidenceFilter === "collision" && !c.match.isExactCollision) return false;

      // Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchA =
          c.studentA.name.toLowerCase().includes(q) ||
          c.studentA.apaarId?.toLowerCase().includes(q) ||
          c.studentA.studentId?.toLowerCase().includes(q);
        const matchB =
          c.studentB.name.toLowerCase().includes(q) ||
          c.studentB.apaarId?.toLowerCase().includes(q) ||
          c.studentB.studentId?.toLowerCase().includes(q);
        if (!matchA && !matchB) return false;
      }

      return true;
    });
  }, [candidates, confidenceFilter, searchQuery]);

  // Handle controlled reviewer actions
  async function handleExecuteReview() {
    if (!selectedPair) return;
    if (reviewNote.trim().length < 5) {
      toast.error("Please provide an explainable justification note (at least 5 characters).");
      return;
    }

    setIsSubmitting(true);
    try {
      // Find existing case or create one first
      const existing = cases.find(
        (c) =>
          c.student_ids.includes(selectedPair.studentA.id) &&
          c.student_ids.includes(selectedPair.studentB.id),
      );

      let caseId = existing?.id;

      if (!caseId) {
        const created = await createCaseFn({
          data: {
            studentIds: [selectedPair.studentA.id, selectedPair.studentB.id],
            reason: selectedPair.match.isExactCollision
              ? "apaar_duplicate"
              : selectedPair.match.confidence === "HIGH_CONFIDENCE"
                ? "name_dob_match"
                : "fuzzy_name_match",
            matchScore: selectedPair.match.percentage,
            confidence: selectedPair.match.confidence,
            matchDetails: {
              matching: selectedPair.match.matchingAttributes,
              conflicts: selectedPair.match.conflictingAttributes,
            },
            initialNotes: reviewNote,
          },
        });
        caseId = (created.case as { id?: string } | null)?.id;
      }

      if (caseId) {
        await resolveFn({
          data: {
            caseId,
            status:
              reviewAction === "confirm_duplicate"
                ? "resolved"
                : reviewAction === "not_duplicate"
                  ? "dismissed"
                  : "under_review",
            resolution: reviewNote,
            actionType: reviewAction,
            finalise: reviewAction === "confirm_duplicate" || reviewAction === "not_duplicate",
          },
        });
      }

      toast.success(
        reviewAction === "confirm_duplicate"
          ? "Duplicate relationship confirmed and audited. Original records preserved."
          : reviewAction === "not_duplicate"
            ? "Candidate dismissed as distinct students."
            : reviewAction === "needs_information"
              ? "Marked as requiring verification documents."
              : "Case escalated for supervisory review.",
      );

      await queryClient.invalidateQueries({ queryKey: ["duplicate-cases"] });
      await queryClient.invalidateQueries({ queryKey: ["duplicate-analytics"] });
      setSelectedPair(null);
      setReviewNote("");
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : "Failed to submit review resolution.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const openCases = cases.filter((c) => c.status === "open" || c.status === "under_review");
  const closedCases = cases.filter((c) => c.status === "resolved" || c.status === "dismissed");

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight text-foreground">
              Identity Resolution & Duplicate Review
            </h1>
            <Badge variant="outline" className="border-primary/40 text-xs text-primary">
              Sprint 3 Engine
            </Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-pass candidate blocking, explainable composite similarity scoring, and candidate
            clustering.
          </p>
        </div>
        <div className="flex gap-2">
          <Button asChild variant="outline">
            <Link to="/students">Student Registry</Link>
          </Button>
          <Button asChild>
            <Link to="/corrections">Correction Centre</Link>
          </Button>
        </div>
      </div>

      {/* Operational KPI Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Candidate Pairs</span>
            <Users className="h-5 w-5 text-blue-500" />
          </div>
          <p className="mt-2 font-display text-3xl text-foreground">{candidates.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            From {students.length} students via multi-pass blocking
          </p>
        </div>

        <div className="rounded-xl border border-rose-300/40 bg-card p-5 dark:border-rose-900/30">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">High Confidence Matches</span>
            <ShieldAlert className="h-5 w-5 text-rose-500" />
          </div>
          <p className="mt-2 font-display text-3xl text-rose-600 dark:text-rose-400">
            {candidates.filter((c) => c.match.confidence === "HIGH_CONFIDENCE").length}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Exact APAAR or name + DOB coincidence
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Candidate Clusters</span>
            <Layers className="h-5 w-5 text-purple-500" />
          </div>
          <p className="mt-2 font-display text-3xl text-foreground">{clusters.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Interconnected student duplicate groups
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-5">
          <div className="flex items-center justify-between text-muted-foreground">
            <span className="text-sm font-medium">Open Case Triage</span>
            <Clock className="h-5 w-5 text-amber-500" />
          </div>
          <p className="mt-2 font-display text-3xl text-foreground">{openCases.length}</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {closedCases.length} historically resolved/dismissed
          </p>
        </div>
      </div>

      {/* Main Tabs Navigation */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as "candidates" | "clusters" | "cases" | "analytics")}
        className="space-y-4"
      >
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
          <TabsList className="bg-muted">
            <TabsTrigger value="candidates" className="gap-2 text-xs">
              <Users className="h-3.5 w-3.5" /> Candidate Pairs ({filteredCandidates.length})
            </TabsTrigger>
            <TabsTrigger value="clusters" className="gap-2 text-xs">
              <Layers className="h-3.5 w-3.5" /> Duplicate Clusters ({clusters.length})
            </TabsTrigger>
            <TabsTrigger value="cases" className="gap-2 text-xs">
              <FileCheck className="h-3.5 w-3.5" /> Saved Cases ({cases.length})
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2 text-xs">
              <Clock className="h-3.5 w-3.5" /> Resolution Analytics
            </TabsTrigger>
          </TabsList>

          {activeTab === "candidates" && (
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative w-56">
                <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search candidate name, ID…"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="h-8 pl-8 text-xs"
                />
              </div>
              <Select value={confidenceFilter} onValueChange={setConfidenceFilter}>
                <SelectTrigger className="h-8 w-44 text-xs">
                  <SelectValue placeholder="Filter Confidence" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Confidences</SelectItem>
                  <SelectItem value="high">High Confidence (≥85%)</SelectItem>
                  <SelectItem value="review">Review Recommended</SelectItem>
                  <SelectItem value="low">Low Confidence Candidate</SelectItem>
                  <SelectItem value="collision">Identifier Collisions</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* ── TAB 1: CANDIDATE PAIRS ────────────────────────────────────────── */}
        <TabsContent value="candidates" className="space-y-3">
          {filteredCandidates.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
              ✓ No duplicate candidate pairs matching your active filters.
            </div>
          ) : (
            <div className="grid gap-3">
              {filteredCandidates.map((pair) => {
                const confConfig = CONFIDENCE_CONFIG[pair.match.confidence];
                return (
                  <div
                    key={pair.id}
                    className={cn(
                      "rounded-xl border p-4 transition-all hover:shadow-sm bg-card",
                      pair.match.isExactCollision
                        ? "border-amber-400 bg-amber-50/20 dark:bg-amber-950/10"
                        : confConfig.border,
                    )}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border/60 pb-3">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "text-xs font-semibold",
                            confConfig.badgeBg,
                            confConfig.badgeText,
                          )}
                        >
                          {pair.match.percentage}% match · {confConfig.label}
                        </Badge>
                        {pair.match.isExactCollision && (
                          <Badge variant="destructive" className="text-xs gap-1">
                            <AlertTriangle className="h-3 w-3" /> Identifier Collision Alert
                          </Badge>
                        )}
                        <span className="text-xs text-muted-foreground">
                          Blocking:{" "}
                          <span className="font-mono text-[11px]">{pair.blockingKey}</span>
                        </span>
                      </div>
                      <Button
                        size="sm"
                        variant="default"
                        className="h-8 gap-1.5 text-xs"
                        onClick={() => setSelectedPair(pair)}
                      >
                        <Eye className="h-3.5 w-3.5" /> Deep Review &amp; Resolve
                      </Button>
                    </div>

                    <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                      {pair.match.explanation}
                    </p>

                    {/* Side-by-side snapshot */}
                    <div className="mt-3 grid gap-3 sm:grid-cols-2">
                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground">
                            {pair.studentA.name}
                          </p>
                          <Badge variant="outline" className="text-[10px]">
                            {pair.studentA.programmeCode ?? "—"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          DOB: {pair.studentA.dob ?? "Missing"} · APAAR:{" "}
                          {maskSensitiveValue(pair.studentA.apaarId, "apaar")}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Roll: {pair.studentA.studentId ?? "—"} · Contact:{" "}
                          {maskSensitiveValue(pair.studentA.contact, "contact")}
                        </p>
                      </div>

                      <div className="rounded-lg border border-border bg-muted/20 p-3">
                        <div className="flex items-center justify-between">
                          <p className="text-xs font-semibold text-foreground">
                            {pair.studentB.name}
                          </p>
                          <Badge variant="outline" className="text-[10px]">
                            {pair.studentB.programmeCode ?? "—"}
                          </Badge>
                        </div>
                        <p className="mt-1 text-[11px] text-muted-foreground">
                          DOB: {pair.studentB.dob ?? "Missing"} · APAAR:{" "}
                          {maskSensitiveValue(pair.studentB.apaarId, "apaar")}
                        </p>
                        <p className="text-[11px] text-muted-foreground">
                          Roll: {pair.studentB.studentId ?? "—"} · Contact:{" "}
                          {maskSensitiveValue(pair.studentB.contact, "contact")}
                        </p>
                      </div>
                    </div>

                    {/* Highlighted attributes pill row */}
                    <div className="mt-3 flex flex-wrap gap-1.5 pt-2 border-t border-border/40">
                      {pair.match.matchingAttributes.map((m, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                        >
                          ✓ {m}
                        </span>
                      ))}
                      {pair.match.conflictingAttributes.map((c, idx) => (
                        <span
                          key={idx}
                          className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-medium text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                        >
                          ✕ {c}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* ── TAB 2: CANDIDATE CLUSTERS ─────────────────────────────────────── */}
        <TabsContent value="clusters" className="space-y-4">
          <div className="rounded-lg border border-border bg-muted/20 p-4 text-xs text-muted-foreground">
            <p className="font-semibold text-foreground mb-1">
              Transitive Duplicate Clustering (Disjoint-Set Union)
            </p>
            Connected components link student records where Student A ↔ Student B and Student B ↔
            Student C. Each cluster presents an aggregated investigation group while preserving
            individual pair-level evidence.
          </div>

          {clusters.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
              ✓ No multi-record duplicate clusters detected.
            </div>
          ) : (
            <div className="grid gap-4">
              {clusters.map((cluster) => (
                <div
                  key={cluster.clusterId}
                  className="rounded-xl border border-border bg-card p-5 space-y-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <Layers className="h-4 w-4 text-purple-500" />
                      <span className="font-mono text-sm font-bold text-foreground">
                        {cluster.clusterId}
                      </span>
                      <Badge variant="outline" className="text-xs">
                        {cluster.clusterSize} interconnected students
                      </Badge>
                      <Badge
                        variant="secondary"
                        className={cn(
                          "text-xs",
                          CONFIDENCE_CONFIG[cluster.highestConfidence].badgeText,
                        )}
                      >
                        {CONFIDENCE_CONFIG[cluster.highestConfidence].label}
                      </Badge>
                    </div>
                    <span className="text-xs text-muted-foreground">
                      {cluster.pairs.length} candidate pair edge
                      {cluster.pairs.length !== 1 ? "s" : ""}
                    </span>
                  </div>

                  <p className="text-xs text-muted-foreground">{cluster.summary}</p>

                  <div className="grid gap-2 sm:grid-cols-3">
                    {cluster.records.map((member) => (
                      <div
                        key={member.id}
                        className="rounded-lg border border-border bg-muted/30 p-2.5 text-xs space-y-0.5"
                      >
                        <p className="font-semibold text-foreground truncate">{member.name}</p>
                        <p className="text-muted-foreground font-mono text-[11px]">
                          APAAR: {maskSensitiveValue(member.apaarId, "apaar")}
                        </p>
                        <p className="text-muted-foreground text-[11px]">
                          DOB: {member.dob ?? "Missing"} · Prog: {member.programmeCode ?? "—"}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── TAB 3: SAVED DATABASE CASES ───────────────────────────────────── */}
        <TabsContent value="cases" className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg text-foreground">Persistent Audit Cases</h2>
            <Badge variant="outline" className="text-xs">
              {cases.length} recorded
            </Badge>
          </div>

          {cases.length === 0 ? (
            <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center text-sm text-muted-foreground">
              No saved duplicate investigation cases in the database.
            </div>
          ) : (
            <div className="grid gap-3">
              {cases.map((c) => (
                <div key={c.id} className="rounded-xl border border-border bg-card p-4 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <Badge className={cn("text-xs capitalize", STATUS_BADGE[c.status] ?? "")}>
                        {c.status.replace(/_/g, " ")}
                      </Badge>
                      <Badge variant="outline" className="text-xs font-mono">
                        {c.reason.replace(/_/g, " ")}
                      </Badge>
                      <span className="text-xs text-muted-foreground">
                        {new Date(c.created_at).toLocaleDateString("en-IN", {
                          dateStyle: "medium",
                        })}
                      </span>
                    </div>
                    <span className="text-xs text-muted-foreground font-mono">
                      ID: {c.id.slice(0, 8)}
                    </span>
                  </div>

                  {c.resolution && (
                    <div className="rounded-lg bg-muted/40 p-2.5 text-xs text-foreground">
                      <span className="font-semibold text-muted-foreground">Resolution Note: </span>
                      {c.resolution}
                    </div>
                  )}

                  <div className="text-[11px] text-muted-foreground">
                    Students: {c.student_ids.join(", ")}
                  </div>
                </div>
              ))}
            </div>
          )}
        </TabsContent>

        {/* ── TAB 4: RESOLUTION ANALYTICS ──────────────────────────────────── */}
        <TabsContent value="analytics" className="space-y-4">
          {analytics ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <div className="rounded-xl border border-border bg-card p-4">
                <span className="text-xs text-muted-foreground font-medium">Pending Reviews</span>
                <p className="mt-1 font-display text-2xl text-foreground">
                  {analytics.pendingCount}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Awaiting institutional action
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <span className="text-xs text-muted-foreground font-medium">Avg Review Time</span>
                <p className="mt-1 font-display text-2xl text-foreground">
                  {analytics.avgReviewTimeHours !== null
                    ? `${analytics.avgReviewTimeHours} hrs`
                    : "—"}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Based on case timestamps</p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <span className="text-xs text-muted-foreground font-medium">
                  Confirmed Duplicates
                </span>
                <p className="mt-1 font-display text-2xl text-emerald-600 dark:text-emerald-400">
                  {analytics.confirmedCount}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Logged with audit justification
                </p>
              </div>

              <div className="rounded-xl border border-border bg-card p-4">
                <span className="text-xs text-muted-foreground font-medium">
                  Dismissed / Distinct
                </span>
                <p className="mt-1 font-display text-2xl text-muted-foreground">
                  {analytics.dismissedCount}
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Marked as separate identities
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center text-xs text-muted-foreground">
              Loading analytics telemetry…
            </div>
          )}

          {analytics?.topConflictFields && analytics.topConflictFields.length > 0 && (
            <div className="rounded-xl border border-border bg-card p-5 space-y-2">
              <h3 className="font-display text-base text-foreground">
                Most Common Conflict Attributes
              </h3>
              <p className="text-xs text-muted-foreground">
                Key fields where candidate student records diverge during similarity comparison
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                {analytics.topConflictFields.map((item) => (
                  <Badge
                    key={item.field}
                    variant="secondary"
                    className="text-xs py-1 px-2.5 gap-1.5"
                  >
                    <span>{item.field}</span>
                    <span className="rounded-full bg-background px-1.5 py-0.2 text-[10px] font-bold">
                      {item.count}
                    </span>
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* ── DEEP SIDE-BY-SIDE REVIEW MODAL ───────────────────────────────────── */}
      <Dialog open={!!selectedPair} onOpenChange={(open) => !open && setSelectedPair(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          {selectedPair && (
            <>
              <DialogHeader>
                <div className="flex items-center gap-2">
                  <DialogTitle className="font-display text-xl">
                    Duplicate Pair Resolution
                  </DialogTitle>
                  <Badge
                    variant="outline"
                    className={cn(
                      "text-xs",
                      CONFIDENCE_CONFIG[selectedPair.match.confidence].badgeBg,
                      CONFIDENCE_CONFIG[selectedPair.match.confidence].badgeText,
                    )}
                  >
                    {selectedPair.match.percentage}% match ·{" "}
                    {CONFIDENCE_CONFIG[selectedPair.match.confidence].label}
                  </Badge>
                </div>
                <DialogDescription className="text-xs">
                  Inspect field-level matching scores, token similarities, and demographic
                  comparisons before recording an auditable institutional decision.
                </DialogDescription>
              </DialogHeader>

              {/* Side-by-side comparison table */}
              <div className="mt-4 rounded-xl border border-border overflow-hidden">
                <table className="w-full text-xs">
                  <thead className="bg-muted text-muted-foreground">
                    <tr>
                      <th className="p-3 text-left font-semibold w-1/4">Attribute</th>
                      <th className="p-3 text-left font-semibold w-3/8">Student A</th>
                      <th className="p-3 text-left font-semibold w-3/8">Student B</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {/* Name */}
                    <tr>
                      <td className="p-3 font-medium text-foreground bg-muted/10">Student Name</td>
                      <td className="p-3 font-semibold text-foreground">
                        {selectedPair.studentA.name}
                      </td>
                      <td className="p-3 font-semibold text-foreground">
                        {selectedPair.studentB.name}
                      </td>
                    </tr>
                    {/* Name Algorithm Breakdown */}
                    <tr className="bg-muted/5 text-[11px] text-muted-foreground">
                      <td className="p-2.5 font-mono">Algorithm Scores</td>
                      <td colSpan={2} className="p-2.5">
                        Jaro-Winkler:{" "}
                        <span className="font-bold text-foreground">
                          {selectedPair.match.fieldScores.name.jaroWinkler}
                        </span>{" "}
                        · Levenshtein:{" "}
                        <span className="font-bold text-foreground">
                          {selectedPair.match.fieldScores.name.levenshtein}
                        </span>{" "}
                        · Token Sort:{" "}
                        <span className="font-bold text-foreground">
                          {selectedPair.match.fieldScores.name.tokenSimilarity}
                        </span>{" "}
                        · Phonetic Match:{" "}
                        <span className="font-bold text-foreground">
                          {selectedPair.match.fieldScores.name.phoneticMatch ? "Yes" : "No"}
                        </span>
                      </td>
                    </tr>
                    {/* APAAR */}
                    <tr>
                      <td className="p-3 font-medium text-foreground bg-muted/10">APAAR ID</td>
                      <td className="p-3 font-mono">
                        {maskSensitiveValue(selectedPair.studentA.apaarId, "apaar")}
                      </td>
                      <td className="p-3 font-mono">
                        {maskSensitiveValue(selectedPair.studentB.apaarId, "apaar")}
                      </td>
                    </tr>
                    {/* DOB */}
                    <tr>
                      <td className="p-3 font-medium text-foreground bg-muted/10">Date of Birth</td>
                      <td className="p-3">{selectedPair.studentA.dob ?? "Missing"}</td>
                      <td className="p-3">{selectedPair.studentB.dob ?? "Missing"}</td>
                    </tr>
                    {/* Roll / Student ID */}
                    <tr>
                      <td className="p-3 font-medium text-foreground bg-muted/10">
                        Roll / Student ID
                      </td>
                      <td className="p-3 font-mono">{selectedPair.studentA.studentId ?? "—"}</td>
                      <td className="p-3 font-mono">{selectedPair.studentB.studentId ?? "—"}</td>
                    </tr>
                    {/* Contact */}
                    <tr>
                      <td className="p-3 font-medium text-foreground bg-muted/10">
                        Contact Number
                      </td>
                      <td className="p-3">
                        {maskSensitiveValue(selectedPair.studentA.contact, "contact")}
                      </td>
                      <td className="p-3">
                        {maskSensitiveValue(selectedPair.studentB.contact, "contact")}
                      </td>
                    </tr>
                    {/* Programme */}
                    <tr>
                      <td className="p-3 font-medium text-foreground bg-muted/10">Programme</td>
                      <td className="p-3">{selectedPair.studentA.programmeCode ?? "—"}</td>
                      <td className="p-3">{selectedPair.studentB.programmeCode ?? "—"}</td>
                    </tr>
                    {/* Category & Intake */}
                    <tr>
                      <td className="p-3 font-medium text-foreground bg-muted/10">
                        Category &amp; Intake
                      </td>
                      <td className="p-3">{selectedPair.studentA.category ?? "—"}</td>
                      <td className="p-3">{selectedPair.studentB.category ?? "—"}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              {/* Explainable match breakdown */}
              <div className="mt-4 rounded-xl border border-border bg-card p-4 space-y-2">
                <span className="text-xs font-semibold text-foreground">
                  Match Explanation &amp; Attribute Signals
                </span>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {selectedPair.match.explanation}
                </p>

                <div className="flex flex-wrap gap-1.5 pt-2">
                  {selectedPair.match.matchingAttributes.map((m, idx) => (
                    <span
                      key={idx}
                      className="rounded-full bg-emerald-100 px-2.5 py-0.5 text-[10px] font-medium text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300"
                    >
                      ✓ {m}
                    </span>
                  ))}
                  {selectedPair.match.conflictingAttributes.map((c, idx) => (
                    <span
                      key={idx}
                      className="rounded-full bg-rose-100 px-2.5 py-0.5 text-[10px] font-medium text-rose-800 dark:bg-rose-950/40 dark:text-rose-300"
                    >
                      ✕ {c}
                    </span>
                  ))}
                  {selectedPair.match.missingAttributes.map((mi, idx) => (
                    <span
                      key={idx}
                      className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] font-medium text-muted-foreground"
                    >
                      ○ {mi}
                    </span>
                  ))}
                </div>
              </div>

              {/* Regulatory safe merge warning */}
              <div className="mt-3 rounded-lg border border-amber-300 bg-amber-50/60 p-3 text-xs text-amber-900 dark:bg-amber-950/20 dark:text-amber-300 space-y-1">
                <p className="font-semibold flex items-center gap-1.5">
                  <AlertTriangle className="h-4 w-4 text-amber-600" />
                  Regulatory Integrity Notice
                </p>
                <p>
                  Confirming a duplicate creates an auditable institutional record and flags the
                  relationship. In compliance with data preservation regulations, student records
                  are <strong>never automatically merged or deleted</strong>. Any necessary factual
                  corrections must be submitted through the Correction Workflow.
                </p>
              </div>

              {/* Controlled Reviewer Action Form */}
              <div className="mt-4 space-y-3 border-t border-border pt-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Controlled Review Decision
                  </label>
                  <Select
                    value={reviewAction}
                    onValueChange={(v) =>
                      setReviewAction(
                        v as
                          "confirm_duplicate" | "not_duplicate" | "needs_information" | "escalate",
                      )
                    }
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="confirm_duplicate">
                        Confirm Possible Duplicate (Flags cross-reference, preserves records)
                      </SelectItem>
                      <SelectItem value="not_duplicate">
                        Mark as Not Duplicate (Dismisses candidate with justification)
                      </SelectItem>
                      <SelectItem value="needs_information">
                        Request Verification Documents (Mark for student evidence)
                      </SelectItem>
                      <SelectItem value="escalate">
                        Escalate for Supervisory Review (Flag for AICTE/State Admin)
                      </SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs font-medium text-foreground">
                    Justification &amp; Audit Notes (Mandatory)
                  </label>
                  <Textarea
                    placeholder="Document your evidence review, verification of certificates, and reason for this action…"
                    value={reviewNote}
                    onChange={(e) => setReviewNote(e.target.value)}
                    rows={3}
                    className="text-xs"
                  />
                  <span className="text-[10px] text-muted-foreground">
                    {reviewNote.trim().length} / 5 characters minimum
                  </span>
                </div>
              </div>

              <DialogFooter className="mt-4 flex flex-wrap items-center justify-between gap-2">
                <Button asChild variant="outline" size="sm" className="text-xs gap-1">
                  <Link to="/corrections">
                    Initiate Correction Request <ArrowRight className="h-3.5 w-3.5" />
                  </Link>
                </Button>
                <div className="flex gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-xs"
                    onClick={() => setSelectedPair(null)}
                    disabled={isSubmitting}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    className="text-xs gap-1.5"
                    disabled={reviewNote.trim().length < 5 || isSubmitting}
                    onClick={handleExecuteReview}
                  >
                    <Send className="h-3.5 w-3.5" />
                    {isSubmitting ? "Recording…" : "Submit Review Action"}
                  </Button>
                </div>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
