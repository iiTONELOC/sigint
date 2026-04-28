import {
  generateToken,
  tokenCookieHeader,
  expireOldCookieHeader,
  guardAuth,
  guardRateLimit,
} from "./auth";
import { getGdeltCache } from "./gdeltCache";
import { getAisCache } from "./aisCache";
import { getFirmsCache } from "./firmsCache";
import { getNewsCache } from "./newsCache";
import { getCyclonesCache } from "./cyclonesCache";
import { getAircraftCache } from "./aircraftCache";
import {
  getAircraftDossier,
  isValidIcao24,
  isValidCallsign,
} from "./dossierCache";
import { getCycloneDossier } from "./cyclonesDossierCache";
import { getCycloneCone } from "./cyclonesConeCache";
import { withSecurityHeaders } from "./securityHeaders";

// ── Storm-id validator (route-param SSRF guard) ──────────────────────
// NHC stormIds match the literal pattern basin (AL|EP|CP) + 2-digit
// cyclone number + 4-digit year. The pattern is enforced before the
// :stormId path param flows into any cache lookup so a hostile path
// can't poison the per-storm URL stash.
const STORM_ID_RE = /^(?:AL|EP|CP)\d{2}\d{4}$/i;
function isValidStormId(value: string): boolean {
  return STORM_ID_RE.test(value);
}

// ── Response helpers ─────────────────────────────────────────────────

/** JSON response with optional gzip + security headers */
function jsonResponse(req: Request, body: unknown): Response {
  const json = JSON.stringify(body);
  const acceptEncoding = req.headers.get("accept-encoding") ?? "";
  if (acceptEncoding.includes("gzip")) {
    const compressed = Bun.gzipSync(Buffer.from(json));
    return withSecurityHeaders(
      new Response(compressed, {
        headers: {
          "Content-Type": "application/json",
          "Content-Encoding": "gzip",
        },
      }),
    );
  }
  return withSecurityHeaders(
    new Response(json, {
      headers: { "Content-Type": "application/json" },
    }),
  );
}

/** JSON error response with security headers */
function jsonError(body: Record<string, unknown>, status: number): Response {
  return withSecurityHeaders(Response.json(body, { status }));
}

