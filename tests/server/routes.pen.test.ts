import { describe, test, expect } from "bun:test";

// ─────────────────────────────────────────────────────────────────────
// Route security pentest
// Tests every API endpoint for auth enforcement, input validation,
// path traversal, method restrictions, and response security.
// Uses the actual apiRoutes handlers directly (no HTTP server needed).
// ─────────────────────────────────────────────────────────────────────

process.env.SIGINT_SERVER_SECRET = "route-pentest-secret-32bytes!!!";

const { generateToken, tokenCookieHeader } =
  await import("@/../../src/server/api/auth");
const { apiRoutes } = await import("@/../../src/server/api/index");

// ── Helpers ─────────────────────────────────────────────────────────

async function validCookie(): Promise<string> {
  const token = await generateToken();
  return `sigint_token=${token}`;
}

function authedReq(url: string, cookie: string, method = "GET"): Request {
  const req = new Request(`http://localhost${url}`, { method });
  Object.defineProperty(req, "headers", {
    value: new Map([
      ["cookie", cookie],
      ["accept-encoding", ""],
    ]),
  });
  return req;
}

function unauthReq(url: string, method = "GET"): Request {
  return new Request(`http://localhost${url}`, { method });
}

// ── safePath (replicated from server for path traversal tests) ──────

import { resolve, relative, normalize } from "path";

function safePath(base: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath);
  if (decoded.includes("..") || decoded.includes("\0")) return null;
  const normalized = normalize(decoded);
  const resolved = resolve(base, "." + normalized);
  const rel = relative(base, resolved);
  if (!rel || rel.startsWith("..") || rel.startsWith("/")) return null;
  return resolved;
}

// ═════════════════════════════════════════════════════════════════════
// AUTH TOKEN ENDPOINT
// ═════════════════════════════════════════════════════════════════════

describe("POST /api/auth/token", () => {
  const handler = (apiRoutes as any)["/api/auth/token"];

  test("returns 200 and token endpoint works", async () => {
    const req = new Request("http://localhost/api/auth/token");
    const res = await handler.GET(req);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.ok).toBe(true);
    // Set-Cookie header is set in the Response constructor but the
    // Headers API filters it per Fetch spec. Cookie content is verified
    // separately via tokenCookieHeader() tests in auth.spec.ts.
  });

  test("response body contains ok:true", async () => {
    const req = new Request("http://localhost/api/auth/token");
    const res = await handler.GET(req);
    const body = await res.json();
    expect(body.ok).toBe(true);
  });

  test("does not leak token in response body", async () => {
    const req = new Request("http://localhost/api/auth/token");
    const res = await handler.GET(req);
    const body = await res.json();
    // Token should only be in cookie, not body
    expect(body.token).toBeUndefined();
    expect(body.jwt).toBeUndefined();
    expect(body.access_token).toBeUndefined();
  });
});

// ═════════════════════════════════════════════════════════════════════
// AUTH ENFORCEMENT — EVERY PROTECTED ROUTE
// ═════════════════════════════════════════════════════════════════════

describe("auth enforcement — all protected routes reject without cookie", () => {
  const protectedRoutes = [
    "/api/events/latest",
    "/api/ships/latest",
    "/api/fires/latest",
    "/api/news/latest",
  ];

  for (const route of protectedRoutes) {
    test(`${route} returns 401 without auth`, async () => {
      const handler = (apiRoutes as any)[route];
      const req = unauthReq(route);
      const res = await handler.GET(req);
      expect(res.status).toBe(401);
    });
  }

  test("/api/aircraft/metadata/:icao24 returns 401 without auth", async () => {
    const handler = (apiRoutes as any)["/api/aircraft/metadata/:icao24"];
    const req = unauthReq("/api/aircraft/metadata/abc123");
    Object.defineProperty(req, "method", { value: "GET", writable: true });
    (req as any).params = { icao24: "abc123" };
    const res = await handler(req);
    expect(res.status).toBe(401);
  });

  test("/api/aircraft/metadata/batch returns 401 without auth", async () => {
    const handler = (apiRoutes as any)["/api/aircraft/metadata/batch"];
    const req = unauthReq("/api/aircraft/metadata/batch?ids=abc123");
    const res = await handler.GET(req);
    expect(res.status).toBe(401);
  });

  test("/api/dossier/aircraft/:icao24 returns 401 without auth", async () => {
    const handler = (apiRoutes as any)["/api/dossier/aircraft/:icao24"];
    const req = unauthReq("/api/dossier/aircraft/abc123");
    Object.defineProperty(req, "method", { value: "GET", writable: true });
    (req as any).params = { icao24: "abc123" };
    const res = await handler(req);
    expect(res.status).toBe(401);
  });
});

