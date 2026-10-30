/**
 * AI-Assisted Institutional Decision Support Provider for EduTrace (SIH26263).
 *
 * Provides hybrid intelligence:
 * 1. Primary: Google Gemini AI (via secure server-side REST integration)
 * 2. Fallback: Deterministic Rule-Based Intelligence (works 100% offline without API key)
 *
 * Strict Privacy: Never sends identifiable student PII (names, APAAR, contact, DOB).
 * All queries are read-only and strictly scoped to the authenticated institution.
 */

import type { SanitizedInstitutionalContext, PrioritySeverity } from "./institutional-intelligence";

// ── Types ──────────────────────────────────────────────────────────────────

export type InstitutionalReportType =
  | "executive_summary"
  | "registry_health"
  | "data_quality"
  | "corrections"
  | "duplicate_identity"
  | "apaar_verification"
  | "intake_capacity"
  | "operational_risk";

export type AssistantQueryIntent =
  | "REGISTRY_HEALTH"
  | "DATA_QUALITY"
  | "CORRECTIONS"
  | "DUPLICATES"
  | "APAAR_STATUS"
  | "INTAKE_FORECAST"
  | "OPERATIONAL_RISKS"
  | "EXECUTIVE_SUMMARY"
  | "GENERAL";

export interface InstitutionalActionRecommendation {
  priority: PrioritySeverity;
  action: string;
  responsibleRole: string;
}

export interface InstitutionalAIResponse {
  provider: "gemini" | "rule_based";
  modelUsed: string;
  generatedAt: string;
  summary: string;
  keyObservations: string[];
  supportingMetrics: Record<string, string | number>;
  suggestedActions: InstitutionalActionRecommendation[];
  confidence: "high" | "medium" | "preliminary";
  limitations?: string;
}

export interface InstitutionalAIProvider {
  readonly providerName: "gemini" | "rule_based";

  generateInsights(context: SanitizedInstitutionalContext): Promise<InstitutionalAIResponse>;

  answerQuestion(
    question: string,
    context: SanitizedInstitutionalContext,
  ): Promise<InstitutionalAIResponse>;

  generateReport(
    context: SanitizedInstitutionalContext,
    reportType: InstitutionalReportType,
  ): Promise<InstitutionalAIResponse>;
}

// ── Query Safety & Intent Classifier ───────────────────────────────────────

const MUTATION_OR_SQL_PATTERNS = [
  /drop\s+table/i,
  /select\s+.*\s+from/i,
  /update\s+students/i,
  /delete\s+from/i,
  /truncate/i,
  /insert\s+into/i,
  /approve\s+(this\s+)?correction/i,
  /approve\s+(this\s+)?verification/i,
  /change\s+capacity/i,
  /modify\s+student/i,
  /grant\s+role/i,
];