export const apiRoutes = {
  // ── Auth token — sets HttpOnly cookie ──────────────────────────
  "/api/auth/token": {
    async GET(req: Request) {
      const blocked = guardRateLimit(req);
      if (blocked) return blocked;

      const token = await generateToken();
      const res = new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: {
          "Content-Type": "application/json",
        },
      });
      // Set the new token cookie scoped to /api
      res.headers.append("Set-Cookie", tokenCookieHeader(token));
      // Expire any stale cookie from the old Path=/ scope
      res.headers.append("Set-Cookie", expireOldCookieHeader());
      return withSecurityHeaders(res);
    },
  },

  // ── GDELT events ───────────────────────────────────────────────
  "/api/events/latest": {
    async GET(req: Request) {
      const blocked = await guardAuth(req);
      if (blocked) return blocked;

      const cache = getGdeltCache();
      if (!cache.data) {
        return jsonError(
          { error: cache.error ?? "No data available yet" },
          503,
        );
      }

      return jsonResponse(req, {
        data: cache.data,
        fetchedAt: cache.fetchedAt,
      });
    },
  },

  // ── AIS ships ──────────────────────────────────────────────────
  "/api/ships/latest": {
    async GET(req: Request) {
      const blocked = await guardAuth(req);
      if (blocked) return blocked;

      const cache = getAisCache();
      if (!cache.data) {
        return jsonError(
          { error: cache.error ?? "No AIS data available yet" },
          503,
        );
      }

      return jsonResponse(req, {
        data: cache.data,
        vesselCount: cache.vesselCount,
        connected: cache.connected,
      });
    },
  },

  // ── NASA FIRMS fires ───────────────────────────────────────────
  "/api/fires/latest": {
    async GET(req: Request) {
      const blocked = await guardAuth(req);
      if (blocked) return blocked;

      const cache = getFirmsCache();
      if (!cache.data) {
        return jsonError(
          { error: cache.error ?? "No fire data available yet" },
          503,
        );
      }

      return jsonResponse(req, {
        data: cache.data,
        fetchedAt: cache.fetchedAt,
        fireCount: cache.fireCount,
      });
    },
  },

  // ── NHC tropical cyclones ──────────────────────────────────────
  // Server proxy of CurrentStorms.json (NHC sends no CORS headers).
  // Empty activeStorms array is the legitimate out-of-season state and
  // is served as 200, not 503 — distinct from FIRMS/AIS where empty
  // typically signals a temporary outage.
  "/api/cyclones/latest": {
    async GET(req: Request) {
      const blocked = await guardAuth(req);
      if (blocked) return blocked;

      const cache = getCyclonesCache();
      if (!cache.body) {
        return jsonError(
          { error: cache.error ?? "No cyclone data available yet" },
          503,
        );
      }

      return jsonResponse(req, {
        activeStorms: cache.body.activeStorms,
        fetchedAt: cache.fetchedAt,
        stormCount: cache.stormCount,
      });
    },
  },

  // ── adsb.fi aircraft (server tile sweep) ───────────────────────
  // Same-origin proxy of the merged tile sweep. The browser never hits
  // opendata.adsb.fi directly — adsb.fi enforces 1 req/sec/IP and a
  // per-user budget would burn instantly. Body shape is { ac: [...] }
  // matching adsb.fi v3 verbatim, plus server-side enrichment fields
  // attached by aircraftEnrichment.ts before the cache write.
  //
  // Streaming semantics: the cache fills tile-by-tile during a cold
  // start (~340 s for a full 113-tile sweep), so an empty `ac` array
  // is a normal transient state, not an error. Returning 200 with
  // `ac: []` lets the client retry-poll without flagging a console
  // error. A genuine upstream failure shows up via `error` in the body
  // alongside whatever stale data we still have.
  "/api/aircraft/states": {
    async GET(req: Request) {
      const blocked = await guardAuth(req);
      if (blocked) return blocked;

      const cache = getAircraftCache();
      return jsonResponse(req, {
        ac: cache.body?.ac ?? [],
        fetchedAt: cache.fetchedAt,
        aircraftCount: cache.aircraftCount,
        error: cache.error,
      });
    },
  },

  // ── News (RSS feeds) ─────────────────────────────────────────────
  "/api/news/latest": {
    async GET(req: Request) {
      const blocked = await guardAuth(req);
      if (blocked) return blocked;

      const cache = getNewsCache();
      if (!cache.items || cache.items.length === 0) {
        return jsonError(
          { error: cache.error ?? "No news data available yet" },
          503,
        );
      }

      return jsonResponse(req, {
        items: cache.items,
        fetchedAt: cache.fetchedAt,
        itemCount: cache.itemCount,
      });
    },
  },

  // ── Dossier: Aircraft detail (hexdb.io info + planespotters photos) ──
  "/api/dossier/aircraft/:icao24": async (req: any) => {
    const blocked = await guardAuth(req);
    if (blocked) return blocked;

    const { method, params } = req;
    if (method !== "GET") {
      return withSecurityHeaders(
        new Response("Method Not Allowed", { status: 405 }),
      );
    }

    const { icao24 = "" } = params ?? {};
    if (!isValidIcao24(String(icao24))) {
      return jsonError({ error: "Invalid ICAO24 hex code" }, 400);
    }

    const url = new URL(req.url);
    const callsignRaw = url.searchParams.get("callsign") ?? "";
    const callsign =
      callsignRaw && isValidCallsign(callsignRaw) ? callsignRaw : undefined;

    const dossier = await getAircraftDossier(String(icao24), callsign);
    if (!dossier) {
      return jsonError({ error: "Aircraft not found" }, 404);
    }

    return jsonResponse(req, { dossier });
  },

  // ── Dossier: Cyclone NHC text products (Public Advisory + Discussion) ──
  // Wind probabilities are cached but not surfaced in v1.1 UI; the bundle
  // includes the field so future UI iterations can light it up without a
  // server change.
  "/api/dossier/cyclone/:stormId": async (req: any) => {
    const blocked = await guardAuth(req);
    if (blocked) return blocked;

    const { method, params } = req;
    if (method !== "GET") {
      return withSecurityHeaders(
        new Response("Method Not Allowed", { status: 405 }),
      );
    }

    const stormId = String(params?.stormId ?? "");
    if (!isValidStormId(stormId)) {
      return jsonError({ error: "Invalid stormId" }, 400);
    }

    const result = await getCycloneDossier(stormId.toUpperCase());
    return jsonResponse(req, result);
  },

  // ── Cyclone official 5-day cone (KMZ → GeoJSON Polygon) ──────────────
  // KMZ unzip + KML→GeoJSON conversion happens server-side so the worker
  // doesn't ship a ZIP unzipper. Failure is silent (cone: null) — the
  // worker falls back to the synthesized error-radius cone.
  "/api/cyclones/:stormId/cone": async (req: any) => {
    const blocked = await guardAuth(req);
    if (blocked) return blocked;

    const { method, params } = req;
    if (method !== "GET") {
      return withSecurityHeaders(
        new Response("Method Not Allowed", { status: 405 }),
      );
    }

    const stormId = String(params?.stormId ?? "");
    if (!isValidStormId(stormId)) {
      return jsonError({ error: "Invalid stormId" }, 400);
    }

    const result = await getCycloneCone(stormId.toUpperCase());
    return jsonResponse(req, result);
  },
};
