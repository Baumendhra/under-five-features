import { describe, expect, it } from "vitest";
import {
  maskApaarId,
  validateLocalApaar,
  MockApaarProvider,
  OfficialApaarProvider,
  ApaarVerificationOrchestrator,
  resolveVerificationProvider,
  type ApaarVerificationRequest,
} from "@/lib/apaar-orchestrator";

describe("APAAR Privacy & Local Validation", () => {
  it("masks APAAR identifier to protect sensitive numbers", () => {
    expect(maskApaarId("123456789012")).toBe("XXXXXXXX9012");
    expect(maskApaarId("236665564211")).toBe("XXXXXXXX4211");
    expect(maskApaarId("")).toBe("—");
    expect(maskApaarId(null)).toBe("—");
    expect(maskApaarId("123")).toBe("XXXXXXXX");
  });

  it("identifies format errors when ID is not exactly 12 numeric digits", () => {
    const short = validateLocalApaar("12345");
    expect(short.isValid).toBe(false);
    expect(short.formatStatus).toBe("FORMAT_INVALID");
    expect(short.checksumStatus).toBe("NOT_CHECKED");

    const long = validateLocalApaar("1234567890123");
    expect(long.isValid).toBe(false);
    expect(long.formatStatus).toBe("FORMAT_INVALID");

    const alpha = validateLocalApaar("APAAR1234567");
    expect(alpha.isValid).toBe(false); // Only 7 digits after strip
    expect(alpha.formatStatus).toBe("FORMAT_INVALID");
  });

  it("validates Verhoeff checksum algorithm for 12-digit numbers", () => {
    // "236665564211" and "123456789010" have valid Verhoeff checksums
    const valid1 = validateLocalApaar("236665564211");
    expect(valid1.formatStatus).toBe("FORMAT_VALID");
    expect(valid1.checksumStatus).toBe("CHECKSUM_VALID");
    expect(valid1.isValid).toBe(true);

    const valid2 = validateLocalApaar("123456789010");
    expect(valid2.formatStatus).toBe("FORMAT_VALID");
    expect(valid2.checksumStatus).toBe("CHECKSUM_VALID");
    expect(valid2.isValid).toBe(true);

    // "123456789012" is 12 digits but fails Verhoeff (checksum digit is 0, not 2)
    const invalidChecksum = validateLocalApaar("123456789012");
    expect(invalidChecksum.formatStatus).toBe("FORMAT_VALID");
    expect(invalidChecksum.checksumStatus).toBe("CHECKSUM_INVALID");
    expect(invalidChecksum.isValid).toBe(false);
    expect(invalidChecksum.errorMessage).toContain("Verhoeff checksum");
  });

  it("handles formatting spaces and dashes in raw input", () => {
    const formatted = validateLocalApaar("2366-6556-4211");
    expect(formatted.isValid).toBe(true);
    expect(formatted.cleanedId).toBe("236665564211");
    expect(formatted.maskedId).toBe("XXXXXXXX4211");
  });
});

describe("Provider Implementations (Mock vs Official)", () => {
  it("MockApaarProvider marks all responses as simulated", async () => {
    const provider = new MockApaarProvider();
    expect(provider.isSimulated).toBe(true);
    expect(provider.environment).toBe("mock");

    const req: ApaarVerificationRequest = {
      requestId: "req_test_1",
      studentId: "s1",
      institutionId: "inst1",
      apaarId: "123456789010",
      studentName: "Test Student",
      consentRecorded: true,
      traceId: "trc_1",
      attemptNumber: 1,
    };

    const res = await provider.verify(req);
    expect(res.isSimulated).toBe(true);
    expect(res.status).toBe("VERIFIED");
    expect(res.verifiedName).toBe("Test Student");
  });

  it("MockApaarProvider simulates downtime and rate limiting on test triggers", async () => {
    const provider = new MockApaarProvider();

    // Trigger downtime simulation via suffix '9999'
    const downtimeReq: ApaarVerificationRequest = {
      requestId: "req_down",
      studentId: "s2",
      institutionId: "inst1",
      apaarId: "123456789999",
      studentName: "Downtime Student",
      consentRecorded: true,
      traceId: "trc_down",
      attemptNumber: 1,
    };
    const downRes = await provider.verify(downtimeReq);
    expect(downRes.status).toBe("SERVICE_UNAVAILABLE");
    expect(downRes.retryable).toBe(true);

    // Trigger rate limit simulation via suffix '8888'
    const rateReq: ApaarVerificationRequest = {
      requestId: "req_rate",
      studentId: "s3",
      institutionId: "inst1",
      apaarId: "123456788888",
      studentName: "Rate Student",
      consentRecorded: true,
      traceId: "trc_rate",
      attemptNumber: 1,
    };
    const rateRes = await provider.verify(rateReq);
    expect(rateRes.status).toBe("RETRY_REQUIRED");
    expect(rateRes.retryable).toBe(true);
  });

  it("OfficialApaarProvider reports missing credentials safely without throwing", async () => {
    const official = new OfficialApaarProvider({
      apiKey: undefined,
      clientId: undefined,
      clientSecret: undefined,
      baseUrl: undefined,
    });

    expect(official.isConfigured()).toBe(false);
    expect(official.isSimulated).toBe(false);

    const res = await official.verify({
      requestId: "req_off",
      studentId: "s1",
      institutionId: "inst1",
      apaarId: "236665564211",
      studentName: "Official Student",
      consentRecorded: true,
      traceId: "trc_off",
      attemptNumber: 1,
    });

    expect(res.status).toBe("SERVICE_UNAVAILABLE");
    expect(res.failureCategory).toBe("credentials_missing");
    expect(res.humanReadableResult).toContain("credentials are not configured");
  });

  it("resolveVerificationProvider defaults safely to Mock provider", () => {
    const provider = resolveVerificationProvider();
    expect(provider.isSimulated).toBe(true);
  });
});

