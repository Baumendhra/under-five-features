// ============================================================================
// EduTrace: APAAR Verification Orchestration & Identity Verification Engine
// Handles local validation, external providers, backoff retries, and normalization.
// ============================================================================

import { validateVerhoeff } from "@/lib/data-quality";

// ── 1. Status Architecture ────────────────────────────────────────────────

export type LocalValidationStatus =
  "NOT_CHECKED" | "FORMAT_VALID" | "FORMAT_INVALID" | "CHECKSUM_VALID" | "CHECKSUM_INVALID";

export type ExternalVerificationStatus =
  | "NOT_SUBMITTED"
  | "PENDING_CONSENT"
  | "QUEUED"
  | "PROCESSING"
  | "VERIFIED"
  | "FAILED"
  | "MANUAL_REVIEW"
  | "RETRY_REQUIRED"
  | "SERVICE_UNAVAILABLE";

export type FailureCategory =
  | "format_invalid"
  | "checksum_invalid"
  | "consent_missing"
  | "not_found"
  | "name_mismatch"
  | "dob_mismatch"
  | "network_timeout"
  | "rate_limited"
  | "credentials_missing"
  | "service_unavailable";

// ── 2. Data Types & Contracts ─────────────────────────────────────────────

export interface LocalApaarValidationResult {
  formatStatus: LocalValidationStatus;
  checksumStatus: LocalValidationStatus;
  isValid: boolean;
  cleanedId: string | null;
  maskedId: string;
  errorMessage?: string | undefined;
}

export interface ApaarVerificationRequest {
  requestId: string;
  studentId: string;
  institutionId: string;
  apaarId: string;
  studentName: string;
  studentDob?: string | null | undefined;
  consentRecorded: boolean;
  traceId: string;
  attemptNumber: number;
}

export interface ApaarVerificationResponse {
  requestId: string;
  providerReference?: string | undefined;
  status: ExternalVerificationStatus;
  isSimulated: boolean;
  providerName: string;
  providerEnvironment: "mock" | "sandbox" | "production";
  failureCategory?: FailureCategory | undefined;
  humanReadableResult: string;
  verificationMethod: "mock_registry" | "official_abc_api" | "sandbox_abc_api";
  verifiedName?: string | undefined;
  verifiedDob?: string | undefined;
  requestTimestamp: string;
  responseTimestamp: string;
  retryable: boolean;
}

export interface OrchestratedVerificationResult {
  jobId: string;
  requestId: string;
  studentId: string;
  institutionId: string;
  maskedApaar: string;
  localValidation: LocalApaarValidationResult;
  externalStatus: ExternalVerificationStatus;
  isSimulated: boolean;
  providerName: string;
  providerEnvironment: "mock" | "sandbox" | "production";
  failureCategory?: FailureCategory | undefined;
  humanReadableResult: string;
  verifiedName?: string | undefined;
  verifiedDob?: string | undefined;
  attemptsCount: number;
  completedAt?: string | undefined;
  requiresManualReview: boolean;
  canRetry: boolean;
}

export interface ApaarVerificationProvider {
  readonly providerId: string;
  readonly isSimulated: boolean;
  readonly environment: "mock" | "sandbox" | "production";
  verify(request: ApaarVerificationRequest): Promise<ApaarVerificationResponse>;
}

// ── 3. Sensitive Data Masking & Local Validation ──────────────────────────

/**
 * Masks APAAR ID to protect student privacy in logs and UI.
 * e.g., "123456789012" -> "XXXXXXXX9012"
 */
export function maskApaarId(raw: string | null | undefined): string {
  if (!raw) return "—";
  const cleaned = raw.replace(/\D/g, "");
  if (cleaned.length < 4) return "XXXXXXXX";
  const last4 = cleaned.slice(-4);
  return `XXXXXXXX${last4}`;
}

/**
 * Validates APAAR identifier locally:
 * 1. Checks exact 12-digit numeric constraint.
 * 2. Runs Verhoeff checksum algorithm (Indian National ID / APAAR standard).
 * A locally valid identifier must NEVER be treated as externally verified.
 */
