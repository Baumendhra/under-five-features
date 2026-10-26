import { describe, expect, it } from "vitest";
import { verifyApaarId, batchVerifyApaarIds } from "@/lib/apaar-adapter";

describe("verifyApaarId — format validation", () => {
  it("returns invalid_format for IDs shorter than 12 digits", async () => {
    const result = await verifyApaarId("12345");
    expect(result.status).toBe("invalid_format");
  });

  it("returns invalid_format for IDs longer than 12 digits", async () => {
    const result = await verifyApaarId("1234567890123");
    expect(result.status).toBe("invalid_format");
  });

  it("returns invalid_format for alpha-numeric IDs after stripping non-digits", async () => {
    const result = await verifyApaarId("APAARABCD1234"); // "1234" only = 4 digits
    expect(result.status).toBe("invalid_format");
  });

  it("returns invalid_format for empty string", async () => {
    const result = await verifyApaarId("");
    expect(result.status).toBe("invalid_format");
  });
});

describe("verifyApaarId — registry lookup", () => {
  it("returns verified for a known APAAR ID", async () => {
    const result = await verifyApaarId("123456789012");
    expect(result.status).toBe("verified");
    expect(result.apaar_id).toBe("123456789012");
  });

  it("returns not_found for a valid-format but unknown APAAR ID", async () => {
    const result = await verifyApaarId("111111111111");
    expect(result.status).toBe("not_found");
  });

  it("verified result includes a message", async () => {
    const result = await verifyApaarId("234567890123");
    expect(result.status).toBe("verified");
    expect(result.message).toMatch(/verified/i);
  });
});

describe("batchVerifyApaarIds", () => {
  it("verifies multiple IDs and returns a map", async () => {
    const ids = ["123456789012", "111111111111", "000000000000"];
    const results = await batchVerifyApaarIds(ids);
    expect(results.size).toBe(3);
    expect(results.get("123456789012")!.status).toBe("verified");
    expect(results.get("111111111111")!.status).toBe("not_found");
    expect(results.get("000000000000")!.status).toBe("not_found");
  });

  it("caps batch size at 100", async () => {
    const ids = Array.from({ length: 150 }, (_, i) => String(i).padStart(12, "0"));
    const results = await batchVerifyApaarIds(ids);
    expect(results.size).toBe(100);
  });

  it("handles IDs with spaces gracefully", async () => {
    const result = await verifyApaarId("123456789012");
    expect(result.status).toBe("verified");
  });
});
