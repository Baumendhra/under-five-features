/**
 * Centralized Institutional Intelligence Engine for EduTrace (SIH26263).
 *
 * Aggregates and correlates data across all 5 innovation modules:
 * 1. Data Quality Engine
 * 2. Correction Workflow & Discrepancies
 * 3. Identity Resolution & Duplicates
 * 4. Predictive Intake & Capacity Forecasting
 * 5. APAAR Verification Orchestration
 *
 * Grounded in deterministic metrics; strictly isolates student data by institution.
 */

import { evaluateStudentRecord, aggregateInstitutionQuality } from "./data-quality";
import {
  generateCandidatePairs,
  clusterDuplicateCandidates,
  type StudentIdentityRecord,
  type ScoredDuplicatePair,
  type DuplicateCluster,
} from "./identity-resolution";
import {
  aggregateInstitutionIntakeIntelligence,
  type HistoricalIntakePoint,
} from "./intake-forecast";
import { validateLocalApaar } from "./apaar-orchestrator";

// ── Types ──────────────────────────────────────────────────────────────────

export type PrioritySeverity = "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";

export type IntelligenceModuleSource =
  "data_quality" | "corrections" | "identity" | "apaar" | "intake" | "operations";

export interface OperationalPriorityItem {
  id: string;
  category: PrioritySeverity;
  title: string;
  rationale: string;
  supportingMetrics: Record<string, string | number>;
  suggestedAction: string;
  responsibleRole: "institution_admin" | "officer" | "aicte_admin";
  sourceModule: IntelligenceModuleSource;
  routeLink: string;
  status: "active" | "under_review" | "resolved";
}

export interface RegistryHealthMetrics {
  totalStudents: number;
  completeRecordsCount: number;
  attentionNeededCount: number;
  averageQualityScore: number;
  qualityBands: {
    excellent: number;
    good: number;
    needsImprovement: number;
    critical: number;
  };
  frequentIssues: Array<{
    field: string;
    title: string;
    category: string;
    count: number;
    severity: string;
  }>;
  completenessAverage: number;
  validityAverage: number;
  verificationAverage: number;
}

export interface CorrectionWorkflowMetrics {
  totalRequests: number;
  pendingCount: number;
  additionalInfoRequiredCount: number;
  approvedCount: number;
  rejectedCount: number;
  cancelledCount: number;
  slaOverdueCount: number;
  topCorrectedFields: Array<{ field: string; count: number }>;
  averageResolutionHours: number | null;
}

export interface IdentityResolutionMetrics {
  totalCandidates: number;
  highConfidenceMatches: number;
  confirmedDuplicateCases: number;
  pendingReviewCases: number;
  dismissedCandidates: number;
  identifierCollisions: number;
  frequentConflictingFields: Array<{ field: string; count: number }>;
  unresolvedClustersCount: number;
}

export interface ApaarVerificationMetrics {
  totalEligible: number;
  locallyValidCount: number;
  checksumValidCount: number;
  officiallyVerifiedCount: number;
  pendingJobsCount: number;
  failedJobsCount: number;
  manualReviewCount: number;
  serviceUnavailableCount: number;
  mockSimulatedCount: number;
  coveragePercentage: number;
}

export interface ProgrammeIntakeMetric {
  programmeCode: string;
  programmeName: string;
  approvedCapacity: number;
  regularAdmissions: number;
  supernumeraryAdmissions: number;
  utilizationPct: number;
  remainingCapacity: number;
  forecastDemand?: number;
  forecastModel?: string;
  forecastConfidence?: string;
  earlyWarnings: string[];
}

export interface PredictiveIntakeMetrics {
  approvedCapacityTotal: number;
  actualRegularAdmissions: number;
  supernumeraryAdmissions: number;
  overallCapacityUtilizationPct: number;
  remainingRegularCapacity: number;
  programmeBreakdown: ProgrammeIntakeMetric[];
  earlyWarnings: Array<{
    code: string;
    severity: string;
    programmeCode: string;
    message: string;
    suggestedAction: string;
  }>;
}

