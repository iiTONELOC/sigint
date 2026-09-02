import { describe, test, expect } from "bun:test";
import { loadConfig, type ServerConfig } from "../../src/server/config";
import { createAuthGuards } from "../../src/server/api/auth";
import { createSecurityHeaders } from "../../src/server/api/securityHeaders";

const TEST_SECRET = "test-secret-key-for-specs-only-do-not-use-zz";

function testConfig(overrides: Partial<ServerConfig> = {}): ServerConfig {
  const cfg = loadConfig({
    SIGINT_SERVER_SECRET: TEST_SECRET,
    NODE_ENV: "test",
  });
  return Object.freeze({ ...cfg, ...overrides });
}

function mkAuth(cfg: ServerConfig = testConfig()) {
  return createAuthGuards(cfg, createSecurityHeaders(cfg));
}

const auth = mkAuth();

describe("generateToken()", () => {
  test("returns a base64url-encoded token with two parts", async () => {
    const token = await auth.generateToken();
    const parts = token.split(".");
    expect(parts).toHaveLength(2);
    expect(parts[0]!.length).toBeGreaterThan(0);
    expect(parts[1]!.length).toBeGreaterThan(0);
  });

  test("payload contains expiry timestamp", async () => {
    const token = await auth.generateToken();
    const [payloadPart] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadPart ?? "", "base64url").toString(),
    );
    expect(typeof payload.exp).toBe("number");
    expect(payload.exp).toBeGreaterThan(Date.now());
  });

  test("generates unique tokens", async () => {
    const t1 = await auth.generateToken();
    await new Promise((r) => setTimeout(r, 5));
    const t2 = await auth.generateToken();
    expect(t1).not.toBe(t2);
  });
});

describe("verifyToken()", () => {
  test("accepts a valid token", async () => {
    const token = await auth.generateToken();
    expect(await auth.verifyToken(token)).toBe(true);
  });

  test("rejects null", async () => {
    expect(await auth.verifyToken(null)).toBe(false);
  });

  test("rejects empty string", async () => {
    expect(await auth.verifyToken("")).toBe(false);
  });

  test("rejects malformed token (no dot)", async () => {
    expect(await auth.verifyToken("nodothere")).toBe(false);
  });

  test("rejects tampered payload", async () => {
    const token = await auth.generateToken();
    const [payloadPart, sigPart] = token.split(".");
    const payload = JSON.parse(
      Buffer.from(payloadPart ?? "", "base64url").toString(),
    );
    payload.exp = Date.now() + 999999999;
    const tampered =
      Buffer.from(JSON.stringify(payload)).toString("base64url") +
      "." +
      sigPart;
    expect(await auth.verifyToken(tampered)).toBe(false);
  });

  test("rejects tampered signature", async () => {
    const token = await auth.generateToken();
    const parts = token.split(".");
    const tampered = parts[0] + "." + parts[1] + "aa";
    expect(await auth.verifyToken(tampered)).toBe(false);
  });

  test("rejects expired token", async () => {
    const exp = Date.now() - 1000;
    const payload = JSON.stringify({ exp });
    const fakeToken =
      Buffer.from(payload).toString("base64url") +
      "." +
      Buffer.from("fakesig").toString("base64url");
    expect(await auth.verifyToken(fakeToken)).toBe(false);
  });

  test("tokens from one config do not verify under a different secret", async () => {
    const a = mkAuth(testConfig());
    const b = mkAuth(
      testConfig({ serverSecret: "different-secret-also-32-bytes-XXXXXXXXXX" }),
    );
    const token = await a.generateToken();
    expect(await a.verifyToken(token)).toBe(true);
    expect(await b.verifyToken(token)).toBe(false);
  });
});

describe("tokenCookieHeader()", () => {
  test("includes HttpOnly flag", () => {
    expect(auth.tokenCookieHeader("test-token")).toContain("HttpOnly");
  });

  test("includes SameSite=Strict", () => {
    expect(auth.tokenCookieHeader("test-token")).toContain("SameSite=Strict");
  });

  test("includes Path=/api", () => {
    expect(auth.tokenCookieHeader("test-token")).toContain("Path=/api");
  });

  test("includes Max-Age", () => {
    expect(auth.tokenCookieHeader("test-token")).toContain("Max-Age=");
  });

  test("includes token value", () => {
    expect(auth.tokenCookieHeader("my-token-value")).toContain(
      "sigint_token=my-token-value",
    );
  });

  test("omits Secure flag when isProduction=false", () => {
    const a = mkAuth(testConfig({ isProduction: false }));
    expect(a.tokenCookieHeader("t")).not.toContain("Secure");
  });

  test("includes Secure flag when isProduction=true", () => {
    const a = mkAuth(testConfig({ isProduction: true }));
    expect(a.tokenCookieHeader("t")).toContain("Secure");
  });
});