describe("auth enforcement — tampered token rejected on all routes", () => {
  const protectedRoutes = [
    "/api/events/latest",
    "/api/ships/latest",
    "/api/fires/latest",
    "/api/news/latest",
  ];

  for (const route of protectedRoutes) {
    test(`${route} rejects tampered token`, async () => {
      const handler = (apiRoutes as any)[route];
      const req = new Request(`http://localhost${route}`, {
        headers: { cookie: "sigint_token=forged.token.value" },
      });
      const res = await handler.GET(req);
      expect(res.status).toBe(401);
    });
  }
});

describe("auth enforcement — valid token accepted", () => {
  test("/api/events/latest accepts valid cookie", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/events/latest"];
    const req = authedReq("/api/events/latest", cookie);
    const res = await handler.GET(req);
    // 200 or 503 (no data) — but NOT 401
    expect([200, 503]).toContain(res.status);
  });

  test("/api/ships/latest accepts valid cookie", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/ships/latest"];
    const req = authedReq("/api/ships/latest", cookie);
    const res = await handler.GET(req);
    expect([200, 503]).toContain(res.status);
  });

  test("/api/fires/latest accepts valid cookie", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/fires/latest"];
    const req = authedReq("/api/fires/latest", cookie);
    const res = await handler.GET(req);
    expect([200, 503]).toContain(res.status);
  });

  test("/api/news/latest accepts valid cookie", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/news/latest"];
    const req = authedReq("/api/news/latest", cookie);
    const res = await handler.GET(req);
    expect([200, 503]).toContain(res.status);
  });
});

// ═════════════════════════════════════════════════════════════════════
// INPUT VALIDATION — DOSSIER ENDPOINT
// ═════════════════════════════════════════════════════════════════════

describe("dossier input validation", () => {
  // Replicate validation regexes
  const ICAO24_RE = /^[0-9a-f]{6}$/i;
  const CALLSIGN_RE = /^[A-Z0-9]{2,10}$/i;

  test("valid ICAO24 codes accepted", () => {
    expect(ICAO24_RE.test("abc123")).toBe(true);
    expect(ICAO24_RE.test("000000")).toBe(true);
    expect(ICAO24_RE.test("ffffff")).toBe(true);
    expect(ICAO24_RE.test("ABCDEF")).toBe(true);
  });

  test("invalid ICAO24 codes rejected", () => {
    expect(ICAO24_RE.test("")).toBe(false);
    expect(ICAO24_RE.test("abc")).toBe(false); // too short
    expect(ICAO24_RE.test("abcdefg")).toBe(false); // too long
    expect(ICAO24_RE.test("xyz123")).toBe(false); // invalid hex
    expect(ICAO24_RE.test("abc 12")).toBe(false); // space
    expect(ICAO24_RE.test("abc\n12")).toBe(false); // newline
    expect(ICAO24_RE.test("../../../etc/passwd")).toBe(false); // traversal
    expect(ICAO24_RE.test("<script>")).toBe(false); // XSS
    expect(ICAO24_RE.test("abc123; DROP TABLE")).toBe(false); // SQLi
  });

  test("valid callsigns accepted", () => {
    expect(CALLSIGN_RE.test("UAL123")).toBe(true);
    expect(CALLSIGN_RE.test("BA")).toBe(true); // min length
    expect(CALLSIGN_RE.test("ABCDEFGHIJ")).toBe(true); // max length 10
  });

  test("invalid callsigns rejected", () => {
    expect(CALLSIGN_RE.test("")).toBe(false);
    expect(CALLSIGN_RE.test("A")).toBe(false); // too short
    expect(CALLSIGN_RE.test("ABCDEFGHIJK")).toBe(false); // too long (11)
    expect(CALLSIGN_RE.test("UAL 123")).toBe(false); // space
    expect(CALLSIGN_RE.test("UAL-123")).toBe(false); // hyphen
    expect(CALLSIGN_RE.test("../passwd")).toBe(false);
    expect(CALLSIGN_RE.test("<img src=x>")).toBe(false);
  });

  test("/api/dossier/aircraft rejects invalid ICAO24", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/dossier/aircraft/:icao24"];
    const req = authedReq("/api/dossier/aircraft/ZZZZZZ", cookie);
    Object.defineProperty(req, "method", { value: "GET", writable: true });
    (req as any).params = { icao24: "ZZZZZZ" };
    const res = await handler(req);
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toContain("Invalid");
  });
});

// ═════════════════════════════════════════════════════════════════════
// PATH TRAVERSAL — safePath function
// ═════════════════════════════════════════════════════════════════════

