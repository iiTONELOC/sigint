import { describe, test, expect } from "bun:test";
import { loadConfig, type ServerConfig } from "../../src/server/config";
import { createSecurityHeaders } from "../../src/server/api/securityHeaders";
import { createAuthGuards } from "../../src/server/api/auth";
import { createApiRoutes } from "../../src/server/api";

const TEST_SECRET = "security-headers-test-secret-32-bytes-XXXXX";

function makeDeps(overrides: Partial<ServerConfig> = {}) {
  const cfg = loadConfig({
    SIGINT_SERVER_SECRET: TEST_SECRET,
    NODE_ENV: "test",
  });
  const config: ServerConfig = Object.freeze({ ...cfg, ...overrides });
  const security = createSecurityHeaders(config);
  const authGuards = createAuthGuards(config, security);
  const apiRoutes = createApiRoutes({ authGuards, security });
  return { config, security, authGuards, apiRoutes };
}

const { security, authGuards, apiRoutes } = makeDeps();
const { withSecurityHeaders } = security;

async function validCookie(): Promise<string> {
  const token = await authGuards.generateToken();
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

  test("HSTS absent when not production", () => {
    const { security: s } = makeDeps({ isProduction: false });
    const res = s.withSecurityHeaders(new Response("ok"));
    expect(res.headers.get("Strict-Transport-Security")).toBeNull();
  });

  test("HSTS present when production", () => {
    const { security: s } = makeDeps({ isProduction: true });
    const res = s.withSecurityHeaders(new Response("ok"));
    expect(res.headers.get("Strict-Transport-Security")).toContain(
      "max-age=31536000",
    );
  });

  test("includes Content-Security-Policy", () => {
    const res = withSecurityHeaders(new Response("ok"));
    const csp = res.headers.get("Content-Security-Policy");
    expect(csp).not.toBeNull();
    expect(csp).toContain("default-src 'self'");
  });

  test("CSP blocks framing (frame-ancestors 'none')", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    expect(csp).toContain("frame-ancestors 'none'");
  });

  test("CSP allows planespotters images", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    expect(csp).toContain("img-src");
    expect(csp).toContain("planespotters.net");
  });

  test("CSP allows client-side data source connections", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    expect(csp).toContain("connect-src");
    expect(csp).toContain("earthquake.usgs.gov");
    expect(csp).toContain("api.weather.gov");
    expect(csp).toContain("iptv-org.github.io");
  });

  test("CSP allows web workers", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    expect(csp).toContain("worker-src 'self'");
  });

  test("CSP allows HLS media streams", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    expect(csp).toContain("media-src");
  });

  test("CSP restricts scripts to self only — no unsafe-eval, no unsafe-inline", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    expect(csp).toContain("script-src 'self'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-eval/);
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
  });

  test("CSP style-src present with documented inline allowance", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    expect(csp).toContain("style-src 'self'");
    expect(csp).toMatch(/style-src[^;]*'unsafe-inline'/);
  });

  test("CSP has object-src 'none'", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    expect(csp).toContain("object-src 'none'");
  });

  test("CSP has font-src 'self'", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    expect(csp).toContain("font-src 'self'");
  });

  test("CSP restricts forms to self", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    expect(csp).toContain("form-action 'self'");
  });

  test("CSP restricts base URI to self", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
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

describe("CSP regression — no server-side-only sources in connect-src", () => {
  test("hexdb.io not in connect-src (server-side only)", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    const connectSrc = csp
      .split(";")
      .find((d) => d.trim().startsWith("connect-src"));
    expect(connectSrc).not.toContain("hexdb.io");
  });

  test("planespotters API not in connect-src (server-side only)", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    const connectSrc = csp
      .split(";")
      .find((d) => d.trim().startsWith("connect-src"));
    expect(connectSrc).not.toContain("api.planespotters.net");
  });

  test("planespotters in img-src for photo rendering", () => {
    const csp = withSecurityHeaders(new Response("ok")).headers.get(
      "Content-Security-Policy",
    )!;
    const imgSrc = csp.split(";").find((d) => d.trim().startsWith("img-src"));
    expect(imgSrc).toContain("planespotters.net");
  });
});

describe("dead route regression", () => {
  test("no /api/aircraft/metadata/:icao24 route", () => {
    expect(
      (apiRoutes as any)["/api/aircraft/metadata/:icao24"],
    ).toBeUndefined();
  });

  test("no /api/aircraft/metadata/batch route", () => {
    expect((apiRoutes as any)["/api/aircraft/metadata/batch"]).toBeUndefined();
  });

  test("/api/aircraft/metadata/db/v1 has been removed", () => {
    expect((apiRoutes as any)["/api/aircraft/metadata/db/v1"]).toBeUndefined();
  });
});
