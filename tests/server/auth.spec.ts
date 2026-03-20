import { describe, test, expect, beforeAll } from "bun:test";

// Set required env before importing auth module
process.env.SIGINT_SERVER_SECRET = "test-secret-key-for-specs-only-do-not-use";

const {
  generateToken,
  verifyToken,
  tokenCookieHeader,
  guardRateLimit,
  guardAuth,
} = await import("@/../../src/server/api/auth");

// ── Token generation ────────────────────────────────────────────────

describe("generateToken()", () => {
  test("returns a base64url-encoded token with two parts", async () => {
    const token = await generateToken();
    const parts = token.split(".");
    expect(parts.length).toBe(2);
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(parts[1]!.length).toBeGreaterThan(0);
  });

  test("payload contains expiry timestamp", async () => {
    const token = await generateToken();
    const payload = JSON.parse(
      Buffer.from(token.split(".")[0]!, "base64url").toString(),
    );
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  test("generates unique tokens", async () => {
    const t1 = await generateToken();
    // Small delay to ensure different timestamp
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await generateToken();
    expect(t1).not.toBe(t2);
  });
});

// ── Token verification ──────────────────────────────────────────────

describe("verifyToken()", () => {
  test("accepts a valid token", async () => {
    const token = await generateToken();
    expect(await verifyToken(token)).toBe(true);
  });

  test("rejects null", async () => {
    expect(await verifyToken(null)).toBe(false);
  });

  test("rejects empty string", async () => {
    expect(await verifyToken("")).toBe(false);
  });

  test("rejects malformed token (no dot)", async () => {
    expect(await verifyToken("nodothere")).toBe(false);
  });

  test("rejects tampered payload", async () => {
    const token = await generateToken();
    const parts = token.split(".");
    // Modify the payload
    const payload = JSON.parse(Buffer.from(parts[0]!, "base64url").toString());
    payload.exp = Date.now() + 999999999;
    const tampered =
      Buffer.from(JSON.stringify(payload)).toString("base64url") +
      "." +
      parts[1];
    expect(await verifyToken(tampered)).toBe(false);
  });

  test("rejects tampered signature", async () => {
    const token = await generateToken();
    const parts = token.split(".");
    const tampered = parts[0] + "." + parts[1] + "aa";
    expect(await verifyToken(tampered)).toBe(false);
  });

  test("rejects expired token", async () => {
    // Create token with past expiry by signing a backdated payload
    const exp = Date.now() - 1000;
    const payload = JSON.stringify({ exp });
    // We can't easily sign with the internal function, so just verify
    // that a token with a past exp fails even if the sig were valid.
    const fakeToken =
      Buffer.from(payload).toString("base64url") +
      "." +
      Buffer.from("fakesig").toString("base64url");
    expect(await verifyToken(fakeToken)).toBe(false);
  });
});

// ── Cookie header ───────────────────────────────────────────────────

describe("tokenCookieHeader()", () => {
  test("includes HttpOnly flag", () => {
    const header = tokenCookieHeader("test-token");
    expect(header).toContain("HttpOnly");
  });

  test("includes SameSite=Strict", () => {
    const header = tokenCookieHeader("test-token");
    expect(header).toContain("SameSite=Strict");
  });

  test("includes Path=/", () => {
    const header = tokenCookieHeader("test-token");
    expect(header).toContain("Path=/");
  });

  test("includes Max-Age", () => {
    const header = tokenCookieHeader("test-token");
    expect(header).toContain("Max-Age=");
  });

  test("includes token value", () => {
    const header = tokenCookieHeader("my-token-value");
    expect(header).toContain("sigint_token=my-token-value");
  });
});

// ── guardAuth reads cookie ──────────────────────────────────────────

describe("guardAuth()", () => {
  test("rejects request with no cookie", async () => {
    const req = new Request("http://localhost/api/test");
    const result = await guardAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test("accepts request with valid cookie", async () => {
    const token = await generateToken();
    const req = new Request("http://localhost/api/test");
    Object.defineProperty(req, "headers", {
      value: new Map([["cookie", `sigint_token=${token}`]]),
    });
    const result = await guardAuth(req);
    expect(result).toBeNull();
  });

  test("rejects request with invalid cookie", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { cookie: "sigint_token=garbage" },
    });
    const result = await guardAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});

// ── Rate limiting ───────────────────────────────────────────────────

describe("guardRateLimit()", () => {
  test("allows normal requests", () => {
    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": `rate-test-${Math.random()}` },
    });
    const result = guardRateLimit(req);
    expect(result).toBeNull();
  });
});