describe("path traversal prevention", () => {
  const base = "/app/public";

  test("normal paths resolve correctly", () => {
    expect(safePath(base, "/fonts.css")).not.toBeNull();
    expect(safePath(base, "/data/land.json")).not.toBeNull();
    expect(safePath(base, "/workers/pointWorker.js")).not.toBeNull();
  });

  test("dot-dot traversal blocked", () => {
    expect(safePath(base, "/../../../etc/passwd")).toBeNull();
    expect(safePath(base, "/..")).toBeNull();
    expect(safePath(base, "/data/../../secret")).toBeNull();
  });

  test("encoded traversal blocked", () => {
    expect(safePath(base, "/%2e%2e/%2e%2e/etc/passwd")).toBeNull();
    expect(safePath(base, "/..%252f..%252f..%252fetc/passwd")).toBeNull();
  });

  test("null byte injection blocked", () => {
    expect(safePath(base, "/fonts.css\0.html")).toBeNull();
    expect(safePath(base, "/data\0/secret")).toBeNull();
  });

  test("double-encoded traversal stays within base", () => {
    // safePath decodes once: %252e%252e → %2e%2e (literal, no traversal)
    // This is correct — the server only decodes once, preventing bypass
    const result = safePath(base, "/%252e%252e/secret");
    if (result !== null) {
      const rel = relative(base, result);
      expect(rel.startsWith("..")).toBe(false);
    }
  });

  test("backslash traversal blocked", () => {
    // normalize converts backslash to forward slash on some platforms
    const result = safePath(base, "/..\\..\\etc\\passwd");
    // Should either be null (contains ..) or resolve within base
    if (result !== null) {
      const rel = relative(base, result);
      expect(rel.startsWith("..")).toBe(false);
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// RESPONSE SECURITY HEADERS
// ═════════════════════════════════════════════════════════════════════

describe("response security", () => {
  test("auth token response has correct Content-Type", async () => {
    const handler = (apiRoutes as any)["/api/auth/token"];
    const req = new Request("http://localhost/api/auth/token");
    const res = await handler.GET(req);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  test("data endpoints return JSON content type", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/events/latest"];
    const req = authedReq("/api/events/latest", cookie);
    const res = await handler.GET(req);
    expect(res.headers.get("Content-Type")).toContain("application/json");
  });

  test("gzip compression available when client accepts", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/events/latest"];
    const token = await generateToken();
    const req = new Request("http://localhost/api/events/latest");
    Object.defineProperty(req, "headers", {
      value: new Map([
        ["cookie", `sigint_token=${token}`],
        ["accept-encoding", "gzip"],
      ]),
    });
    const res = await handler.GET(req);
    // If data exists, should have gzip encoding
    if (res.status === 200) {
      expect(res.headers.get("Content-Encoding")).toBe("gzip");
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// COOKIE SECURITY (PROD vs DEV)
// ═════════════════════════════════════════════════════════════════════

describe("cookie security — production flags", () => {
  test("production cookie includes Secure flag", () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    const header = tokenCookieHeader("test");
    expect(header).toContain("Secure");
    process.env.NODE_ENV = origEnv;
  });

  test("dev cookie omits Secure flag (localhost works)", () => {
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    const header = tokenCookieHeader("test");
    expect(header).not.toContain("Secure");
    process.env.NODE_ENV = origEnv;
  });

  test("both envs have HttpOnly + SameSite", () => {
    for (const env of ["production", "development"]) {
      const origEnv = process.env.NODE_ENV;
      process.env.NODE_ENV = env;
      const header = tokenCookieHeader("test");
      expect(header).toContain("HttpOnly");
      expect(header).toContain("SameSite=Strict");
      process.env.NODE_ENV = origEnv;
    }
  });
});

// ═════════════════════════════════════════════════════════════════════
// METHOD RESTRICTIONS
// ═════════════════════════════════════════════════════════════════════

describe("method restrictions", () => {
  test("/api/dossier/aircraft rejects non-GET methods", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/dossier/aircraft/:icao24"];
    for (const method of ["POST", "PUT", "DELETE", "PATCH"]) {
      const req = authedReq("/api/dossier/aircraft/abc123", cookie, method);
      Object.defineProperty(req, "method", { value: method, writable: true });
      Object.defineProperty(req, "params", { value: { icao24: "abc123" } });
      const res = await handler(req);
      expect(res.status).toBe(405);
    }
  });

  test("/api/aircraft/metadata rejects non-GET methods", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/aircraft/metadata/:icao24"];
    for (const method of ["POST", "PUT", "DELETE"]) {
      const req = authedReq("/api/aircraft/metadata/abc123", cookie, method);
      Object.defineProperty(req, "method", { value: method, writable: true });
      Object.defineProperty(req, "params", { value: { icao24: "abc123" } });
      const res = await handler(req);
      expect(res.status).toBe(405);
    }
  });
});
