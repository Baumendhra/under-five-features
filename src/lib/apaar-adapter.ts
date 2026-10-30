// APAAR mock verification adapter
// Simulates external APAAR verification API responses
// In production, replace with real APAAR API calls

export type ApaarVerifyResult = {
  apaar_id: string;
  status: "verified" | "not_found" | "invalid_format" | "service_unavailable";
  message: string;
  verified_name?: string;
  verified_dob?: string;
};

// Simulate a small registry of "known" APAAR IDs (for demo/testing)
const MOCK_VERIFIED_APAAR_IDS = new Set([
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
  "APAAR001234567".replace(/\D/g, ""), // numeric only
  "APAAR009876543".replace(/\D/g, ""),
  "APAAR005432198".replace(/\D/g, ""),
]);

/** Strip prefix, spaces, dashes and return digits only */
function cleanApaarId(raw: string): string {
  return raw.replace(/[^0-9]/g, "");
}

/**
 * Mock APAAR verification stub.
 * - Invalid format (not 12 digits) → "invalid_format"
 * - In MOCK_VERIFIED_APAAR_IDS → "verified"
 * - Otherwise → "not_found" (simulates unregistered APAAR)
 * Add ~50ms artificial latency to simulate real API call.
 */
export async function verifyApaarId(apaarId: string): Promise<ApaarVerifyResult> {
  await new Promise((r) => setTimeout(r, 40 + Math.random() * 60));

  const cleaned = cleanApaarId(apaarId);

  if (!/^\d{12}$/.test(cleaned)) {
    return {
      apaar_id: apaarId,
      status: "invalid_format",
      message: "APAAR ID must be exactly 12 numeric digits.",
    };
  }

  if (MOCK_VERIFIED_APAAR_IDS.has(cleaned)) {
    return {
      apaar_id: cleaned,
      status: "verified",
      message: "APAAR ID successfully verified with DigiLocker registry.",
      verified_name: "Verified Student", // In production: real name from APAAR
      verified_dob: "2005-01-01", // In production: real DOB from APAAR
    };
  }

  return {
    apaar_id: cleaned,
    status: "not_found",
    message: "APAAR ID not found in registry. The student may not yet be registered.",
  };
}

/**
 * Batch verify multiple APAAR IDs (up to 100 at a time).
 * Returns a map of apaar_id → result.
 */
export async function batchVerifyApaarIds(
  apaarIds: string[],
): Promise<Map<string, ApaarVerifyResult>> {
  const results = new Map<string, ApaarVerifyResult>();
  // Process in parallel (real API might need throttling)
  const settled = await Promise.allSettled(apaarIds.slice(0, 100).map((id) => verifyApaarId(id)));
  settled.forEach((r, i) => {
    const id = apaarIds[i]!;
    if (r.status === "fulfilled") {
      results.set(id, r.value);
    } else {
      results.set(id, {
        apaar_id: id,
        status: "service_unavailable",
        message: "Verification service temporarily unavailable.",
      });
    }
  });
  return results;
}