export function validateAndClassifyQuery(question: string): {
  safe: boolean;
  intent: AssistantQueryIntent;
  rejectionReason?: string;
} {
  const trimmed = question.trim();
  if (!trimmed) {
    return {
      safe: false,
      intent: "GENERAL",
      rejectionReason: "Question cannot be empty.",
    };
  }

  // Check for malicious SQL or database mutation instructions
  for (const pattern of MUTATION_OR_SQL_PATTERNS) {
    if (pattern.test(trimmed)) {
      return {
        safe: false,
        intent: "GENERAL",
        rejectionReason:
          "EduTrace Assistant is strictly read-only and cannot execute database mutations or arbitrary SQL commands.",
      };
    }
  }

  const lower = trimmed.toLowerCase();

  if (
    lower.includes("apaar") ||
    lower.includes("checksum") ||
    lower.includes("verhoeff") ||
    lower.includes("abc id")
  ) {
    return { safe: true, intent: "APAAR_STATUS" };
  }
  if (
    lower.includes("duplicate") ||
    lower.includes("collision") ||
    lower.includes("cluster") ||
    lower.includes("match")
  ) {
    return { safe: true, intent: "DUPLICATES" };
  }
  if (
    lower.includes("correction") ||
    lower.includes("discrepancy") ||
    lower.includes("sla") ||
    lower.includes("overdue")
  ) {
    return { safe: true, intent: "CORRECTIONS" };
  }
  if (
    lower.includes("quality") ||
    lower.includes("score") ||
    lower.includes("invalid") ||
    lower.includes("completeness")
  ) {
    return { safe: true, intent: "DATA_QUALITY" };
  }
  if (
    lower.includes("intake") ||
    lower.includes("capacity") ||
    lower.includes("admission") ||
    lower.includes("forecast") ||
    lower.includes("enrolment") ||
    lower.includes("supernumerary")
  ) {
    return { safe: true, intent: "INTAKE_FORECAST" };
  }
  if (
    lower.includes("risk") ||
    lower.includes("priority") ||
    lower.includes("bottleneck") ||
    lower.includes("urgent") ||
    lower.includes("action")
  ) {
    return { safe: true, intent: "OPERATIONAL_RISKS" };
  }
  if (
    lower.includes("health") ||
    lower.includes("summary") ||
    lower.includes("overview") ||
    lower.includes("executive")
  ) {
    return { safe: true, intent: "EXECUTIVE_SUMMARY" };
  }
  if (
    lower.includes("student") ||
    lower.includes("record") ||
    lower.includes("registry") ||
    lower.includes("count")
  ) {
    return { safe: true, intent: "REGISTRY_HEALTH" };
  }

  return { safe: true, intent: "GENERAL" };
}

// ── Rule-Based Provider (Deterministic Fallback) ───────────────────────────

export class RuleBasedInstitutionalAIProvider implements InstitutionalAIProvider {
  readonly providerName = "rule_based" as const;
  private readonly modelName = "edutrace-rule-engine-v1";

  async generateInsights(context: SanitizedInstitutionalContext): Promise<InstitutionalAIResponse> {
    const stats = context.summaryStatistics;
    const observations: string[] = [];
    const actions: InstitutionalActionRecommendation[] = [];

    // Quality observations
    if (stats.averageQualityScore >= 85) {
      observations.push(
        `Institutional student data quality index is robust at ${stats.averageQualityScore}/100.`,
      );
    } else {
      observations.push(
        `Average data quality score is ${stats.averageQualityScore}/100. ${stats.recordsNeedingAttention} of ${stats.totalStudents} records require data corrections.`,
      );
    }

    // Correction observations
    if (stats.overdueCorrections > 0) {
      observations.push(
        `${stats.overdueCorrections} correction requests are exceeding the 48-hour SLA threshold.`,
      );
      actions.push({
        priority: "HIGH",
        action: "Expedite scrutiny of overdue correction requests in the Corrections desk.",
        responsibleRole: "Scrutiny Officer",
      });
    }

    // Identity & Duplicate observations
    if (stats.identifierCollisions > 0) {
      observations.push(
        `Critical: ${stats.identifierCollisions} identifier collision(s) detected with conflicting demographic data.`,
      );
      actions.push({
        priority: "CRITICAL",
        action: "Investigate colliding student records immediately in Duplicate Management.",
        responsibleRole: "Institutional Admin",
      });
    } else if (stats.highConfidenceDuplicateCandidates > 0) {
      observations.push(
        `${stats.highConfidenceDuplicateCandidates} candidate pair(s) exhibit high-confidence duplicate similarity.`,
      );
      actions.push({
        priority: "HIGH",
        action: "Perform identity deduplication review to prevent dual-enrolment reporting.",
        responsibleRole: "Scrutiny Officer",
      });
    }

    // APAAR verification
    observations.push(
      `Official APAAR gateway verification coverage is at ${stats.apaarCoveragePct}% (${stats.apaarVerifiedCount}/${stats.totalStudents} students verified).`,
    );

    // Intake & Capacity
    observations.push(
      `Overall approved intake capacity utilization is ${stats.capacityUtilizationPct}% (${stats.totalRegularAdmissions}/${stats.totalApprovedCapacity} regular admissions).`,
    );

    // Default recommendation if empty
    if (actions.length === 0) {
      actions.push({
        priority: "LOW",
        action: "Maintain routine registry updates and monitor APAAR batch verification queues.",
        responsibleRole: "Academic Officer",
      });
    }

    return {
      provider: "rule_based",
      modelUsed: this.modelName,
      generatedAt: new Date().toISOString(),
      summary: `EduTrace deterministic evaluation for ${context.institutionName}: ${stats.totalStudents} registered students across ${context.programmeSummaries.length} programmes with ${stats.averageQualityScore}/100 data health and ${stats.capacityUtilizationPct}% quota utilization.`,
      keyObservations: observations,
      supportingMetrics: {
        totalStudents: stats.totalStudents,
        averageQualityScore: stats.averageQualityScore,
        recordsNeedingAttention: stats.recordsNeedingAttention,
        pendingCorrections: stats.pendingCorrections,
        overdueCorrections: stats.overdueCorrections,
        apaarCoveragePct: stats.apaarCoveragePct,
        capacityUtilizationPct: stats.capacityUtilizationPct,
      },
      suggestedActions: actions,
      confidence: "high",
      limitations:
        "Metrics reflect deterministic database aggregations and local verification states. External gateway connectivity determines live APAAR verification.",
    };
  }