export function validateLocalApaar(raw: string | null | undefined): LocalApaarValidationResult {
  if (!raw) {
    return {
      formatStatus: "FORMAT_INVALID",
      checksumStatus: "NOT_CHECKED",
      isValid: false,
      cleanedId: null,
      maskedId: "—",
      errorMessage: "APAAR identifier is missing or empty.",
    };
  }

  const cleaned = raw.replace(/\D/g, "");
  const maskedId = maskApaarId(cleaned);

  // 1. Format check: exactly 12 numeric digits
  if (cleaned.length !== 12) {
    return {
      formatStatus: "FORMAT_INVALID",
      checksumStatus: "NOT_CHECKED",
      isValid: false,
      cleanedId: cleaned,
      maskedId,
      errorMessage: `APAAR ID must be exactly 12 digits (found ${cleaned.length} digits).`,
    };
  }

  // 2. Verhoeff checksum algorithm check
  const isChecksumValid = validateVerhoeff(cleaned);
  if (!isChecksumValid) {
    return {
      formatStatus: "FORMAT_VALID",
      checksumStatus: "CHECKSUM_INVALID",
      isValid: false,
      cleanedId: cleaned,
      maskedId,
      errorMessage:
        "APAAR identifier failed Verhoeff checksum validation (possible typographical mistake).",
    };
  }

  return {
    formatStatus: "FORMAT_VALID",
    checksumStatus: "CHECKSUM_VALID",
    isValid: true,
    cleanedId: cleaned,
    maskedId,
  };
}

// ── 4. Provider Implementations ───────────────────────────────────────────

/**
 * Known deterministic mock IDs for tests and SIH Hackathon demonstration.
 */
const MOCK_KNOWN_VERIFIED_IDS = new Set([
  "123456789010", // Valid Verhoeff 12-digit
  "236665564211", // Valid Verhoeff 12-digit
  "123456789012",
  "234567890123",
  "345678901234",
  "456789012345",
  "567890123456",
  "678901234567",
  "789012345678",
  "890123456789",
  "901234567890",
  "012345678901",
]);

/**
 * MockApaarProvider:
 * Preserves deterministic demonstration capabilities while explicitly flagging
 * every response as simulated. Never reports simulated success as official.
 */
export class MockApaarProvider implements ApaarVerificationProvider {
  readonly providerId = "mock_digilocker_abc";
  readonly isSimulated = true;
  readonly environment = "mock" as const;

  async verify(request: ApaarVerificationRequest): Promise<ApaarVerificationResponse> {
    const reqTimestamp = new Date().toISOString();
    // Simulate brief network latency
    await new Promise((r) => setTimeout(r, 30));
    const respTimestamp = new Date().toISOString();

    const cleaned = request.apaarId.replace(/\D/g, "");

    // Simulated test scenarios:
    if (cleaned.endsWith("9999")) {
      // Simulate temporary service downtime
      return {
        requestId: request.requestId,
        status: "SERVICE_UNAVAILABLE",
        isSimulated: true,
        providerName: "Mock DigiLocker/ABC Simulator",
        providerEnvironment: "mock",
        failureCategory: "service_unavailable",
        humanReadableResult:
          "Simulated Provider Downtime: Gateway timed out responding to APAAR lookup.",
        verificationMethod: "mock_registry",
        requestTimestamp: reqTimestamp,
        responseTimestamp: respTimestamp,
        retryable: true,
      };
    }

    if (cleaned.endsWith("8888")) {
      // Simulate rate limiting
      return {
        requestId: request.requestId,
        status: "RETRY_REQUIRED",
        isSimulated: true,
        providerName: "Mock DigiLocker/ABC Simulator",
        providerEnvironment: "mock",
        failureCategory: "rate_limited",
        humanReadableResult:
          "Simulated Rate Limit: Request throttled by simulated upstream gateway.",
        verificationMethod: "mock_registry",
        requestTimestamp: reqTimestamp,
        responseTimestamp: respTimestamp,
        retryable: true,
      };
    }

    if (MOCK_KNOWN_VERIFIED_IDS.has(cleaned)) {
      return {
        requestId: request.requestId,
        providerReference: `MOCK_REF_${Date.now()}`,
        status: "VERIFIED",
        isSimulated: true,
        providerName: "Mock DigiLocker/ABC Simulator",
        providerEnvironment: "mock",
        humanReadableResult:
          "Simulated Verification Success: Record matched in simulated DigiLocker registry.",
        verificationMethod: "mock_registry",
        verifiedName: request.studentName || "Verified Student",
        verifiedDob: request.studentDob ?? "2005-01-01",
        requestTimestamp: reqTimestamp,
        responseTimestamp: respTimestamp,
        retryable: false,
      };
    }

    // Default: Not found in mock registry
    return {
      requestId: request.requestId,
      status: "FAILED",
      isSimulated: true,
      providerName: "Mock DigiLocker/ABC Simulator",
      providerEnvironment: "mock",
      failureCategory: "not_found",
      humanReadableResult:
        "Record not found: APAAR ID is not registered in the simulated national database.",
      verificationMethod: "mock_registry",
      requestTimestamp: reqTimestamp,
      responseTimestamp: respTimestamp,
      retryable: false,
    };
  }
}

