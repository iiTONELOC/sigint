import { describe, test, expect } from "bun:test";

// ─────────────────────────────────────────────────────────────────────
// Security headers tests
// Verifies every response from the API and static file servers includes
// the OWASP-required security headers. Ensures the CSP covers all
// required external sources and blocks framing/injection.
// ─────────────────────────────────────────────────────────────────────

process.env.SIGINT_SERVER_SECRET = "security-headers-test-secret!!!";

const { withSecurityHeaders } =
  await import("@/../../src/server/api/securityHeaders");
const { generateToken, tokenCookieHeader } =
  await import("@/../../src/server/api/auth");
const { apiRoutes } = await import("@/../../src/server/api/index");

// ── Helpers ─────────────────────────────────────────────────────────

async function validCookie(): Promise<string> {
  const token = await generateToken();
  return `sigint_token=${token}`;
}

function authedReq(url: string, cookie: string): Request {
  const req = new Request(`http://localhost${url}`);
  Object.defineProperty(req, "headers", {
    value: new Map([
      ["cookie", cookie],
      ["accept-encoding", ""],
    ]),
  });
  return req;
}

// ═════════════════════════════════════════════════════════════════════
// withSecurityHeaders UNIT TESTS
// ═════════════════════════════════════════════════════════════════════

describe("withSecurityHeaders", () => {
  test("adds all required OWASP headers", () => {
    const res = withSecurityHeaders(new Response("ok"));
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Referrer-Policy")).toBe(
      "strict-origin-when-cross-origin",
    );
    expect(res.headers.get("Permissions-Policy")).toBe(
      "camera=(), microphone=(), geolocation=()",
    );
    expect(res.headers.get("X-XSS-Protection")).toBe("0");
  });

  test("includes Content-Security-Policy", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).not.toBeNull();
    expect(csp).toContain("default-src 'self'");
  });

  test("CSP blocks framing (frame-ancestors 'none')", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("CSP allows planespotters images", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("img-src");
    expect(csp).toContain("planespotters.net");
  });

  test("CSP allows client-side data source connections", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("connect-src");
    expect(csp).toContain("opensky-network.org");
    expect(csp).toContain("earthquake.usgs.gov");
    expect(csp).toContain("api.weather.gov");
    expect(csp).toContain("iptv-org.github.io");
  });

  test("CSP allows web workers", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("worker-src 'self'");
  });

  test("CSP allows HLS media streams", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("media-src");
  });

  test("CSP restricts scripts to self only", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("script-src 'self'");
    // No unsafe-eval or unsafe-inline for scripts
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  test("CSP restricts forms to self", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("form-action 'self'");
  });

  test("CSP restricts base URI to self", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    expect(csp).toContain("base-uri 'self'");
  });

  test("preserves existing response headers", () => {
    const res = withSecurityHeaders(
      new Response("ok", {
        headers: { "Content-Type": "text/plain", "X-Custom": "foo" },
      }),
    );
    expect(res.headers.get("Content-Type")).toBe("text/plain");
    expect(res.headers.get("X-Custom")).toBe("foo");
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});

// ═════════════════════════════════════════════════════════════════════
// API ROUTE INTEGRATION — headers on real responses
// ═════════════════════════════════════════════════════════════════════

describe("security headers on API responses", () => {
  test("auth token response has security headers", async () => {
    const handler = (apiRoutes as any)["/api/auth/token"];
    const req = new Request("http://localhost/api/auth/token");
    const res = await handler.GET(req);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(res.headers.get("Content-Security-Policy")).toContain(
      "frame-ancestors 'none'",
    );
  });

  test("data endpoint responses have security headers", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/events/latest"];
    const req = authedReq("/api/events/latest", cookie);
    const res = await handler.GET(req);
    // 200 or 503 — either way should have headers
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("Content-Security-Policy")).not.toBeNull();
  });

  test("401 responses have security headers", async () => {
    const handler = (apiRoutes as any)["/api/events/latest"];
    const req = new Request("http://localhost/api/events/latest");
    const res = await handler.GET(req);
    expect(res.status).toBe(401);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
    expect(res.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });

  test("dossier 400 response has security headers", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/dossier/aircraft/:icao24"];
    const req = authedReq("/api/dossier/aircraft/ZZZZZZ", cookie);
    Object.defineProperty(req, "method", { value: "GET", writable: true });
    (req as any).params = { icao24: "ZZZZZZ" };
    const res = await handler(req);
    expect(res.status).toBe(400);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });

  test("dossier 405 response has security headers", async () => {
    const cookie = await validCookie();
    const handler = (apiRoutes as any)["/api/dossier/aircraft/:icao24"];
    const req = authedReq("/api/dossier/aircraft/abc123", cookie);
    Object.defineProperty(req, "method", { value: "POST", writable: true });
    (req as any).params = { icao24: "abc123" };
    const res = await handler(req);
    expect(res.status).toBe(405);
    expect(res.headers.get("X-Frame-Options")).toBe("DENY");
  });
});

// ═════════════════════════════════════════════════════════════════════
// CSP REGRESSION — server-side-only sources NOT in connect-src
// ═════════════════════════════════════════════════════════════════════

describe("CSP regression — no server-side-only sources in connect-src", () => {
  test("hexdb.io not in connect-src (server-side only)", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    // hexdb.io is fetched server-side by dossierCache.ts
    // It should NOT be in connect-src (client never fetches it)
    const connectSrc = csp
      .split(";")
      .find((d) => d.trim().startsWith("connect-src"));
    expect(connectSrc).not.toContain("hexdb.io");
  });

  test("planespotters API not in connect-src (server-side only)", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    // api.planespotters.net is fetched server-side
    // Only img-src needs planespotters (for thumbnail rendering)
    const connectSrc = csp
      .split(";")
      .find((d) => d.trim().startsWith("connect-src"));
    expect(connectSrc).not.toContain("api.planespotters.net");
  });

  test("planespotters in img-src for photo rendering", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy")!;
    const imgSrc = csp.split(";").find((d) => d.trim().startsWith("img-src"));
    expect(imgSrc).toContain("planespotters.net");
  });
});

// ═════════════════════════════════════════════════════════════════════
// NO OLD METADATA ENRICHMENT ROUTES
// ═════════════════════════════════════════════════════════════════════

describe("dead route regression", () => {
  test("no /api/aircraft/metadata/:icao24 route", () => {
    expect(
      (apiRoutes as any)["/api/aircraft/metadata/:icao24"],
    ).toBeUndefined();
  });

  test("no /api/aircraft/metadata/batch route", () => {
    expect((apiRoutes as any)["/api/aircraft/metadata/batch"]).toBeUndefined();
  });

  test("/api/aircraft/metadata/db/v1 route exists (local DB)", () => {
    expect((apiRoutes as any)["/api/aircraft/metadata/db/v1"]).toBeDefined();
  });
});