  async answerQuestion(
    question: string,
    context: SanitizedInstitutionalContext,
  ): Promise<InstitutionalAIResponse> {
    const classification = validateAndClassifyQuery(question);
    if (!classification.safe) {
      return {
        provider: "rule_based",
        modelUsed: this.modelName,
        generatedAt: new Date().toISOString(),
        summary: classification.rejectionReason ?? "Query rejected for safety.",
        keyObservations: [],
        supportingMetrics: {},
        suggestedActions: [],
        confidence: "high",
      };
    }

    const stats = context.summaryStatistics;
    const intent = classification.intent;

    switch (intent) {
      case "APAAR_STATUS": {
        const obs = [
          `Total registered students eligible: ${stats.totalStudents}`,
          `Officially verified via APAAR gateway: ${stats.apaarVerifiedCount} (${stats.apaarCoveragePct}%)`,
          `Unverified or pending gateway confirmation: ${stats.totalStudents - stats.apaarVerifiedCount}`,
        ];
        return {
          provider: "rule_based",
          modelUsed: this.modelName,
          generatedAt: new Date().toISOString(),
          summary: `Currently, ${stats.apaarVerifiedCount} out of ${stats.totalStudents} students (${stats.apaarCoveragePct}%) have confirmed official APAAR verification. Note that local checksum validity does not substitute for official gateway verification.`,
          keyObservations: obs,
          supportingMetrics: {
            apaarVerifiedCount: stats.apaarVerifiedCount,
            totalStudents: stats.totalStudents,
            apaarCoveragePct: stats.apaarCoveragePct,
          },
          suggestedActions: [
            {
              priority: stats.apaarCoveragePct < 80 ? "HIGH" : "MEDIUM",
              action:
                "Use the Batch Verify APAAR feature on the Students page to verify pending cohorts.",
              responsibleRole: "Scrutiny Officer",
            },
          ],
          confidence: "high",
        };
      }

      case "DUPLICATES": {
        return {
          provider: "rule_based",
          modelUsed: this.modelName,
          generatedAt: new Date().toISOString(),
          summary: `Identity resolution identified ${stats.highConfidenceDuplicateCandidates} high-confidence duplicate pair(s) and ${stats.identifierCollisions} identifier collision(s).`,
          keyObservations: [
            `High-confidence match candidates: ${stats.highConfidenceDuplicateCandidates}`,
            `Identifier collisions: ${stats.identifierCollisions}`,
            `Review status: Unresolved candidate clusters require manual verification.`,
          ],
          supportingMetrics: {
            highConfidenceDuplicates: stats.highConfidenceDuplicateCandidates,
            identifierCollisions: stats.identifierCollisions,
          },
          suggestedActions: [
            {
              priority: stats.identifierCollisions > 0 ? "CRITICAL" : "HIGH",
              action:
                "Visit Duplicate Management to review candidate pairs and resolve duplicate records.",
              responsibleRole: "Institutional Admin",
            },
          ],
          confidence: "high",
        };
      }

      case "CORRECTIONS": {
        return {
          provider: "rule_based",
          modelUsed: this.modelName,
          generatedAt: new Date().toISOString(),
          summary: `There are ${stats.pendingCorrections} pending correction request(s), with ${stats.overdueCorrections} exceeding the 48-hour compliance SLA.`,
          keyObservations: [
            `Total pending requests: ${stats.pendingCorrections}`,
            `SLA overdue requests (>48h): ${stats.overdueCorrections}`,
          ],
          supportingMetrics: {
            pendingCorrections: stats.pendingCorrections,
            overdueCorrections: stats.overdueCorrections,
          },
          suggestedActions: [
            {
              priority: stats.overdueCorrections > 0 ? "HIGH" : "MEDIUM",
              action: "Clear overdue correction requests on the Corrections page.",
              responsibleRole: "Scrutiny Officer",
            },
          ],
          confidence: "high",
        };
      }

      case "DATA_QUALITY": {
        const top = context.topDataQualityIssues[0];
        const topDesc = top
          ? `The most frequent issue is "${top.issue}" in field "${top.field}" affecting ${top.count} records.`
          : "No critical data quality issues recorded.";
        return {
          provider: "rule_based",
          modelUsed: this.modelName,
          generatedAt: new Date().toISOString(),
          summary: `Institutional data quality index is ${stats.averageQualityScore}/100. ${stats.recordsNeedingAttention} student records currently require attention. ${topDesc}`,
          keyObservations: [
            `Average Quality Score: ${stats.averageQualityScore}/100`,
            `Records Needing Attention: ${stats.recordsNeedingAttention}`,
            `Critical Band Count: ${context.qualityDistribution.critical}`,
            `Needs Improvement Count: ${context.qualityDistribution.needsImprovement}`,
          ],
          supportingMetrics: {
            averageQualityScore: stats.averageQualityScore,
            recordsNeedingAttention: stats.recordsNeedingAttention,
          },
          suggestedActions: [
            {
              priority: stats.averageQualityScore < 70 ? "HIGH" : "MEDIUM",
              action:
                "Filter students by 'Needs Attention' in Student Registry to perform targeted field remediation.",
              responsibleRole: "Scrutiny Officer",
            },
          ],
          confidence: "high",
        };
      }

      case "INTAKE_FORECAST": {
        const progs = context.programmeSummaries;
        const lowestUtil = [...progs].sort((a, b) => a.utilizationPct - b.utilizationPct)[0];
        const highestUtil = [...progs].sort((a, b) => b.utilizationPct - a.utilizationPct)[0];
        return {
          provider: "rule_based",
          modelUsed: this.modelName,
          generatedAt: new Date().toISOString(),
          summary: `Approved intake capacity is ${stats.totalApprovedCapacity} seats across ${progs.length} programmes with ${stats.totalRegularAdmissions} regular admissions (${stats.capacityUtilizationPct}% utilization). ${lowestUtil ? `Lowest utilization is in ${lowestUtil.code} (${lowestUtil.utilizationPct}%).` : ""}`,
          keyObservations: [
            `Total approved regular capacity: ${stats.totalApprovedCapacity}`,
            `Actual regular admissions: ${stats.totalRegularAdmissions}`,
            `Overall quota utilization: ${stats.capacityUtilizationPct}%`,
            ...(highestUtil
              ? [`Highest utilization: ${highestUtil.name} (${highestUtil.utilizationPct}%)`]
              : []),
            ...(lowestUtil
              ? [`Lowest utilization: ${lowestUtil.name} (${lowestUtil.utilizationPct}%)`]
              : []),
          ],
          supportingMetrics: {
            approvedCapacity: stats.totalApprovedCapacity,
            regularAdmissions: stats.totalRegularAdmissions,
            capacityUtilizationPct: stats.capacityUtilizationPct,
          },
          suggestedActions: [
            {
              priority: "MEDIUM",
              action:
                "Review programme capacity trends and intake projections on the Programmes page.",
              responsibleRole: "Institutional Admin",
            },
          ],
          confidence: "high",
          limitations:
            "Intake calculations separate regular from supernumerary quotas. Statistical forecasts require multi-year historical intake series.",
        };
      }

      case "OPERATIONAL_RISKS": {
        const prios = context.operationalPriorities;
        return {
          provider: "rule_based",
          modelUsed: this.modelName,
          generatedAt: new Date().toISOString(),
          summary: `Identified ${prios.length} active operational priority item(s): ${prios.filter((p) => p.category === "CRITICAL").length} Critical, ${prios.filter((p) => p.category === "HIGH").length} High, and ${prios.filter((p) => p.category === "MEDIUM").length} Medium priority issues.`,
          keyObservations: prios.map((p) => `[${p.category}] ${p.title}: ${p.rationale}`),
          supportingMetrics: {
            totalPriorities: prios.length,
            criticalCount: prios.filter((p) => p.category === "CRITICAL").length,
            highCount: prios.filter((p) => p.category === "HIGH").length,
          },
          suggestedActions: prios.slice(0, 3).map((p) => ({
            priority: p.category,
            action: p.action,
            responsibleRole: p.role,
          })),
          confidence: "high",
        };
      }

      case "EXECUTIVE_SUMMARY":
      case "REGISTRY_HEALTH":
      case "GENERAL":
      default: {
        return this.generateInsights(context);
      }
    }
  }

