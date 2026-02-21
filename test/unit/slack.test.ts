import { describe, it, expect } from "vitest";
import crypto from "node:crypto";
import { verifySlackRequest } from "../../src/slack.js";

const SIGNING_SECRET = "test_signing_secret_abc123";

/** Generate a valid Slack signature for the given body and timestamp */
function sign(body: string, timestamp: string): string {
  const basestring = `v0:${timestamp}:${body}`;
  return (
    "v0=" +
    crypto.createHmac("sha256", SIGNING_SECRET).update(basestring).digest("hex")
  );
}

/** Return a "now" timestamp in seconds (string) */
function nowTs(): string {
  return String(Math.floor(Date.now() / 1000));
}

/** Generate a wrong signature with the correct byte length (v0= + 64 hex chars) */
function wrongSignature(): string {
  return "v0=" + "a".repeat(64);
}

describe("verifySlackRequest", () => {
  it("should return true for a valid signature", () => {
    const ts = nowTs();
    const body = '{"type":"event_callback"}';
    const sig = sign(body, ts);
    expect(verifySlackRequest(SIGNING_SECRET, ts, body, sig)).toBe(true);
  });

  it("should return false for an incorrect signature", () => {
    const ts = nowTs();
    const body = '{"type":"event_callback"}';
    expect(
      verifySlackRequest(SIGNING_SECRET, ts, body, wrongSignature())
    ).toBe(false);
  });

  it("should return false when the body has been tampered with", () => {
    const ts = nowTs();
    const body = '{"type":"event_callback"}';
    const sig = sign(body, ts);
    const tampered = '{"type":"url_verification"}';
    expect(verifySlackRequest(SIGNING_SECRET, ts, tampered, sig)).toBe(false);
  });

  it("should return false for a timestamp older than 5 minutes", () => {
    const oldTs = String(Math.floor(Date.now() / 1000) - 301);
    const body = "{}";
    const sig = sign(body, oldTs);
    expect(verifySlackRequest(SIGNING_SECRET, oldTs, body, sig)).toBe(false);
  });

  it("should return false for a timestamp more than 5 minutes in the future", () => {
    const futureTs = String(Math.floor(Date.now() / 1000) + 301);
    const body = "{}";
    const sig = sign(body, futureTs);
    expect(verifySlackRequest(SIGNING_SECRET, futureTs, body, sig)).toBe(false);
  });

  it("should return true for a timestamp exactly at the 5-minute boundary", () => {
    const boundaryTs = String(Math.floor(Date.now() / 1000) - 300);
    const body = "{}";
    const sig = sign(body, boundaryTs);
    expect(verifySlackRequest(SIGNING_SECRET, boundaryTs, body, sig)).toBe(true);
  });
});
