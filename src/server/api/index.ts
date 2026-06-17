import type { AuthGuards } from "./auth";
import type { SecurityHeaders } from "./securityHeaders";
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
import { gzip } from "zlib";
import { promisify } from "util";

const gzipAsync = promisify(gzip);

const STORM_ID_RE = /^(?:AL|EP|CP)\d{2}\d{4}$/i;
function isValidStormId(value: string): boolean {
  return STORM_ID_RE.test(value);
}

export type ApiDeps = Readonly<{
  authGuards: AuthGuards;
  security: SecurityHeaders;
}>;

export function createApiRoutes(deps: ApiDeps) {
  const { authGuards, security } = deps;
  const { withSecurityHeaders } = security;
  const {
    generateToken,
    tokenCookieHeader,
    expireOldCookieHeader,
    guardAuth,
    guardRateLimit,
  } = authGuards;

  async function jsonResponse(req: Request, body: unknown): Promise<Response> {
    const json = JSON.stringify(body);
    const acceptEncoding = req.headers.get("accept-encoding") ?? "";
    if (acceptEncoding.includes("gzip")) {
      const compressed = (await gzipAsync(Buffer.from(json))) as Uint8Array;
      // Copy into a fresh ArrayBuffer-backed Uint8Array. The DOM lib's BodyInit
      // rejects ArrayBufferLike (potentially SharedArrayBuffer) backing, which
      // a raw Buffer/gzip output reports; Uint8Array.from guarantees an
      // ArrayBuffer and so is unambiguously a BodyInit.
      const body = Uint8Array.from(compressed);
      return withSecurityHeaders(
        new Response(body, {
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

  function jsonError(body: Record<string, unknown>, status: number): Response {
    return withSecurityHeaders(Response.json(body, { status }));
  }

  // ── Route guards ─────────────────────────────────────────────────────
  // Every authed route repeated the same guardAuth check; the param routes
  // also repeated the method-405 + stormId validation. These wrap it once.
  type Handler = (req: any) => Promise<Response>;

  function authedGet(handler: (req: Request) => Promise<Response>) {
    return {
      async GET(req: Request) {
        const blocked = await guardAuth(req);
        if (blocked) return blocked;
        return handler(req);
      },
    };
  }

  function authedFnGet(handler: Handler): Handler {
    return async (req) => {
      const blocked = await guardAuth(req);
      if (blocked) return blocked;
      if (req.method !== "GET") {
        return withSecurityHeaders(
          new Response("Method Not Allowed", { status: 405 }),
        );
      }
      return handler(req);
    };
  }

  function authedStormGet(
    handler: (req: any, stormId: string) => Promise<Response>,
  ): Handler {
    return authedFnGet(async (req) => {
      const stormId = String(req.params?.stormId ?? "");
      if (!isValidStormId(stormId)) {
        return jsonError({ error: "Invalid stormId" }, 400);
      }
      return handler(req, stormId.toUpperCase());
    });
  }

  return {
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
        res.headers.append("Set-Cookie", tokenCookieHeader(token));
        res.headers.append("Set-Cookie", expireOldCookieHeader());
        return withSecurityHeaders(res);
      },
    },

    "/api/events/latest": authedGet(async (req) => {
      const cache = getGdeltCache();
      if (!cache.data) {
        return jsonError({ error: cache.error ?? "No data available yet" }, 503);
      }
      return jsonResponse(req, {
        data: cache.data,
        fetchedAt: cache.fetchedAt,
      });
    }),

    "/api/ships/latest": authedGet(async (req) => {
      const cache = getAisCache();
      if (!cache.data) {
        return jsonError({ error: cache.error ?? "No AIS data available yet" }, 503);
      }
      return jsonResponse(req, {
        data: cache.data,
        vesselCount: cache.vesselCount,
        connected: cache.connected,
      });
    }),

    "/api/fires/latest": authedGet(async (req) => {
      const cache = getFirmsCache();
      if (!cache.data) {
        return jsonError({ error: cache.error ?? "No fire data available yet" }, 503);
      }
      return jsonResponse(req, {
        data: cache.data,
        fetchedAt: cache.fetchedAt,
        fireCount: cache.fireCount,
      });
    }),

    "/api/cyclones/latest": authedGet(async (req) => {
      const cache = getCyclonesCache();
      if (!cache.body) {
        return jsonError({ error: cache.error ?? "No cyclone data available yet" }, 503);
      }
      return jsonResponse(req, {
        activeStorms: cache.body.activeStorms,
        fetchedAt: cache.fetchedAt,
        stormCount: cache.stormCount,
      });
    }),

    "/api/aircraft/states": authedGet(async (req) => {
      const cache = getAircraftCache();
      return jsonResponse(req, {
        ac: cache.body?.ac ?? [],
        fetchedAt: cache.fetchedAt,
        aircraftCount: cache.aircraftCount,
        error: cache.error,
      });
    }),

    "/api/news/latest": authedGet(async (req) => {
      const cache = getNewsCache();
      if (!cache.items || cache.items.length === 0) {
        return jsonError({ error: cache.error ?? "No news data available yet" }, 503);
      }
      return jsonResponse(req, {
        items: cache.items,
        fetchedAt: cache.fetchedAt,
        itemCount: cache.itemCount,
      });
    }),

    "/api/dossier/aircraft/:icao24": authedFnGet(async (req) => {
      const { icao24 = "" } = req.params ?? {};
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
    }),

    "/api/dossier/cyclone/:stormId": authedStormGet(async (req, stormId) =>
      jsonResponse(req, await getCycloneDossier(stormId)),
    ),

    "/api/cyclones/:stormId/cone": authedStormGet(async (req, stormId) =>
      jsonResponse(req, await getCycloneCone(stormId)),
    ),
  };
}