  async generateReport(
    context: SanitizedInstitutionalContext,
    reportType: InstitutionalReportType,
  ): Promise<InstitutionalAIResponse> {
    const stats = context.summaryStatistics;
    const dateStr = new Date().toLocaleDateString("en-IN", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const reportTitles: Record<InstitutionalReportType, string> = {
      executive_summary: "Institutional Executive Summary",
      registry_health: "Student Registry Health Report",
      data_quality: "Student Data Quality Audit Report",
      corrections: "Correction Workflow & SLA Performance Report",
      duplicate_identity: "Duplicate Identity & De-duplication Review Report",
      apaar_verification: "APAAR Verification Compliance Summary",
      intake_capacity: "Programme Intake & Capacity Utilization Report",
      operational_risk: "Institutional Operational Risk & Prioritization Report",
    };

    const title = reportTitles[reportType] ?? "Institutional Report";

    const baseResponse = await this.generateInsights(context);

    return {
      provider: "rule_based",
      modelUsed: this.modelName,
      generatedAt: new Date().toISOString(),
      summary: `${title} for ${context.institutionName} (Generated: ${dateStr}). ${baseResponse.summary}`,
      keyObservations: [
        `Reporting Institution: ${context.institutionName} (${context.institutionId})`,
        `Student Registry Scope: ${stats.totalStudents} total student records evaluated`,
        ...baseResponse.keyObservations,
      ],
      supportingMetrics: baseResponse.supportingMetrics,
      suggestedActions: baseResponse.suggestedActions,
      confidence: "high",
      limitations:
        "Report compiled using deterministic EduTrace algorithms. Projections and verification statuses are grounded in current institutional registry records.",
    };
  }
}

// ── Gemini AI Provider (Primary LLM Integration) ───────────────────────────

export class GeminiInstitutionalAIProvider implements InstitutionalAIProvider {
  readonly providerName = "gemini" as const;
  private readonly apiKey: string;
  private readonly modelName: string;
  private readonly timeoutMs: number;
  private readonly fallbackProvider: RuleBasedInstitutionalAIProvider;

