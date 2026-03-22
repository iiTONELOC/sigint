import { describe, test, expect } from "bun:test";

process.env.SIGINT_SERVER_SECRET = "pentest-secret-key-32bytes-long!!";

const {
  generateToken,
  verifyToken,
  tokenCookieHeader,
  guardRateLimit,
  guardAuth,
} = await import("@/../../src/server/api/auth");

// ── Token forgery ───────────────────────────────────────────────────

describe("auth pentest — token forgery", () => {
  test("cannot forge token with wrong secret", async () => {
    const payload = JSON.stringify({ exp: Date.now() + 3600000 });
    const fakeKey = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode("wrong-secret-key"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"],
    );
    const sig = await crypto.subtle.sign(
      "HMAC",
      fakeKey,
      new TextEncoder().encode(payload),
    );
    const forgedToken =
      Buffer.from(payload).toString("base64url") +
      "." +
      Buffer.from(Buffer.from(sig).toString("hex")).toString("base64url");
    expect(await verifyToken(forgedToken)).toBe(false);
  });

  test("cannot extend expiry by modifying payload", async () => {
    const token = await generateToken();
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[0]!, "base64url").toString());
    payload.exp = Date.now() + 999999999;
    const tampered =
      Buffer.from(JSON.stringify(payload)).toString("base64url") +
      "." +
      parts[1];
    expect(await verifyToken(tampered)).toBe(false);
  });

  test("cannot add admin/role claims to payload", async () => {
    const token = await generateToken();
    const parts = token.split(".");
    const payload = JSON.parse(Buffer.from(parts[0]!, "base64url").toString());
    payload.admin = true;
    payload.role = "superuser";
    const tampered =
      Buffer.from(JSON.stringify(payload)).toString("base64url") +
      "." +
      parts[1];
    expect(await verifyToken(tampered)).toBe(false);
  });

  test("empty signature rejected", async () => {
    const payload = JSON.stringify({ exp: Date.now() + 3600000 });
    const token = Buffer.from(payload).toString("base64url") + ".";
    expect(await verifyToken(token)).toBe(false);
  });

  test("swapped payload/signature rejected", async () => {
    const token = await generateToken();
    const parts = token.split(".");
    const swapped = parts[1] + "." + parts[0];
    expect(await verifyToken(swapped)).toBe(false);
  });

  test("double-dot token rejected", async () => {
    expect(await verifyToken("a.b.c")).toBe(false);
  });

  test("unicode payload injection rejected", async () => {
    const payload = JSON.stringify({
      exp: Date.now() + 3600000,
      "\u0000": "inject",
    });
    const token =
      Buffer.from(payload).toString("base64url") +
      "." +
      Buffer.from("fakesig").toString("base64url");
    expect(await verifyToken(token)).toBe(false);
  });

  test("extremely large payload rejected", async () => {
    const payload = JSON.stringify({
      exp: Date.now() + 3600000,
      data: "x".repeat(100000),
    });
    const token =
      Buffer.from(payload).toString("base64url") +
      "." +
      Buffer.from("fakesig").toString("base64url");
    expect(await verifyToken(token)).toBe(false);
  });
});

// ── Replay attacks ──────────────────────────────────────────────────

describe("auth pentest — replay attacks", () => {
  test("token is valid immediately after generation", async () => {
    const token = await generateToken();
    expect(await verifyToken(token)).toBe(true);
  });

  test("same token can be reused within TTL (stateless — expected)", async () => {
    // Stateless HMAC tokens are replayable by design.
    // Mitigations: HttpOnly (no XSS exfil) + SameSite=Strict (no CSRF)
    // + Secure (no MitM) + 30-min TTL
    const token = await generateToken();
    expect(await verifyToken(token)).toBe(true);
    expect(await verifyToken(token)).toBe(true);
  });

  test("token with past expiry is rejected", async () => {
    const payload = JSON.stringify({ exp: Date.now() - 1000 });
    const fakeToken =
      Buffer.from(payload).toString("base64url") +
      "." +
      Buffer.from("sig").toString("base64url");
    expect(await verifyToken(fakeToken)).toBe(false);
  });
});

// ── Cookie security ─────────────────────────────────────────────────