/**
 * OfficialApaarProvider:
 * Production-ready driver for connecting to an authorized API Setu / ABC gateway.
 * Strictly verifies server-side credentials and refuses to simulate live data.
 */
export class OfficialApaarProvider implements ApaarVerificationProvider {
  readonly providerId = "official_academic_bank_of_credits";
  readonly isSimulated = false;
  readonly environment: "sandbox" | "production";

  private apiKey?: string | undefined;
  private clientId?: string | undefined;
  private clientSecret?: string | undefined;
  private baseUrl?: string | undefined;

  constructor(options?: {
    apiKey?: string | undefined;
    clientId?: string | undefined;
    clientSecret?: string | undefined;
    baseUrl?: string | undefined;
    environment?: "sandbox" | "production" | undefined;
  }) {
    this.apiKey = options?.apiKey ?? process.env["APAAR_API_KEY"];
    this.clientId = options?.clientId ?? process.env["APAAR_CLIENT_ID"];
    this.clientSecret = options?.clientSecret ?? process.env["APAAR_CLIENT_SECRET"];
    this.baseUrl = options?.baseUrl ?? process.env["APAAR_BASE_URL"];
    this.environment =
      options?.environment ?? (process.env["NODE_ENV"] === "production" ? "production" : "sandbox");
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.clientId && this.clientSecret && this.baseUrl);
  }

  async verify(request: ApaarVerificationRequest): Promise<ApaarVerificationResponse> {
    const reqTimestamp = new Date().toISOString();

    if (!this.isConfigured()) {
      return {
        requestId: request.requestId,
        status: "SERVICE_UNAVAILABLE",
        isSimulated: false,
        providerName: "Official Academic Bank of Credits (API Setu)",
        providerEnvironment: this.environment,
        failureCategory: "credentials_missing",
        humanReadableResult:
          "Official ABC/APAAR gateway credentials are not configured in the server environment. " +
          "To enable live verification, provide APAAR_API_KEY, APAAR_CLIENT_ID, APAAR_CLIENT_SECRET, and APAAR_BASE_URL.",
        verificationMethod:
          this.environment === "production" ? "official_abc_api" : "sandbox_abc_api",
        requestTimestamp: reqTimestamp,
        responseTimestamp: new Date().toISOString(),
        retryable: false,
      };
    }

    // When authorized credentials are confirmed, dispatch official mTLS / signed request
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${this.baseUrl}/v1/apaar/verify`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-API-Key": this.apiKey!,
          "X-Client-Id": this.clientId!,
          "X-Trace-Id": request.traceId,
        },
        body: JSON.stringify({
          apaarId: request.apaarId,
          name: request.studentName,
          dob: request.studentDob,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const respTimestamp = new Date().toISOString();

      if (response.status === 429) {
        return {
          requestId: request.requestId,
          status: "RETRY_REQUIRED",
          isSimulated: false,
          providerName: "Official Academic Bank of Credits (API Setu)",
          providerEnvironment: this.environment,
          failureCategory: "rate_limited",
          humanReadableResult:
            "Official API rate limit exceeded. Retry scheduled via exponential backoff.",
          verificationMethod:
            this.environment === "production" ? "official_abc_api" : "sandbox_abc_api",
          requestTimestamp: reqTimestamp,
          responseTimestamp: respTimestamp,
          retryable: true,
        };
      }

      if (!response.ok) {
        return {
          requestId: request.requestId,
          status: "SERVICE_UNAVAILABLE",
          isSimulated: false,
          providerName: "Official Academic Bank of Credits (API Setu)",
          providerEnvironment: this.environment,
          failureCategory: "service_unavailable",
          humanReadableResult: `Upstream gateway returned HTTP status ${response.status}.`,
          verificationMethod:
            this.environment === "production" ? "official_abc_api" : "sandbox_abc_api",
          requestTimestamp: reqTimestamp,
          responseTimestamp: respTimestamp,
          retryable: response.status >= 500,
        };
      }

      const body = await response.json();
      return {
        requestId: request.requestId,
        providerReference: body.referenceId ?? body.txnId,
        status: body.verified ? "VERIFIED" : "FAILED",
        isSimulated: false,
        providerName: "Official Academic Bank of Credits (API Setu)",
        providerEnvironment: this.environment,
        failureCategory: body.verified ? undefined : "not_found",
        humanReadableResult:
          body.message ??
          (body.verified ? "Official APAAR verification succeeded." : "Record not found."),
        verificationMethod:
          this.environment === "production" ? "official_abc_api" : "sandbox_abc_api",
        verifiedName: body.verifiedName,
        verifiedDob: body.verifiedDob,
        requestTimestamp: reqTimestamp,
        responseTimestamp: respTimestamp,
        retryable: false,
      };
    } catch (err: unknown) {
      const isTimeout = err instanceof Error && err.name === "AbortError";
      return {
        requestId: request.requestId,
        status: "SERVICE_UNAVAILABLE",
        isSimulated: false,
        providerName: "Official Academic Bank of Credits (API Setu)",
        providerEnvironment: this.environment,
        failureCategory: isTimeout ? "network_timeout" : "service_unavailable",
        humanReadableResult: isTimeout
          ? "Official gateway connection timed out after 8000ms."
          : `Network error connecting to official ABC gateway: ${err instanceof Error ? err.message : String(err)}`,
        verificationMethod:
          this.environment === "production" ? "official_abc_api" : "sandbox_abc_api",
        requestTimestamp: reqTimestamp,
        responseTimestamp: new Date().toISOString(),
        retryable: true,
      };
    }
  }
}

// ── 5. Provider Factory ───────────────────────────────────────────────────

export function resolveVerificationProvider(
  forcedMode?: "mock" | "official",
): ApaarVerificationProvider {
  if (forcedMode === "official") {
    return new OfficialApaarProvider();
  }
  if (forcedMode === "mock") {
    return new MockApaarProvider();
  }

  // Auto-detect from environment
  const envMode = process.env["APAAR_PROVIDER"];
  if (envMode === "official") {
    const official = new OfficialApaarProvider();
    if (official.isConfigured()) return official;
  }

  return new MockApaarProvider();
}

// ── 6. Verification Orchestrator Engine ───────────────────────────────────

/**
 * In-memory idempotency caches:
 * - inFlightJobs: handles concurrent in-flight requests for the same student
 * - completedJobsCache: short debounce window (10s) for recent results
 */
const inFlightJobs = new Map<string, Promise<OrchestratedVerificationResult>>();
const completedJobsCache = new Map<
  string,
  { timestamp: number; result: OrchestratedVerificationResult }
>();

export class ApaarVerificationOrchestrator {
  private provider: ApaarVerificationProvider;
  private maxRetries: number;
  private initialBackoffMs: number;

  constructor(options?: {
    provider?: ApaarVerificationProvider | undefined;
    maxRetries?: number | undefined;
    initialBackoffMs?: number | undefined;
  }) {
    this.provider = options?.provider ?? resolveVerificationProvider();
    this.maxRetries = options?.maxRetries ?? 3;
    this.initialBackoffMs = options?.initialBackoffMs ?? 50;
  }

  /**
   * Orchestrates the complete end-to-end verification lifecycle.
   */
  async executeVerification(input: {
    studentId: string;
    institutionId: string;
    apaarId: string | null | undefined;
    studentName: string;
    studentDob?: string | null | undefined;
    consentRecorded?: boolean | undefined;
    forceRefresh?: boolean | undefined;
  }): Promise<OrchestratedVerificationResult> {
    const idempotencyKey = `${input.institutionId}:${input.studentId}:${input.apaarId ?? "none"}`;

    // 1. Return existing in-flight promise if already processing concurrently
    if (!input.forceRefresh && inFlightJobs.has(idempotencyKey)) {
      return inFlightJobs.get(idempotencyKey)!;
    }

    // 2. Return recent cached result within debounce window
    if (!input.forceRefresh && completedJobsCache.has(idempotencyKey)) {
      const cached = completedJobsCache.get(idempotencyKey)!;
      if (Date.now() - cached.timestamp < 10000) {
        return cached.result;
      }
    }

    // Launch execution promise and register in flight
    const jobPromise = this.internalExecute(input);
    if (!input.forceRefresh) {
      inFlightJobs.set(idempotencyKey, jobPromise);
    }

    try {
      const result = await jobPromise;
      if (!input.forceRefresh) {
        completedJobsCache.set(idempotencyKey, { timestamp: Date.now(), result });
      }
      return result;
    } finally {
      inFlightJobs.delete(idempotencyKey);
    }
  }

  private async internalExecute(input: {
    studentId: string;
    institutionId: string;
    apaarId: string | null | undefined;
    studentName: string;
    studentDob?: string | null | undefined;
    consentRecorded?: boolean | undefined;
  }): Promise<OrchestratedVerificationResult> {
    const maskedApaar = maskApaarId(input.apaarId);
    const jobId = `job_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    const traceId = `trc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    // 2. Local validation check
    const localValidation = validateLocalApaar(input.apaarId);
    if (!localValidation.isValid) {
      const result: OrchestratedVerificationResult = {
        jobId,
        requestId,
        studentId: input.studentId,
        institutionId: input.institutionId,
        maskedApaar,
        localValidation,
        externalStatus: "FAILED",
        isSimulated: this.provider.isSimulated,
        providerName: this.provider.providerId,
        providerEnvironment: this.provider.environment,
        failureCategory:
          localValidation.checksumStatus === "CHECKSUM_INVALID"
            ? "checksum_invalid"
            : "format_invalid",
        humanReadableResult: localValidation.errorMessage ?? "Local identifier validation failed.",
        attemptsCount: 0,
        completedAt: new Date().toISOString(),
        requiresManualReview: localValidation.checksumStatus === "CHECKSUM_INVALID",
        canRetry: false,
      };
      return result;
    }

    // 3. Consent check
    if (!input.consentRecorded) {
      const result: OrchestratedVerificationResult = {
        jobId,
        requestId,
        studentId: input.studentId,
        institutionId: input.institutionId,
        maskedApaar,
        localValidation,
        externalStatus: "PENDING_CONSENT",
        isSimulated: this.provider.isSimulated,
        providerName: this.provider.providerId,
        providerEnvironment: this.provider.environment,
        failureCategory: "consent_missing",
        humanReadableResult:
          "Verification requires recorded student consent pursuant to DigiLocker/ABC guidelines.",
        attemptsCount: 0,
        requiresManualReview: false,
        canRetry: true,
      };
      return result;
    }

    // 4. Provider execution with exponential backoff and jitter
    let attempt = 0;
    let lastResponse: ApaarVerificationResponse | null = null;

    while (attempt < this.maxRetries) {
      attempt++;

      const request: ApaarVerificationRequest = {
        requestId,
        studentId: input.studentId,
        institutionId: input.institutionId,
        apaarId: localValidation.cleanedId!,
        studentName: input.studentName,
        studentDob: input.studentDob,
        consentRecorded: true,
        traceId,
        attemptNumber: attempt,
      };

      try {
        lastResponse = await this.provider.verify(request);

        // If not retryable or verified, break early
        if (!lastResponse.retryable || lastResponse.status === "VERIFIED") {
          break;
        }

        // Apply backoff before next attempt
        if (attempt < this.maxRetries) {
          const jitter = Math.random() * 20;
          const backoff = this.initialBackoffMs * 2 ** (attempt - 1) + jitter;
          await new Promise((r) => setTimeout(r, backoff));
        }
      } catch (err: unknown) {
        if (attempt >= this.maxRetries) {
          lastResponse = {
            requestId,
            status: "SERVICE_UNAVAILABLE",
            isSimulated: this.provider.isSimulated,
            providerName: this.provider.providerId,
            providerEnvironment: this.provider.environment,
            failureCategory: "service_unavailable",
            humanReadableResult: `Provider communication failed: ${err instanceof Error ? err.message : String(err)}`,
            verificationMethod: "mock_registry",
            requestTimestamp: new Date().toISOString(),
            responseTimestamp: new Date().toISOString(),
            retryable: false,
          };
          break;
        }
      }
    }

    const finalResp = lastResponse!;
    const requiresManualReview =
      finalResp.status === "FAILED" ||
      finalResp.status === "MANUAL_REVIEW" ||
      (finalResp.status === "VERIFIED" &&
        Boolean(
          finalResp.verifiedName &&
          finalResp.verifiedName.toLowerCase() !== input.studentName.toLowerCase(),
        ));

    const result: OrchestratedVerificationResult = {
      jobId,
      requestId,
      studentId: input.studentId,
      institutionId: input.institutionId,
      maskedApaar,
      localValidation,
      externalStatus: finalResp.status,
      isSimulated: finalResp.isSimulated,
      providerName: finalResp.providerName,
      providerEnvironment: finalResp.providerEnvironment,
      failureCategory: finalResp.failureCategory,
      humanReadableResult: finalResp.humanReadableResult,
      verifiedName: finalResp.verifiedName,
      verifiedDob: finalResp.verifiedDob,
      attemptsCount: attempt,
      completedAt:
        finalResp.status === "VERIFIED" || finalResp.status === "FAILED"
          ? new Date().toISOString()
          : undefined,
      requiresManualReview,
      canRetry: finalResp.retryable,
    };

    return result;
  }
}