  constructor(options?: {
    apiKey?: string | undefined;
    modelName?: string | undefined;
    timeoutMs?: number | undefined;
  }) {
    this.apiKey = options?.apiKey ?? process.env["GEMINI_API_KEY"] ?? "";
    this.modelName = options?.modelName ?? process.env["GEMINI_MODEL"] ?? "gemini-2.0-flash";
    this.timeoutMs = options?.timeoutMs ?? 10000;
    this.fallbackProvider = new RuleBasedInstitutionalAIProvider();
  }

  get isConfigured(): boolean {
    return (
      Boolean(this.apiKey) &&
      this.apiKey.trim().length > 10 &&
      !this.apiKey.includes("your_") &&
      !this.apiKey.includes("placeholder")
    );
  }

  private buildSystemInstruction(): string {
    return `You are EduTrace Institutional AI, an expert educational data analyst for Indian higher education institutions operating under AICTE / MoE regulatory frameworks.
STRICT PRIVACY AND GROUNDING RULES:
1. You receive ONLY sanitized, aggregated institutional statistics. Never request or assume individual student PII.
2. Ground all answers and observations STRICTLY in the provided metrics. DO NOT invent or fabricate statistics, numbers, or percentages.
3. Clearly distinguish:
   - Observed facts (actual historical student counts, approved intake)
   - Statistical forecasts (projections subject to uncertainty)
   - Rule-based operational priorities
4. Do NOT interpret local Verhoeff format validity as official external APAAR verification.
5. All outputs must follow the requested JSON structure.`;
  }