describe("auth pentest — cookie security", () => {
  test("HttpOnly flag prevents XSS exfiltration", () => {
    expect(tokenCookieHeader("test")).toContain("HttpOnly");
  });

  test("SameSite=Strict prevents CSRF", () => {
    expect(tokenCookieHeader("test")).toContain("SameSite=Strict");
  });

  test("Path=/ scoped to origin", () => {
    expect(tokenCookieHeader("test")).toContain("Path=/");
  });

  test("Max-Age auto-expires within 30 min", () => {
    const header = tokenCookieHeader("test");
    const match = header.match(/Max-Age=(\d+)/);
    expect(match).not.toBeNull();
    const maxAge = parseInt(match![1]!);
    expect(maxAge).toBeGreaterThan(0);
    expect(maxAge).toBeLessThanOrEqual(1800);
  });

  test("token value only in cookie assignment", () => {
    const header = tokenCookieHeader("secret-token-value");
    expect(header.startsWith("sigint_token=secret-token-value")).toBe(true);
  });
});

// ── Rate limiting ───────────────────────────────────────────────────

describe("auth pentest — rate limiting", () => {
  test("allows requests under limit", () => {
    const ip = `pentest-${Math.random()}`;
    for (let i = 0; i < 5; i++) {
      const req = new Request("http://localhost/api/test", {
        headers: { "x-forwarded-for": ip },
      });
      expect(guardRateLimit(req)).toBeNull();
    }
  });

  test("blocks after 60 requests per minute", () => {
    const ip = `flood-${Math.random()}`;
    let blocked = false;
    for (let i = 0; i < 65; i++) {
      const req = new Request("http://localhost/api/test", {
        headers: { "x-forwarded-for": ip },
      });
      const result = guardRateLimit(req);
      if (result !== null) {
        blocked = true;
        expect(result.status).toBe(429);
        break;
      }
    }
    expect(blocked).toBe(true);
  });

  test("rate limit is per-IP", () => {
    const ip1 = `ip1-${Math.random()}`;
    const ip2 = `ip2-${Math.random()}`;
    for (let i = 0; i < 61; i++) {
      guardRateLimit(
        new Request("http://localhost/x", {
          headers: { "x-forwarded-for": ip1 },
        }),
      );
    }
    const result = guardRateLimit(
      new Request("http://localhost/x", {
        headers: { "x-forwarded-for": ip2 },
      }),
    );
    expect(result).toBeNull();
  });

  test("x-forwarded-for uses first IP only", () => {
    const ip = `spoof-${Math.random()}`;
    const req = new Request("http://localhost/x", {
      headers: { "x-forwarded-for": `${ip}, 1.2.3.4, 5.6.7.8` },
    });
    expect(guardRateLimit(req)).toBeNull();
  });

  test("429 response includes Retry-After header", () => {
    const ip = `retry-${Math.random()}`;
    let response: Response | null = null;
    for (let i = 0; i < 65; i++) {
      response = guardRateLimit(
        new Request("http://localhost/x", {
          headers: { "x-forwarded-for": ip },
        }),
      );
      if (response) break;
    }
    expect(response).not.toBeNull();
    expect(response!.headers.get("Retry-After")).toBe("60");
  });
});

// ── guardAuth integration ───────────────────────────────────────────

describe("auth pentest — guardAuth", () => {
  test("no cookie returns 401", async () => {
    const req = new Request("http://localhost/api/test");
    const result = await guardAuth(req);
    expect(result).not.toBeNull();
    expect(result!.status).toBe(401);
  });

  test("valid cookie passes", async () => {
    const token = await generateToken();
    const req = new Request("http://localhost/api/test");
    Object.defineProperty(req, "headers", {
      value: new Map([["cookie", `sigint_token=${token}`]]),
    });
    const result = await guardAuth(req);
    expect(result).toBeNull();
  });

  test("tampered cookie returns 401", async () => {
    const req = new Request("http://localhost/api/test", {
      headers: { cookie: "sigint_token=tampered.token" },
    });
    expect((await guardAuth(req))!.status).toBe(401);
  });

  test("wrong cookie name returns 401", async () => {
    const token = await generateToken();
    const req = new Request("http://localhost/api/test", {
      headers: { cookie: `wrong_name=${token}` },
    });
    expect((await guardAuth(req))!.status).toBe(401);
  });

  test("rate limit fires before auth check", async () => {
    const ip = `authflood-${Math.random()}`;
    let response: Response | null = null;
    for (let i = 0; i < 65; i++) {
      response = await guardAuth(
        new Request("http://localhost/api/test", {
          headers: { "x-forwarded-for": ip },
        }),
      );
      if (response && response.status === 429) break;
    }
    expect(response).not.toBeNull();
    expect(response!.status).toBe(429);
  });
});