export interface InstitutionalIntelligenceMetrics {
  institutionId: string;
  institutionName: string;
  generatedAt: string;
  registryHealth: RegistryHealthMetrics;
  corrections: CorrectionWorkflowMetrics;
  identity: IdentityResolutionMetrics;
  apaar: ApaarVerificationMetrics;
  intake: PredictiveIntakeMetrics;
  operationalPriorities: OperationalPriorityItem[];
  overallHealthIndex: number;
  overallHealthStatus: "HEALTHY" | "ATTENTION_REQUIRED" | "CRITICAL";
}

// ── Privacy-Filtered Context for AI Providers ──────────────────────────────

export interface SanitizedInstitutionalContext {
  institutionId: string;
  institutionName: string;
  reportingDate: string;
  summaryStatistics: {
    totalStudents: number;
    averageQualityScore: number;
    recordsNeedingAttention: number;
    pendingCorrections: number;
    overdueCorrections: number;
    highConfidenceDuplicateCandidates: number;
    identifierCollisions: number;
    apaarVerifiedCount: number;
    apaarCoveragePct: number;
    totalApprovedCapacity: number;
    totalRegularAdmissions: number;
    capacityUtilizationPct: number;
  };
  qualityDistribution: {
    excellent: number;
    good: number;
    needsImprovement: number;
    critical: number;
  };
  topDataQualityIssues: Array<{
    field: string;
    issue: string;
    severity: string;
    count: number;
  }>;
  programmeSummaries: Array<{
    code: string;
    name: string;
    approvedCapacity: number;
    regularAdmissions: number;
    utilizationPct: number;
    forecastDemand?: number;
    warnings: string[];
  }>;
  operationalPriorities: Array<{
    category: PrioritySeverity;
    title: string;
    rationale: string;
    action: string;
    role: string;
  }>;
}

// ── Aggregation Functions ──────────────────────────────────────────────────

export interface RawStudentInput {
  id: string;
  student_id: string | null;
  apaar_id: string | null;
  name: string;
  dob: string | null;
  programme_code: string | null;
  category: string | null;
  intake_type: string | null;
  contact: string | null;
  gender: string | null;
  admission_year?: number | null;
  institution_id?: string | null;
  apaar_verify_status?: string | null;
  consent_recorded?: boolean | null;
  created_at?: string;
}

export interface RawCorrectionInput {
  id: string;
  student_id: string;
  field_name: string;
  status: string;
  created_at: string;
  updated_at: string;
  proposed_value?: string;
}

export interface RawProgrammeInput {
  id?: string;
  code: string;
  name: string;
  approved_intake: number;
  institution_id?: string;
}

/**
 * Builds composite Institutional Intelligence Metrics by correlating real database inputs.
 */