  private async callGeminiApi(prompt: string): Promise<string> {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(this.modelName)}:generateContent?key=${encodeURIComponent(this.apiKey)}`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const payload = {
        contents: [
          {
            role: "user",
            parts: [{ text: prompt }],
          },
        ],
        systemInstruction: {
          parts: [{ text: this.buildSystemInstruction() }],
        },
        generationConfig: {
          responseMimeType: "application/json",
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      };

      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      if (!res.ok) {
        const errorText = await res.text().catch(() => "Unknown error");
        throw new Error(`Gemini API error (${res.status}): ${errorText}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };

      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!rawText) throw new Error("Gemini returned an empty candidate response.");
      return rawText;
    } finally {
      clearTimeout(timeout);
    }
  }

  private parseAndValidateResponse(
    rawText: string,
    fallback: InstitutionalAIResponse,
  ): InstitutionalAIResponse {
    try {
      // Strip markdown code fences if Gemini outputs ```json ... ```
      const cleaned = rawText
        .replace(/^```json\s*/i, "")
        .replace(/^```\s*/i, "")
        .replace(/```$/i, "")
        .trim();

      const parsed = JSON.parse(cleaned) as Partial<InstitutionalAIResponse>;

      if (!parsed.summary || typeof parsed.summary !== "string") {
        return fallback;
      }

      return {
        provider: "gemini",
        modelUsed: this.modelName,
        generatedAt: new Date().toISOString(),
        summary: parsed.summary,
        keyObservations: Array.isArray(parsed.keyObservations)
          ? parsed.keyObservations.filter((o) => typeof o === "string")
          : fallback.keyObservations,
        supportingMetrics: parsed.supportingMetrics ?? fallback.supportingMetrics,
        suggestedActions: Array.isArray(parsed.suggestedActions)
          ? parsed.suggestedActions.map((a) => ({
              priority: (["CRITICAL", "HIGH", "MEDIUM", "LOW"].includes(a.priority as string)
                ? a.priority
                : "MEDIUM") as PrioritySeverity,
              action: String(a.action || "Review institutional action items."),
              responsibleRole: String(a.responsibleRole || "Institutional Officer"),
            }))
          : fallback.suggestedActions,
        confidence: "high",
        limitations:
          parsed.limitations ||
          "AI-synthesized narrative based strictly on current institutional database metrics.",
      };
    } catch {
      return fallback;
    }
  }

  async generateInsights(context: SanitizedInstitutionalContext): Promise<InstitutionalAIResponse> {
    const fallback = await this.fallbackProvider.generateInsights(context);
    if (!this.isConfigured) return fallback;

    const prompt = `Context:
${JSON.stringify(context, null, 2)}

Task:
Generate a structured institutional intelligence summary for ${context.institutionName}.
Provide executive observations across Registry Health, Data Quality, Corrections, Duplicate Identity, APAAR Verification, and Intake Capacity.

Required JSON format:
{
  "summary": "Executive summary paragraph...",
  "keyObservations": ["Observation 1", "Observation 2"],
  "supportingMetrics": { "totalStudents": ..., "averageQualityScore": ... },
  "suggestedActions": [
    { "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "action": "...", "responsibleRole": "..." }
  ],
  "limitations": "..."
}`;

    try {
      const raw = await this.callGeminiApi(prompt);
      return this.parseAndValidateResponse(raw, fallback);
    } catch {
      return fallback;
    }
  }

  async answerQuestion(
    question: string,
    context: SanitizedInstitutionalContext,
  ): Promise<InstitutionalAIResponse> {
    const fallback = await this.fallbackProvider.answerQuestion(question, context);
    if (!this.isConfigured) return fallback;

    const classification = validateAndClassifyQuery(question);
    if (!classification.safe) return fallback;

    const prompt = `Context:
${JSON.stringify(context, null, 2)}

User Question:
"${question}"

Task:
Answer this institutional question accurately using ONLY the metrics in Context. If the data is unavailable or insufficient, clearly explain that.

Required JSON format:
{
  "summary": "Direct answer to the user's question grounded in actual data...",
  "keyObservations": ["Point 1", "Point 2"],
  "supportingMetrics": { ... },
  "suggestedActions": [
    { "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "action": "...", "responsibleRole": "..." }
  ]
}`;

    try {
      const raw = await this.callGeminiApi(prompt);
      return this.parseAndValidateResponse(raw, fallback);
    } catch {
      return fallback;
    }
  }

  async generateReport(
    context: SanitizedInstitutionalContext,
    reportType: InstitutionalReportType,
  ): Promise<InstitutionalAIResponse> {
    const fallback = await this.fallbackProvider.generateReport(context, reportType);
    if (!this.isConfigured) return fallback;

    const prompt = `Context:
${JSON.stringify(context, null, 2)}

Report Type: ${reportType}

Task:
Generate an executive narrative for an official institutional report of type "${reportType}".
Ground all findings in the actual numbers provided.

Required JSON format:
{
  "summary": "Official executive narrative for the report...",
  "keyObservations": ["Finding 1", "Finding 2"],
  "supportingMetrics": { ... },
  "suggestedActions": [
    { "priority": "CRITICAL" | "HIGH" | "MEDIUM" | "LOW", "action": "...", "responsibleRole": "..." }
  ],
  "limitations": "..."
}`;

    try {
      const raw = await this.callGeminiApi(prompt);
      return this.parseAndValidateResponse(raw, fallback);
    } catch {
      return fallback;
    }
  }
}

// ── Provider Resolver ──────────────────────────────────────────────────────

export function resolveInstitutionalAIProvider(options?: {
  apiKey?: string | undefined;
  modelName?: string | undefined;
  forceRuleBased?: boolean | undefined;
}): {
  provider: InstitutionalAIProvider;
  status: "gemini" | "rule_based";
  isGeminiConfigured: boolean;
} {
  if (options?.forceRuleBased) {
    return {
      provider: new RuleBasedInstitutionalAIProvider(),
      status: "rule_based",
      isGeminiConfigured: false,
    };
  }

  const geminiProvider = new GeminiInstitutionalAIProvider({
    apiKey: options?.apiKey,
    modelName: options?.modelName,
  });

  if (geminiProvider.isConfigured) {
    return {
      provider: geminiProvider,
      status: "gemini",
      isGeminiConfigured: true,
    };
  }

  return {
    provider: new RuleBasedInstitutionalAIProvider(),
    status: "rule_based",
    isGeminiConfigured: false,
  };
}