describe("guardAuth()", () => {
  test("rejects request with no cookie", async () => {
    const req = new Request("http://localhost/api/test");
    const result = await auth.guardAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test("accepts request with valid cookie", async () => {
    const token = await auth.generateToken();
    const req = new Request("http://localhost/api/test");
    Object.defineProperty(req, "headers", {
      value: new Map([["cookie", `sigint_token=${token}`]]),
    });
    const result = await auth.guardAuth(req);
    expect(result).toBeNull();
  });

  test("rejects request with invalid cookie", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { cookie: "sigint_token=garbage" },
    });
    const result = await auth.guardAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });
});

describe("guardRateLimit() — basic", () => {
  test("allows normal requests", () => {
    const a = mkAuth(testConfig({ rateLimitPerMinute: 100 }));
    const req = new Request("http://localhost/api/test", {
      headers: { "x-forwarded-for": `10.0.0.${Math.random()}` },
    });
    expect(a.guardRateLimit(req)).toBeNull();
  });

  test("config drives the rate limit (no env override)", () => {
    const a = mkAuth(testConfig({ rateLimitPerMinute: 2 }));
    const ip = `203.0.113.${Math.floor(Math.random() * 254)}`;
    const mkReq = () =>
      new Request("http://localhost/api/test", {
        headers: { "x-forwarded-for": ip },
      });
    expect(a.guardRateLimit(mkReq())).toBeNull();
    expect(a.guardRateLimit(mkReq())).toBeNull();
    const blocked = a.guardRateLimit(mkReq());
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });
});

function reqWithXff(xff: string): Request {
  return new Request("http://localhost/api/test", {
    headers: { "x-forwarded-for": xff },
  });
}

describe("XFF rightmost-N client IP extraction", () => {
  test("trustedProxyHops=0 ignores XFF entirely (direct mode)", () => {
    const a = mkAuth(testConfig({ trustedProxyHops: 0, rateLimitPerMinute: 1 }));
    expect(a.guardRateLimit(reqWithXff("203.0.113.10"))).toBeNull();
    const blocked = a.guardRateLimit(reqWithXff("198.51.100.10"));
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  test("trustedProxyHops=1 trusts the rightmost entry as our proxy", () => {
    const a = mkAuth(testConfig({ trustedProxyHops: 1, rateLimitPerMinute: 1 }));
    expect(
      a.guardRateLimit(reqWithXff("198.51.100.1, 192.0.2.1")),
    ).toBeNull();
    const blocked = a.guardRateLimit(reqWithXff("198.51.100.1, 192.0.2.99"));
    expect(blocked).not.toBeNull();
    expect(blocked!.status).toBe(429);
  });

  test("trustedProxyHops=1 distinguishes clients even when proxy IP changes", () => {
    const a = mkAuth(testConfig({ trustedProxyHops: 1, rateLimitPerMinute: 1 }));
    expect(
      a.guardRateLimit(reqWithXff("203.0.113.50, 192.0.2.1")),
    ).toBeNull();
    expect(
      a.guardRateLimit(reqWithXff("203.0.113.51, 192.0.2.1")),
    ).toBeNull();
    const blocked = a.guardRateLimit(reqWithXff("203.0.113.50, 192.0.2.1"));
    expect(blocked).not.toBeNull();
  });

  test("attacker leftmost spoofing is ignored when trustedProxyHops=1", () => {
    const a = mkAuth(testConfig({ trustedProxyHops: 1, rateLimitPerMinute: 1 }));
    expect(
      a.guardRateLimit(reqWithXff("198.51.100.77, 192.0.2.1")),
    ).toBeNull();
    const blocked = a.guardRateLimit(
      reqWithXff("1.2.3.4, 198.51.100.77, 192.0.2.1"),
    );
    expect(blocked).not.toBeNull();
  });

  test("fewer XFF entries than trustedProxyHops+1 fails closed to a single 'unknown' bucket", () => {
    const a = mkAuth(testConfig({ trustedProxyHops: 2, rateLimitPerMinute: 1 }));
    expect(a.guardRateLimit(reqWithXff("only-one-entry"))).toBeNull();
    const blocked = a.guardRateLimit(reqWithXff("also-only-one"));
    expect(blocked).not.toBeNull();
  });

  test("missing XFF with trustedProxyHops>0 fails closed", () => {
    const a = mkAuth(testConfig({ trustedProxyHops: 1, rateLimitPerMinute: 1 }));
    const r1 = new Request("http://localhost/api/test");
    expect(a.guardRateLimit(r1)).toBeNull();
    const r2 = new Request("http://localhost/api/test");
    expect(a.guardRateLimit(r2)).not.toBeNull();
  });

  test("empty XFF entries are tolerated (whitespace handling)", () => {
    const a = mkAuth(testConfig({ trustedProxyHops: 1, rateLimitPerMinute: 2 }));
    expect(
      a.guardRateLimit(reqWithXff("  198.51.100.5  ,  192.0.2.1  ")),
    ).toBeNull();
    expect(
      a.guardRateLimit(reqWithXff("198.51.100.5, 192.0.2.1")),
    ).toBeNull();
    const blocked = a.guardRateLimit(reqWithXff("198.51.100.5, 192.0.2.1"));
    expect(blocked).not.toBeNull();
  });
});