export function aggregateInstitutionalIntelligence(params: {
  institutionId: string;
  institutionName: string;
  students: RawStudentInput[];
  programmes: RawProgrammeInput[];
  corrections: RawCorrectionInput[];
  historicalIntake?: Record<string, HistoricalIntakePoint[]>;
}): InstitutionalIntelligenceMetrics {
  const { institutionId, institutionName, students, programmes, corrections, historicalIntake } =
    params;

  // 1. Data Quality Engine Aggregation
  const evaluatedStudents = students.map((s) =>
    evaluateStudentRecord({
      id: s.id,
      studentId: s.student_id,
      apaarId: s.apaar_id,
      name: s.name,
      dob: s.dob,
      programmeCode: s.programme_code,
      category: s.category,
      intakeType: s.intake_type,
      contact: s.contact,
      gender: s.gender,
      admissionYear: s.admission_year,
      apaarVerifyStatus: s.apaar_verify_status,
      institutionId: s.institution_id ?? institutionId,
    }),
  );

  const qualitySummary = aggregateInstitutionQuality(evaluatedStudents);

  const registryHealth: RegistryHealthMetrics = {
    totalStudents: qualitySummary.totalRecords,
    completeRecordsCount: qualitySummary.totalRecords - qualitySummary.attentionNeededCount,
    attentionNeededCount: qualitySummary.attentionNeededCount,
    averageQualityScore: qualitySummary.averageScore,
    qualityBands: {
      excellent: qualitySummary.qualityBands.excellent,
      good: qualitySummary.qualityBands.good,
      needsImprovement: qualitySummary.qualityBands.needsImprovement,
      critical: qualitySummary.qualityBands.critical,
    },
    frequentIssues: qualitySummary.frequentIssues.map((i) => ({
      field: i.field,
      title: i.title,
      category: i.category,
      count: i.count,
      severity: i.severity,
    })),
    completenessAverage: qualitySummary.averageCompleteness,
    validityAverage: qualitySummary.averageValidity,
    verificationAverage: Math.round(
      (students.filter((s) => s.apaar_verify_status === "verified").length /
        Math.max(students.length, 1)) *
        100,
    ),
  };

  // 2. Correction Workflow Aggregation
  let pendingCount = 0;
  let additionalInfoRequiredCount = 0;
  let approvedCount = 0;
  let rejectedCount = 0;
  let cancelledCount = 0;
  let slaOverdueCount = 0;
  let totalResolutionHours = 0;
  let resolvedCount = 0;

  const nowMs = Date.now();
  const SLA_HOURS_MS = 48 * 60 * 60 * 1000;
  const fieldCorrectionCounts: Record<string, number> = {};

  for (const c of corrections) {
    fieldCorrectionCounts[c.field_name] = (fieldCorrectionCounts[c.field_name] ?? 0) + 1;

    switch (c.status) {
      case "pending":
      case "in_review":
        pendingCount++;
        if (nowMs - new Date(c.created_at).getTime() > SLA_HOURS_MS) {
          slaOverdueCount++;
        }
        break;
      case "more_info_required":
        additionalInfoRequiredCount++;
        break;
      case "approved":
      case "applied":
        approvedCount++;
        {
          const hours =
            (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) /
            (1000 * 60 * 60);
          if (hours >= 0) {
            totalResolutionHours += hours;
            resolvedCount++;
          }
        }
        break;
      case "rejected":
        rejectedCount++;
        {
          const hours =
            (new Date(c.updated_at).getTime() - new Date(c.created_at).getTime()) /
            (1000 * 60 * 60);
          if (hours >= 0) {
            totalResolutionHours += hours;
            resolvedCount++;
          }
        }
        break;
      case "cancelled":
        cancelledCount++;
        break;
    }
  }

  const avgResolutionHours =
    resolvedCount > 0 ? Math.round((totalResolutionHours / resolvedCount) * 10) / 10 : null;

  const topCorrectedFields = Object.entries(fieldCorrectionCounts)
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const correctionsMetrics: CorrectionWorkflowMetrics = {
    totalRequests: corrections.length,
    pendingCount,
    additionalInfoRequiredCount,
    approvedCount,
    rejectedCount,
    cancelledCount,
    slaOverdueCount,
    topCorrectedFields,
    averageResolutionHours: avgResolutionHours,
  };

  // 3. Identity Resolution Aggregation
  const identityRecords: StudentIdentityRecord[] = students.map((s) => ({
    id: s.id,
    studentId: s.student_id,
    apaarId: s.apaar_id,
    name: s.name,
    dob: s.dob,
    programmeCode: s.programme_code,
    contact: s.contact,
    gender: s.gender,
    admissionYear: s.admission_year ?? new Date().getFullYear(),
    institutionId: s.institution_id ?? institutionId,
  }));

  const candidatePairs: ScoredDuplicatePair[] = generateCandidatePairs(identityRecords);

  const clusters: DuplicateCluster[] = clusterDuplicateCandidates(candidatePairs);

  let highConfidenceMatches = 0;
  let identifierCollisions = 0;
  const fieldConflictCounts: Record<string, number> = {};

  for (const pair of candidatePairs) {
    if (pair.match.confidence === "HIGH_CONFIDENCE") {
      highConfidenceMatches++;
    }
    if (pair.match.isExactCollision) {
      identifierCollisions++;
    }
    for (const attr of pair.match.conflictingAttributes) {
      fieldConflictCounts[attr] = (fieldConflictCounts[attr] ?? 0) + 1;
    }
  }

  const frequentConflictingFields = Object.entries(fieldConflictCounts)
    .map(([field, count]) => ({ field, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  const identityMetrics: IdentityResolutionMetrics = {
    totalCandidates: candidatePairs.length,
    highConfidenceMatches,
    confirmedDuplicateCases: candidatePairs.filter((p) => p.match.overallScore >= 0.85).length,
    pendingReviewCases: candidatePairs.length,
    dismissedCandidates: 0,
    identifierCollisions,
    frequentConflictingFields,
    unresolvedClustersCount: clusters.length,
  };

  // 4. APAAR Verification Aggregation
  let locallyValidCount = 0;
  let checksumValidCount = 0;
  let officiallyVerifiedCount = 0;
  let pendingJobsCount = 0;
  let failedJobsCount = 0;
  let manualReviewCount = 0;
  let serviceUnavailableCount = 0;
  let mockSimulatedCount = 0;

  for (const s of students) {
    if (s.apaar_id) {
      const localVal = validateLocalApaar(s.apaar_id);
      if (localVal.formatStatus === "FORMAT_VALID") locallyValidCount++;
      if (localVal.checksumStatus === "CHECKSUM_VALID") checksumValidCount++;
    }

    const vStatus = s.apaar_verify_status ?? "not_submitted";
    switch (vStatus) {
      case "verified":
        officiallyVerifiedCount++;
        break;
      case "processing":
      case "queued":
      case "pending_consent":
        pendingJobsCount++;
        break;
      case "failed":
        failedJobsCount++;
        break;
      case "manual_review":
        manualReviewCount++;
        break;
      case "service_unavailable":
      case "retry_required":
        serviceUnavailableCount++;
        break;
      case "mock_verified":
        mockSimulatedCount++;
        break;
    }
  }

  const apaarMetrics: ApaarVerificationMetrics = {
    totalEligible: students.length,
    locallyValidCount,
    checksumValidCount,
    officiallyVerifiedCount,
    pendingJobsCount,
    failedJobsCount,
    manualReviewCount,
    serviceUnavailableCount,
    mockSimulatedCount,
    coveragePercentage: Math.round((officiallyVerifiedCount / Math.max(students.length, 1)) * 100),
  };

  // 5. Predictive Intake Intelligence Aggregation
  const currentYear = new Date().getFullYear();
  const programmesInput = programmes.map((p) => {
    const progStudents = students.filter(
      (s) => s.programme_code?.toLowerCase() === p.code.toLowerCase(),
    );
    const regularCount = progStudents.filter(
      (s) => !s.intake_type || s.intake_type.toLowerCase() === "regular",
    ).length;
    const superCount = progStudents.filter(
      (s) => s.intake_type && s.intake_type.toLowerCase() !== "regular",
    ).length;

    const history: HistoricalIntakePoint[] = historicalIntake?.[p.code] ?? [
      {
        academicYear: currentYear,
        regularCount,
        lateralCount: 0,
        supernumeraryCount: superCount,
        totalCount: regularCount + superCount,
        approvedIntake: p.approved_intake,
        utilizationRate:
          p.approved_intake > 0 ? Math.round((regularCount / p.approved_intake) * 100) : 0,
      },
    ];

    return {
      courseCode: p.code,
      courseName: p.name,
      approvedIntake: p.approved_intake,
      history,
    };
  });

  const intakeSummary = aggregateInstitutionIntakeIntelligence(programmesInput);

  const programmeBreakdown: ProgrammeIntakeMetric[] = (intakeSummary?.programmeSummaries ?? []).map(
    (p) => {
      const progEarlyWarnings = (intakeSummary?.earlyWarnings ?? [])
        .filter((w) => w.programmeCode === p.programmeCode)
        .map((w) => w.message);

      return {
        programmeCode: p.programmeCode,
        programmeName: p.programmeName ?? p.programmeCode,
        approvedCapacity: p.approvedIntake,
        regularAdmissions: p.projectedRegularIntake,
        supernumeraryAdmissions: 0,
        utilizationPct: p.projectedUtilization,
        remainingCapacity: p.remainingCapacity,
        forecastDemand: p.projectedRegularIntake,
        forecastModel: p.selectedModel,
        forecastConfidence: p.status,
        earlyWarnings: progEarlyWarnings,
      };
    },
  );

  const allEarlyWarnings = (intakeSummary?.earlyWarnings ?? []).map((w) => ({
    code: w.code,
    severity: w.severity,
    programmeCode: w.programmeCode,
    message: w.message,
    suggestedAction: w.suggestedAction,
  }));

  const intakeMetrics: PredictiveIntakeMetrics = {
    approvedCapacityTotal: intakeSummary?.totalApprovedCapacity ?? 0,
    actualRegularAdmissions: intakeSummary?.currentRegularAdmitted ?? 0,
    supernumeraryAdmissions: intakeSummary?.currentSupernumerary ?? 0,
    overallCapacityUtilizationPct: intakeSummary?.projectedOverallUtilization ?? 0,
    remainingRegularCapacity: Math.max(
      0,
      (intakeSummary?.totalApprovedCapacity ?? 0) - (intakeSummary?.currentRegularAdmitted ?? 0),
    ),
    programmeBreakdown,
    earlyWarnings: allEarlyWarnings,
  };

  // 6. Operational Priorities Derivation
  const operationalPriorities = deriveOperationalPriorities({
    registryHealth,
    corrections: correctionsMetrics,
    identity: identityMetrics,
    apaar: apaarMetrics,
    intake: intakeMetrics,
  });

  // 7. Calculate composite institutional health index & status
  const overallHealthIndex = Math.max(
    0,
    Math.min(
      100,
      Math.round(
        registryHealth.averageQualityScore * 0.35 +
          apaarMetrics.coveragePercentage * 0.25 +
          (intakeMetrics.overallCapacityUtilizationPct <= 100
            ? 100
            : Math.max(0, 100 - (intakeMetrics.overallCapacityUtilizationPct - 100) * 2)) *
            0.25 +
          Math.max(0, 100 - correctionsMetrics.pendingCount * 5) * 0.15,
      ),
    ),
  );

  const overallHealthStatus: "HEALTHY" | "ATTENTION_REQUIRED" | "CRITICAL" =
    overallHealthIndex >= 80
      ? "HEALTHY"
      : overallHealthIndex >= 60
        ? "ATTENTION_REQUIRED"
        : "CRITICAL";

  return {
    institutionId,
    institutionName,
    generatedAt: new Date().toISOString(),
    registryHealth,
    corrections: correctionsMetrics,
    identity: identityMetrics,
    apaar: apaarMetrics,
    intake: intakeMetrics,
    operationalPriorities,
    overallHealthIndex,
    overallHealthStatus,
  };
}

/**
 * Deterministic rules for deriving explainable Operational Priorities.
 */
export function deriveOperationalPriorities(metrics: {
  registryHealth: RegistryHealthMetrics;
  corrections: CorrectionWorkflowMetrics;
  identity: IdentityResolutionMetrics;
  apaar: ApaarVerificationMetrics;
  intake: PredictiveIntakeMetrics;
}): OperationalPriorityItem[] {
  const priorities: OperationalPriorityItem[] = [];

  // CRITICAL Priority Checks
  if (metrics.identity.identifierCollisions > 0) {
    priorities.push({
      id: "op-crit-ident-collision",
      category: "CRITICAL",
      title: "Conflicting Identity Identifier Collision Detected",
      rationale: `${metrics.identity.identifierCollisions} student records share an identical government identifier (APAAR/roll number) with conflicting personal demographics.`,
      supportingMetrics: {
        identifierCollisions: metrics.identity.identifierCollisions,
        candidateDuplicates: metrics.identity.totalCandidates,
      },
      suggestedAction:
        "Initiate mandatory manual document scrutiny in Duplicate Management before regulatory lock.",
      responsibleRole: "institution_admin",
      sourceModule: "identity",
      routeLink: "/duplicates",
      status: "active",
    });
  }

  if (metrics.registryHealth.qualityBands.critical > 0) {
    priorities.push({
      id: "op-crit-quality-records",
      category: "CRITICAL",
      title: "Critical Student Data Integrity Violations",
      rationale: `${metrics.registryHealth.qualityBands.critical} student records have severe data quality deductions (score < 40) failing primary statutory fields.`,
      supportingMetrics: {
        criticalRecordsCount: metrics.registryHealth.qualityBands.critical,
        attentionNeededCount: metrics.registryHealth.attentionNeededCount,
      },
      suggestedAction:
        "Review affected students in Registry and issue automated correction requests.",
      responsibleRole: "officer",
      sourceModule: "data_quality",
      routeLink: "/students",
      status: "active",
    });
  }

  for (const prog of metrics.intake.programmeBreakdown) {
    if (prog.utilizationPct > 105) {
      priorities.push({
        id: `op-crit-overcapacity-${prog.programmeCode}`,
        category: "CRITICAL",
        title: `Regulatory Capacity Breach in ${prog.programmeCode}`,
        rationale: `Programme ${prog.programmeName} has registered ${prog.regularAdmissions} regular students against an approved intake of ${prog.approvedCapacity} (${prog.utilizationPct}%).`,
        supportingMetrics: {
          programmeCode: prog.programmeCode,
          regularAdmissions: prog.regularAdmissions,
          approvedCapacity: prog.approvedCapacity,
          utilizationPct: prog.utilizationPct,
        },
        suggestedAction:
          "Reclassify supernumerary entries (EWS/PMSSS) or contact AICTE approvals cell immediately.",
        responsibleRole: "institution_admin",
        sourceModule: "intake",
        routeLink: "/programmes",
        status: "active",
      });
    }
  }

  // HIGH Priority Checks
  if (metrics.corrections.slaOverdueCount > 0) {
    priorities.push({
      id: "op-high-sla-corrections",
      category: "HIGH",
      title: "Correction Request SLA Breach (48+ Hours)",
      rationale: `${metrics.corrections.slaOverdueCount} student correction requests have been pending review beyond the 48-hour institutional compliance threshold.`,
      supportingMetrics: {
        slaOverdueCount: metrics.corrections.slaOverdueCount,
        totalPendingCorrections: metrics.corrections.pendingCount,
      },
      suggestedAction: "Assign institutional scrutiny officers to clear pending correction queue.",
      responsibleRole: "officer",
      sourceModule: "corrections",
      routeLink: "/corrections",
      status: "active",
    });
  }

  if (metrics.identity.highConfidenceMatches > 0) {
    priorities.push({
      id: "op-high-dup-matches",
      category: "HIGH",
      title: "High-Confidence Duplicate Identity Candidates",
      rationale: `${metrics.identity.highConfidenceMatches} candidate pairs show composite similarity >= 80%, indicating dual admission or duplicate entry.`,
      supportingMetrics: {
        highConfidenceMatches: metrics.identity.highConfidenceMatches,
        unresolvedClusters: metrics.identity.unresolvedClustersCount,
      },
      suggestedAction:
        "Scrutinize student credentials and execute canonical record merge or record dismissal.",
      responsibleRole: "officer",
      sourceModule: "identity",
      routeLink: "/duplicates",
      status: "active",
    });
  }

  if (metrics.apaar.failedJobsCount > 0 || metrics.apaar.manualReviewCount > 0) {
    priorities.push({
      id: "op-high-apaar-failures",
      category: "HIGH",
      title: "APAAR Verification Gate Discrepancies",
      rationale: `${metrics.apaar.failedJobsCount + metrics.apaar.manualReviewCount} student records encountered gateway demographic mismatch or fatal verification error.`,
      supportingMetrics: {
        failedJobs: metrics.apaar.failedJobsCount,
        manualReviewCases: metrics.apaar.manualReviewCount,
      },
      suggestedAction:
        "Compare institutional student registry names with APAAR gateway name records.",
      responsibleRole: "officer",
      sourceModule: "apaar",
      routeLink: "/students",
      status: "active",
    });
  }

  // MEDIUM Priority Checks
  if (metrics.apaar.checksumValidCount > metrics.apaar.officiallyVerifiedCount) {
    const unverifiedChecksums =
      metrics.apaar.checksumValidCount - metrics.apaar.officiallyVerifiedCount;
    if (unverifiedChecksums > 5) {
      priorities.push({
        id: "op-med-apaar-backlog",
        category: "MEDIUM",
        title: "Unsubmitted Local APAAR Validations",
        rationale: `${unverifiedChecksums} student records pass local Verhoeff checksum validation but have not completed external gateway verification.`,
        supportingMetrics: {
          locallyValidCount: metrics.apaar.locallyValidCount,
          checksumValidCount: metrics.apaar.checksumValidCount,
          officiallyVerifiedCount: metrics.apaar.officiallyVerifiedCount,
          unverifiedChecksums,
        },
        suggestedAction:
          "Trigger batch verification orchestration to confirm official Digilocker / ABC status.",
        responsibleRole: "officer",
        sourceModule: "apaar",
        routeLink: "/students",
        status: "active",
      });
    }
  }

  for (const prog of metrics.intake.programmeBreakdown) {
    if (prog.utilizationPct > 0 && prog.utilizationPct < 55) {
      priorities.push({
        id: `op-med-underutil-${prog.programmeCode}`,
        category: "MEDIUM",
        title: `Low Intake Capacity Utilization: ${prog.programmeCode}`,
        rationale: `${prog.programmeName} has utilized only ${prog.utilizationPct}% (${prog.regularAdmissions}/${prog.approvedCapacity}) of its approved regular quota.`,
        supportingMetrics: {
          programmeCode: prog.programmeCode,
          regularAdmissions: prog.regularAdmissions,
          approvedCapacity: prog.approvedCapacity,
          utilizationPct: prog.utilizationPct,
        },
        suggestedAction:
          "Evaluate special round counselling allocations or rationalization for the next academic year.",
        responsibleRole: "institution_admin",
        sourceModule: "intake",
        routeLink: "/programmes",
        status: "active",
      });
    }
  }

  // LOW Priority Checks
  if (metrics.registryHealth.averageQualityScore < 85) {
    priorities.push({
      id: "op-low-quality-average",
      category: "LOW",
      title: "Routine Registry Data Completeness Enhancement",
      rationale: `Overall institutional data quality index is ${metrics.registryHealth.averageQualityScore}/100. Contact and minor academic details are missing across several records.`,
      supportingMetrics: {
        averageScore: metrics.registryHealth.averageQualityScore,
        attentionNeededCount: metrics.registryHealth.attentionNeededCount,
      },
      suggestedAction:
        "Prompt students during semester fee renewal to update contact and guardian information.",
      responsibleRole: "officer",
      sourceModule: "data_quality",
      routeLink: "/students",
      status: "active",
    });
  }

  return priorities;
}

/**
 * Explicit Privacy Filter: Strips all identifiable student PII before constructing AI prompts.
 *
 * Removes:
 * - Student names
 * - APAAR IDs
 * - Aadhaar numbers
 * - Phone numbers
 * - Email addresses
 * - Full dates of birth
 * - Student raw payloads & auth tokens
 *
 * Transmits ONLY institution-level aggregated metrics and anonymized summaries.
 */
export function sanitizeForAIPrompt(
  metrics: InstitutionalIntelligenceMetrics,
): SanitizedInstitutionalContext {
  return {
    institutionId: metrics.institutionId,
    institutionName: metrics.institutionName,
    reportingDate: metrics.generatedAt,
    summaryStatistics: {
      totalStudents: metrics.registryHealth.totalStudents,
      averageQualityScore: metrics.registryHealth.averageQualityScore,
      recordsNeedingAttention: metrics.registryHealth.attentionNeededCount,
      pendingCorrections: metrics.corrections.pendingCount,
      overdueCorrections: metrics.corrections.slaOverdueCount,
      highConfidenceDuplicateCandidates: metrics.identity.highConfidenceMatches,
      identifierCollisions: metrics.identity.identifierCollisions,
      apaarVerifiedCount: metrics.apaar.officiallyVerifiedCount,
      apaarCoveragePct: metrics.apaar.coveragePercentage,
      totalApprovedCapacity: metrics.intake.approvedCapacityTotal,
      totalRegularAdmissions: metrics.intake.actualRegularAdmissions,
      capacityUtilizationPct: metrics.intake.overallCapacityUtilizationPct,
    },
    qualityDistribution: metrics.registryHealth.qualityBands,
    topDataQualityIssues: metrics.registryHealth.frequentIssues.map((i) => ({
      field: i.field,
      issue: i.title,
      severity: i.severity,
      count: i.count,
    })),
    programmeSummaries: metrics.intake.programmeBreakdown.map((p) => {
      const summary: {
        code: string;
        name: string;
        approvedCapacity: number;
        regularAdmissions: number;
        utilizationPct: number;
        forecastDemand?: number;
        warnings: string[];
      } = {
        code: p.programmeCode,
        name: p.programmeName,
        approvedCapacity: p.approvedCapacity,
        regularAdmissions: p.regularAdmissions,
        utilizationPct: p.utilizationPct,
        warnings: p.earlyWarnings,
      };
      if (typeof p.forecastDemand === "number") {
        summary.forecastDemand = p.forecastDemand;
      }
      return summary;
    }),
    operationalPriorities: metrics.operationalPriorities.map((op) => ({
      category: op.category,
      title: op.title,
      rationale: op.rationale,
      action: op.suggestedAction,
      role: op.responsibleRole,
    })),
  };
}