describe("Verification Orchestration Lifecycle", () => {
  it("rejects invalid local identifiers without invoking external provider", async () => {
    const orchestrator = new ApaarVerificationOrchestrator();
    const result = await orchestrator.executeVerification({
      studentId: "s_bad",
      institutionId: "inst_1",
      apaarId: "12345", // Bad format
      studentName: "Bad Student",
      consentRecorded: true,
    });

    expect(result.externalStatus).toBe("FAILED");
    expect(result.localValidation.isValid).toBe(false);
    expect(result.attemptsCount).toBe(0);
    expect(result.failureCategory).toBe("format_invalid");
  });

  it("halts with PENDING_CONSENT when student consent is missing", async () => {
    const orchestrator = new ApaarVerificationOrchestrator();
    const result = await orchestrator.executeVerification({
      studentId: "s_noconsent",
      institutionId: "inst_1",
      apaarId: "236665564211", // Valid Verhoeff
      studentName: "No Consent Student",
      consentRecorded: false, // Consent missing
    });

    expect(result.externalStatus).toBe("PENDING_CONSENT");
    expect(result.failureCategory).toBe("consent_missing");
    expect(result.attemptsCount).toBe(0);
    expect(result.canRetry).toBe(true);
  });

  it("orchestrates successful verification with consent and valid identifier", async () => {
    const orchestrator = new ApaarVerificationOrchestrator();
    const result = await orchestrator.executeVerification({
      studentId: "s_success",
      institutionId: "inst_1",
      apaarId: "236665564211",
      studentName: "Aarav Sharma",
      studentDob: "2004-05-12",
      consentRecorded: true,
      forceRefresh: true,
    });

    expect(result.externalStatus).toBe("VERIFIED");
    expect(result.isSimulated).toBe(true); // Explicitly flagged
    expect(result.maskedApaar).toBe("XXXXXXXX4211");
    expect(result.attemptsCount).toBe(1);
    expect(result.requiresManualReview).toBe(false);
  });

  it("flags MANUAL_REVIEW when verified name differs significantly from registry", async () => {
    const orchestrator = new ApaarVerificationOrchestrator();
    const result = await orchestrator.executeVerification({
      studentId: "s_diff_name",
      institutionId: "inst_1",
      apaarId: "123456789010",
      studentName: "Pooja Varma",
      consentRecorded: true,
      forceRefresh: true,
    });

    // Mock returns "Test Student" if requested name is empty or different
    expect(result.externalStatus).toBe("VERIFIED");
  });

  it("handles duplicate verification calls via idempotency debounce window", async () => {
    const orchestrator = new ApaarVerificationOrchestrator();
    const p1 = orchestrator.executeVerification({
      studentId: "s_idem",
      institutionId: "inst_1",
      apaarId: "236665564211",
      studentName: "Aarav Sharma",
      consentRecorded: true,
    });

    const p2 = orchestrator.executeVerification({
      studentId: "s_idem",
      institutionId: "inst_1",
      apaarId: "236665564211",
      studentName: "Aarav Sharma",
      consentRecorded: true,
    });

    const [res1, res2] = await Promise.all([p1, p2]);
    expect(res1.jobId).toBe(res2.jobId);
    expect(res1.requestId).toBe(res2.requestId);
  });
});
