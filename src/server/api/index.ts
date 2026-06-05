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
import { getCycloneWarningsCache } from "./cyclonesWarningsCache";
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

    "/api/cyclones/warnings": {
      async GET(req: Request) {
        const blocked = await guardAuth(req);
        if (blocked) return blocked;

        const cache = getCycloneWarningsCache();
        return jsonResponse(req, {
          features: cache.features,
          fetchedAt: cache.fetchedAt,
          featureCount: cache.featureCount,
        });
      },
    },

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
}
