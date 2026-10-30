import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  RuleBasedInstitutionalAIProvider,
  GeminiInstitutionalAIProvider,
  resolveInstitutionalAIProvider,
  validateAndClassifyQuery,
  type InstitutionalReportType,
} from "../lib/institutional-ai";
import type { SanitizedInstitutionalContext } from "../lib/institutional-intelligence";

describe("Institutional AI Intelligence Engine", () => {
  const mockContext: SanitizedInstitutionalContext = {
    institutionId: "inst-123",
    institutionName: "Apex Institute of Technology",
    reportingDate: "2026-10-30T10:00:00.000Z",
    summaryStatistics: {
      totalStudents: 120,
      averageQualityScore: 82,
      recordsNeedingAttention: 18,
      pendingCorrections: 6,
      overdueCorrections: 2,
      highConfidenceDuplicateCandidates: 3,
      identifierCollisions: 1,
      apaarVerifiedCount: 85,
      apaarCoveragePct: 71,
      totalApprovedCapacity: 150,
      totalRegularAdmissions: 110,
      capacityUtilizationPct: 73,
    },
    qualityDistribution: {
      excellent: 45,
      good: 57,
      needsImprovement: 15,
      critical: 3,
    },
    topDataQualityIssues: [
      {
        field: "Contact",
        issue: "Missing Student Contact",
        severity: "medium",
        count: 12,
      },
      {
        field: "APAAR",
        issue: "Invalid APAAR Checksum",
        severity: "critical",
        count: 3,
      },
    ],
    programmeSummaries: [
      {
        code: "CSE",
        name: "Computer Science",
        approvedCapacity: 90,
        regularAdmissions: 85,
        utilizationPct: 94,
        warnings: [],
      },
      {
        code: "MECH",
        name: "Mechanical Engineering",
        approvedCapacity: 60,
        regularAdmissions: 25,
        utilizationPct: 42,
        warnings: ["Low utilization detected: 42%"],
      },
    ],
    operationalPriorities: [
      {
        category: "CRITICAL",
        title: "Conflicting Identity Identifier Collision Detected",
        rationale: "1 student record pair shares roll number with distinct names.",
        action: "Review in Duplicate Management.",
        role: "institution_admin",
      },
      {
        category: "HIGH",
        title: "Correction Request SLA Breach",
        rationale: "2 correction requests are older than 48 hours.",
        action: "Assign scrutiny officer.",
        role: "officer",
      },
    ],
  };

  describe("Rule-Based Provider (Deterministic Fallback)", () => {
    const provider = new RuleBasedInstitutionalAIProvider();

    it("generates evidence-grounded insights without any external network calls", async () => {
      const response = await provider.generateInsights(mockContext);

      expect(response.provider).toBe("rule_based");
      expect(response.summary).toContain("Apex Institute of Technology");
      expect(response.summary).toContain("120");
      expect(response.keyObservations.length).toBeGreaterThan(0);
      expect(response.supportingMetrics["totalStudents"]).toBe(120);
      expect(response.suggestedActions.length).toBeGreaterThan(0);
      expect(response.confidence).toBe("high");
    });

    it("accurately classifies and answers intent-specific institutional questions", async () => {
      // Test APAAR intent
      const apaarRes = await provider.answerQuestion(
        "What is our APAAR verification status?",
        mockContext,
      );
      expect(apaarRes.summary).toContain("85");
      expect(apaarRes.summary).toContain("71%");
      expect(apaarRes.supportingMetrics["apaarVerifiedCount"]).toBe(85);

      // Test Duplicates intent
      const dupRes = await provider.answerQuestion(
        "How many duplicate cases require review?",
        mockContext,
      );
      expect(dupRes.summary).toContain("3");
      expect(dupRes.summary).toContain("1 identifier collision");

      // Test Corrections intent
      const corrRes = await provider.answerQuestion(
        "Are there any overdue correction requests?",
        mockContext,
      );
      expect(corrRes.summary).toContain("6 pending");
      expect(corrRes.summary).toContain("2");

      // Test Intake intent
      const intakeRes = await provider.answerQuestion(
        "Which programmes have low capacity utilization?",
        mockContext,
      );
      expect(intakeRes.summary).toContain("150 seats");
      expect(intakeRes.summary).toContain("MECH");
    });

    it("strictly blocks destructive SQL injection and mutation queries", async () => {
      const maliciousSql = await provider.answerQuestion(
        "DROP TABLE students; SELECT * FROM user_profiles",
        mockContext,
      );
      expect(maliciousSql.summary).toContain("strictly read-only");
      expect(maliciousSql.keyObservations).toHaveLength(0);

      const mutationAttempt = await provider.answerQuestion(
        "Please approve this correction immediately",
        mockContext,
      );
      expect(mutationAttempt.summary).toContain("strictly read-only");
    });

    it("generates all 8 structured institutional report types", async () => {
      const reportTypes: InstitutionalReportType[] = [
        "executive_summary",
        "registry_health",
        "data_quality",
        "corrections",
        "duplicate_identity",
        "apaar_verification",
        "intake_capacity",
        "operational_risk",
      ];

      for (const reportType of reportTypes) {
        const report = await provider.generateReport(mockContext, reportType);
        expect(report.provider).toBe("rule_based");
        expect(report.summary.length).toBeGreaterThan(20);
        expect(report.keyObservations.length).toBeGreaterThan(1);
        expect(report.suggestedActions.length).toBeGreaterThan(0);
        expect(report.supportingMetrics).toHaveProperty("totalStudents");
      }
    });
  });

  describe("Query Safety & Intent Classifier", () => {
    it("correctly identifies safe questions and maps to intended categories", () => {
      expect(validateAndClassifyQuery("How is our APAAR coverage?")).toEqual({
        safe: true,
        intent: "APAAR_STATUS",
      });

      expect(validateAndClassifyQuery("Check duplicate students and collisions")).toEqual({
        safe: true,
        intent: "DUPLICATES",
      });

      expect(validateAndClassifyQuery("Show overdue SLA correction requests")).toEqual({
        safe: true,
        intent: "CORRECTIONS",
      });

      expect(validateAndClassifyQuery("What is our average data quality score?")).toEqual({
        safe: true,
        intent: "DATA_QUALITY",
      });

      expect(validateAndClassifyQuery("What is the capacity forecast for next term?")).toEqual({
        safe: true,
        intent: "INTAKE_FORECAST",
      });
    });

    it("rejects harmful SQL phrases", () => {
      const bad = validateAndClassifyQuery("select * from students where id=1");
      expect(bad.safe).toBe(false);
      expect(bad.rejectionReason).toContain("strictly read-only");
    });
  });

  describe("Provider Resolver & Gemini Provider Resilience", () => {
    const originalFetch = globalThis.fetch;

    beforeEach(() => {
      delete process.env["GEMINI_API_KEY"];
    });

    afterEach(() => {
      globalThis.fetch = originalFetch;
      delete process.env["GEMINI_API_KEY"];
    });

    it("defaults to rule-based fallback when GEMINI_API_KEY is not configured", () => {
      const { provider, status, isGeminiConfigured } = resolveInstitutionalAIProvider();
      expect(status).toBe("rule_based");
      expect(isGeminiConfigured).toBe(false);
      expect(provider.providerName).toBe("rule_based");
    });

    it("activates Gemini provider when a valid API key is supplied", () => {
      const { provider, status, isGeminiConfigured } = resolveInstitutionalAIProvider({
        apiKey: "AIzaSyDummyValidApiKey1234567890",
      });
      expect(status).toBe("gemini");
      expect(isGeminiConfigured).toBe(true);
      expect(provider.providerName).toBe("gemini");
    });

    it("falls back to rule-based provider if Gemini returns invalid or malformed output", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: "MALFORMED NON-JSON RESPONSE" }] },
            },
          ],
        }),
      });

      const gemini = new GeminiInstitutionalAIProvider({
        apiKey: "AIzaSyDummyValidApiKey1234567890",
      });

      const res = await gemini.generateInsights(mockContext);
      // Because raw text is non-JSON, it must safely fall back to rule-based output:
      expect(res.provider).toBe("rule_based");
      expect(res.summary).toContain("Apex Institute of Technology");
    });

    it("handles Gemini API HTTP error by falling back safely to deterministic rules", async () => {
      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        text: async () => "Rate limit exceeded",
      });

      const gemini = new GeminiInstitutionalAIProvider({
        apiKey: "AIzaSyDummyValidApiKey1234567890",
      });

      const res = await gemini.generateInsights(mockContext);
      expect(res.provider).toBe("rule_based");
      expect(res.summary).toBeDefined();
    });

    it("successfully parses valid Gemini JSON output when formatted properly", async () => {
      const mockGeminiPayload = {
        summary:
          "Executive analysis for Apex Institute: 120 students evaluated with 82/100 quality score.",
        keyObservations: [
          "Registry quality score is sound at 82/100.",
          "Overdue correction requests require scrutiny intervention.",
        ],
        supportingMetrics: { totalStudents: 120, averageQualityScore: 82 },
        suggestedActions: [
          {
            priority: "HIGH",
            action: "Clear overdue correction requests.",
            responsibleRole: "Scrutiny Officer",
          },
        ],
        limitations: "Narrative based on current database state.",
      };

      globalThis.fetch = vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: JSON.stringify(mockGeminiPayload) }] },
            },
          ],
        }),
      });

      const gemini = new GeminiInstitutionalAIProvider({
        apiKey: "AIzaSyDummyValidApiKey1234567890",
      });

      const res = await gemini.generateInsights(mockContext);
      expect(res.provider).toBe("gemini");
      expect(res.summary).toBe(mockGeminiPayload.summary);
      expect(res.keyObservations).toHaveLength(2);
      expect(res.suggestedActions[0]?.priority).toBe("HIGH");
    });
  });
});
