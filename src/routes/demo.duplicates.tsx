import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState, useMemo } from "react";
import { getDemoStudents } from "@/lib/demo.functions";
import {
  generateCandidatePairs,
  clusterDuplicateCandidates,
  type StudentIdentityRecord,
  type ScoredDuplicatePair,
  type DuplicateCluster,
} from "@/lib/identity-resolution";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  Copy,
  Users,
  ShieldAlert,
  ShieldCheck,
  ArrowRight,
  GitMerge,
  Layers,
} from "lucide-react";
import { maskApaar, maskContact } from "@/lib/data-quality";

export const Route = createFileRoute("/demo/duplicates")({
  ssr: false,
  head: () => ({ meta: [{ title: "Duplicate Identity Resolution — EduTrace Demo" }] }),
  component: DemoDuplicatesPage,
});

type ResolutionAction = "merge" | "keep_both" | "scrutiny_required" | "";

function DemoDuplicatesPage() {
  const { data: students = [], isLoading } = useQuery({
    queryKey: ["demo-students"],
    queryFn: () => getDemoStudents(),
  });

  const [activeTab, setActiveTab] = useState<"pairs" | "clusters">("pairs");
  const [resolutions, setResolutions] = useState<
    Record<string, { resolution: ResolutionAction; notes: string; resolved: boolean }>
  >({});

  // Map students to StudentIdentityRecord
  const identityRecords: StudentIdentityRecord[] = useMemo(() => {
    return students.map((s) => ({
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
    }));
  }, [students]);

  // Run multi-pass candidate generation & clustering
  const candidatePairs: ScoredDuplicatePair[] = useMemo(() => {
    if (identityRecords.length < 2) return [];
    return generateCandidatePairs(identityRecords, {
      minCompositeScore: 0.5,
      enablePhonetic: true,
      enableTokenSort: true,
    });
  }, [identityRecords]);

  const clusters: DuplicateCluster[] = useMemo(() => {
    if (candidatePairs.length === 0) return [];
    return clusterDuplicateCandidates(candidatePairs);
  }, [candidatePairs]);

  function handleResolve(pairId: string) {
    const r = resolutions[pairId];
    if (!r?.resolution) {
      toast.error("Please select a resolution action first.");
      return;
    }
    setResolutions((prev) => ({
      ...prev,
      [pairId]: { ...r, resolved: true },
    }));
    toast.success("Identity conflict marked as resolved (demo).");
  }

  if (isLoading) {
    return <p className="text-muted-foreground p-8 text-center">Analyzing identity registry…</p>;
  }

  const unresolvedPairs = candidatePairs.filter((p) => !resolutions[p.id]?.resolved);
  const collisions = candidatePairs.filter((p) => p.match.isExactCollision);

  return (
    <div className="space-y-8 pb-16">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-border pb-5">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl tracking-tight text-foreground">
              Identity Resolution & Duplicate Management
            </h1>
            <Badge className="bg-amber-100 text-amber-800">Sprint 3 Demo</Badge>
          </div>
          <p className="mt-1 text-sm text-muted-foreground">
            Multi-algorithm similarity scoring, identifier collision alerts & DSU cluster
            management.
          </p>
        </div>

        <div className="flex gap-2">
          <Button
            variant={activeTab === "pairs" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("pairs")}
            className="gap-1.5"
          >
            <Copy className="h-4 w-4" /> Candidate Pairs ({candidatePairs.length})
          </Button>
          <Button
            variant={activeTab === "clusters" ? "default" : "outline"}
            size="sm"
            onClick={() => setActiveTab("clusters")}
            className="gap-1.5"
          >
            <Layers className="h-4 w-4" /> Clusters ({clusters.length})
          </Button>
        </div>
      </div>

      {/* ── KPI Summary ────────────────────────────────────────────── */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-xs font-medium text-muted-foreground">Candidate Duplicate Pairs</p>
          <p className="font-display text-3xl font-bold text-foreground mt-1">
            {candidatePairs.length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {unresolvedPairs.length} pending review
          </p>
        </div>

        <div
          className={cn(
            "rounded-xl border border-border bg-card p-4 shadow-2xs",
            collisions.length > 0 && "border-l-4 border-l-red-500 bg-red-50/20",
          )}
        >
          <p className="text-xs font-medium text-muted-foreground">Identifier Collisions</p>
          <p
            className={cn(
              "font-display text-3xl font-bold mt-1",
              collisions.length > 0 ? "text-red-600" : "text-foreground",
            )}
          >
            {collisions.length}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Colliding Roll No or APAAR with differing personal data
          </p>
        </div>

        <div className="rounded-xl border border-border bg-card p-4 shadow-2xs">
          <p className="text-xs font-medium text-muted-foreground">Duplicate Clusters (DSU)</p>
          <p className="font-display text-3xl font-bold text-foreground mt-1">{clusters.length}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            Grouped multi-record identity components
          </p>
        </div>
      </div>

      {/* ── Candidate Pairs View ───────────────────────────────────── */}
      {activeTab === "pairs" ? (
        candidatePairs.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-12 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <p className="mt-3 font-display text-lg text-foreground">No duplicates detected</p>
            <p className="text-xs text-muted-foreground mt-1">
              All student records have distinct identity signatures and identifiers.
            </p>
          </div>
        ) : (
          <div className="grid gap-4">
            {candidatePairs.map((pair, idx) => {
              const res = resolutions[pair.id] ?? { resolution: "", notes: "", resolved: false };
              const { studentA, studentB, match } = pair;

              return (
                <div
                  key={pair.id}
                  className={cn(
                    "rounded-xl border border-border bg-card p-5 shadow-2xs transition-all",
                    match.isExactCollision && "border-red-300 bg-red-50/30",
                    res.resolved && "opacity-60",
                  )}
                >
                  <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
                    <div className="space-y-3 flex-1">
                      {/* Badge Row */}
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={cn(
                            "font-bold text-xs uppercase",
                            match.confidence === "HIGH_CONFIDENCE"
                              ? "bg-red-100 text-red-800 border-red-300"
                              : "bg-amber-100 text-amber-800 border-amber-300",
                          )}
                        >
                          {match.confidence.replace(/_/g, " ")} ({match.percentage}%)
                        </Badge>

                        {match.isExactCollision && (
                          <Badge className="bg-red-600 text-white gap-1 text-xs">
                            <AlertOctagon className="h-3.5 w-3.5" />
                            CRITICAL: Identifier Collision ({match.collisionType})
                          </Badge>
                        )}

                        {res.resolved && (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-300">
                            ✓ Resolved ({res.resolution})
                          </Badge>
                        )}
                      </div>

                      <p className="text-xs text-muted-foreground leading-relaxed">
                        <span className="font-semibold text-foreground">Engine Explanation:</span>{" "}
                        {match.explanation}
                      </p>

                      {/* Side by Side Student Comparison Cards */}
                      <div className="grid gap-3 sm:grid-cols-2 pt-1">
                        <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-1">
                          <p className="font-semibold text-foreground text-sm">{studentA.name}</p>
                          <div className="grid grid-cols-2 gap-1 text-muted-foreground pt-1">
                            <span>Roll: {studentA.studentId || "—"}</span>
                            <span>DOB: {studentA.dob || "—"}</span>
                            <span>APAAR: {maskApaar(studentA.apaarId ?? "") || "—"}</span>
                            <span>Contact: {maskContact(studentA.contact ?? "") || "—"}</span>
                            <span className="col-span-2">Prog: {studentA.programmeCode}</span>
                          </div>
                        </div>

                        <div className="rounded-lg border border-border bg-background p-3 text-xs space-y-1">
                          <p className="font-semibold text-foreground text-sm">{studentB.name}</p>
                          <div className="grid grid-cols-2 gap-1 text-muted-foreground pt-1">
                            <span>Roll: {studentB.studentId || "—"}</span>
                            <span>DOB: {studentB.dob || "—"}</span>
                            <span>APAAR: {maskApaar(studentB.apaarId ?? "") || "—"}</span>
                            <span>Contact: {maskContact(studentB.contact ?? "") || "—"}</span>
                            <span className="col-span-2">Prog: {studentB.programmeCode}</span>
                          </div>
                        </div>
                      </div>

                      {/* Matching & Conflicting Attributes */}
                      <div className="flex flex-wrap gap-4 text-xs pt-1">
                        {match.matchingAttributes.length > 0 && (
                          <div className="flex items-center gap-1.5 text-emerald-700">
                            <span className="font-semibold">Matching:</span>
                            {match.matchingAttributes.join(", ")}
                          </div>
                        )}
                        {match.conflictingAttributes.length > 0 && (
                          <div className="flex items-center gap-1.5 text-red-600">
                            <span className="font-semibold">Conflicting:</span>
                            {match.conflictingAttributes.join(", ")}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Resolution Controls */}
                    {!res.resolved && (
                      <div className="flex flex-col gap-2.5 sm:w-64 shrink-0 border-t border-border pt-3 lg:border-t-0 lg:pt-0">
                        <label className="text-xs font-semibold text-foreground">
                          Resolution Decision:
                        </label>
                        <Select
                          value={res.resolution}
                          onValueChange={(val: ResolutionAction) =>
                            setResolutions((prev) => ({
                              ...prev,
                              [pair.id]: { ...res, resolution: val },
                            }))
                          }
                        >
                          <SelectTrigger className="w-full text-xs">
                            <SelectValue placeholder="Select action…" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="merge">Merge into Single Master Record</SelectItem>
                            <SelectItem value="keep_both">
                              Confirm as Distinct Individuals
                            </SelectItem>
                            <SelectItem value="scrutiny_required">
                              Flag for Physical Document Scrutiny
                            </SelectItem>
                          </SelectContent>
                        </Select>

                        <Textarea
                          value={res.notes}
                          onChange={(e) =>
                            setResolutions((prev) => ({
                              ...prev,
                              [pair.id]: { ...res, notes: e.target.value },
                            }))
                          }
                          placeholder="Resolution rationale & verification notes…"
                          rows={2}
                          className="text-xs"
                        />

                        <Button
                          size="sm"
                          onClick={() => handleResolve(pair.id)}
                          className="w-full text-xs"
                        >
                          Confirm Resolution
                        </Button>
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* ── Clusters View ─────────────────────────────────────────── */
        <div className="grid gap-4">
          {clusters.map((cluster) => (
            <div
              key={cluster.clusterId}
              className="rounded-xl border border-border bg-card p-5 space-y-3"
            >
              <div className="flex items-center justify-between border-b border-border pb-3">
                <div className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-primary" />
                  <span className="font-display font-semibold text-foreground">
                    Cluster #{cluster.clusterId.slice(-4)}
                  </span>
                  <Badge variant="outline" className="text-xs">
                    {cluster.clusterSize} records connected
                  </Badge>
                </div>
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                {cluster.records.map((r) => (
                  <div
                    key={r.id}
                    className="rounded-lg border border-border bg-muted/20 p-3 text-xs"
                  >
                    <p className="font-semibold text-foreground">{r.name}</p>
                    <p className="text-muted-foreground mt-0.5">
                      ID: {r.studentId} · Prog: {r.programmeCode}
                    </p>
                    <p className="text-muted-foreground">
                      DOB: {r.dob || "—"} · Contact: {maskContact(r.contact ?? "")}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
