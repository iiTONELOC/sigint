import type { AuthGuards } from "./auth";
import type { SecurityHeaders } from "./securityHeaders";
import { EventApiMessage, EventEndpoint } from "@shared/domain/events";
import { AircraftApiRoute } from "@shared/domain/aircraft";
import { FIRE_LATEST_ROUTE } from "@shared/domain/fireDayNight";
import { NEWS_LATEST_ROUTE } from "@shared/domain/newsSource";
import {
  AUTH_TOKEN_ROUTE,
  HttpContentCoding,
  HttpHeader,
  HttpMediaType,
  HttpMethod,
  HttpStatus,
} from "@shared/http";
import { getGdeltCache } from "./gdeltCache";
import { getAisCache } from "./aisCache";
import { getFirmsCache } from "./firmsCache";
import { getNewsCache } from "./newsCache";
import { getCyclonesCache } from "./cyclonesCache";
import { getAircraftCache } from "./aircraftCache";
import {
  getAircraftDossier,
  isValidCallsign,
} from "./dossierCache";
import { normalizeIcao24 } from "@shared/domain/aircraftDossier";
import { getCycloneDossier } from "./cyclonesDossierCache";
import { CycloneRoute, parseCycloneStormId } from "@shared/domain/cyclones";
import {
  SHIPS_LATEST_ROUTE,
  SHIP_DATA_UNAVAILABLE_MESSAGE,
} from "@shared/domain/ships";
import { gzip } from "zlib";
import { promisify } from "util";

const gzipAsync = promisify(gzip);

enum ApiErrorMessage {
  MethodNotAllowed = "Method Not Allowed",
  InvalidStormId = "Invalid stormId",
  InvalidIcao24 = "Invalid ICAO24 hex code",
  AircraftNotFound = "Aircraft not found",
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
    const acceptEncoding = req.headers.get(HttpHeader.AcceptEncoding) ?? "";
    if (acceptEncoding.includes(HttpContentCoding.Gzip)) {
      const compressed = (await gzipAsync(Buffer.from(json))) as Uint8Array;
      const compressedBody = Uint8Array.from(compressed);
      return withSecurityHeaders(
        new Response(compressedBody, {
          headers: {
            [HttpHeader.ContentType]: HttpMediaType.Json,
            [HttpHeader.ContentEncoding]: HttpContentCoding.Gzip,
          },
        }),
      );
    }
    return withSecurityHeaders(
      new Response(json, {
        headers: { [HttpHeader.ContentType]: HttpMediaType.Json },
      }),
    );
  }

  function jsonError(body: Record<string, unknown>, status: number): Response {
    return withSecurityHeaders(Response.json(body, { status }));
  }

  // ── Route guards ─────────────────────────────────────────────────────
  // Every authed route repeated the same guardAuth check; the param routes
  // also repeated the method-405 + stormId validation. These wrap it once.
  type RouteRequest = Request &
    Readonly<{
      params?: Readonly<Record<string, string | undefined>>;
    }>;
  type Handler = (req: RouteRequest) => Promise<Response>;

  function authedGet(handler: (req: Request) => Promise<Response>) {
    return {
      async GET(req: Request) {
        const blocked = await guardAuth(req);
        if (blocked) return blocked;
        return handler(req);
      },
    };
  }

  /** Return an authenticated cached response or 503 until ready. */
  function authedCachedGet<C extends { error?: string | null }>(
    getCache: () => C,
    isReady: (cache: C) => boolean,
    emptyMessage: string,
    buildBody: (cache: C) => unknown,
  ) {
    return authedGet(async (req) => {
      const cache = getCache();
      if (!isReady(cache)) {
        return jsonError(
          { error: cache.error ?? emptyMessage },
          HttpStatus.ServiceUnavailable,
        );
      }
      return jsonResponse(req, buildBody(cache));
    });
  }

  function authedFnGet(handler: Handler): Handler {
    return async (req) => {
      const blocked = await guardAuth(req);
      if (blocked) return blocked;
      if (req.method !== HttpMethod.Get) {
        return withSecurityHeaders(
          new Response(ApiErrorMessage.MethodNotAllowed, {
            status: HttpStatus.MethodNotAllowed,
          }),
        );
      }
      return handler(req);
    };
  }

  function authedStormGet(
    handler: (req: RouteRequest, stormId: string) => Promise<Response>,
  ): Handler {
    return authedFnGet(async (req) => {
      const stormId = parseCycloneStormId(req.params?.stormId);
      if (!stormId) {
        return jsonError(
          { error: ApiErrorMessage.InvalidStormId },
          HttpStatus.BadRequest,
        );
      }
      return handler(req, stormId);
    });
  }

  return {
    [AUTH_TOKEN_ROUTE]: {
      async GET(req: Request) {
        const blocked = guardRateLimit(req);
        if (blocked) return blocked;

        const token = await generateToken();
        const res = new Response(JSON.stringify({ ok: true }), {
          status: HttpStatus.Ok,
          headers: {
            [HttpHeader.ContentType]: HttpMediaType.Json,
          },
        });
        res.headers.append(HttpHeader.SetCookie, tokenCookieHeader(token));
        res.headers.append(HttpHeader.SetCookie, expireOldCookieHeader());
        return withSecurityHeaders(res);
      },
    },

    [EventEndpoint.Latest]: authedCachedGet(
      getGdeltCache,
      (c) => Boolean(c.data),
      EventApiMessage.Unavailable,
      (c) => ({ data: c.data, fetchedAt: c.fetchedAt }),
    ),

    [SHIPS_LATEST_ROUTE]: authedCachedGet(
      getAisCache,
      (c) => Boolean(c.data),
      SHIP_DATA_UNAVAILABLE_MESSAGE,
      (c) => ({ data: c.data, vesselCount: c.vesselCount, connected: c.connected }),
    ),

    [FIRE_LATEST_ROUTE]: authedCachedGet(
      getFirmsCache,
      (c) => Boolean(c.data),
      "No fire data available yet",
      (c) => ({ data: c.data, fetchedAt: c.fetchedAt, fireCount: c.fireCount }),
    ),

    [CycloneRoute.Latest]: authedCachedGet(
      getCyclonesCache,
      (c) => Boolean(c.body),
      "No cyclone data available yet",
      (c) => ({ activeStorms: c.body?.activeStorms, fetchedAt: c.fetchedAt, stormCount: c.stormCount }),
    ),

    [AircraftApiRoute.States]: authedGet(async (req) => {
      const cache = getAircraftCache();
      return jsonResponse(req, {
        ac: cache.body?.ac ?? [],
        fetchedAt: cache.fetchedAt,
        aircraftCount: cache.aircraftCount,
        error: cache.error,
        source: cache.source,
      });
    }),

    [NEWS_LATEST_ROUTE]: authedCachedGet(
      getNewsCache,
      (c) => c.items.length > 0,
      "No news data available yet",
      (c) => ({ items: c.items, fetchedAt: c.fetchedAt, itemCount: c.itemCount }),
    ),

    [`${AircraftApiRoute.Dossier}/:icao24`]: authedFnGet(async (req) => {
      const { icao24 = "" } = req.params ?? {};
      const normalizedIcao24 = normalizeIcao24(String(icao24));
      if (!normalizedIcao24) {
        return jsonError(
          { error: ApiErrorMessage.InvalidIcao24 },
          HttpStatus.BadRequest,
        );
      }

      const url = new URL(req.url);
      const callsignRaw = url.searchParams.get("callsign") ?? "";
      const callsign =
        callsignRaw && isValidCallsign(callsignRaw) ? callsignRaw : undefined;

      const dossier = await getAircraftDossier(normalizedIcao24, callsign);
      if (!dossier) {
        return jsonError(
          { error: ApiErrorMessage.AircraftNotFound },
          HttpStatus.NotFound,
        );
      }

      return jsonResponse(req, { dossier });
    }),

    [`${CycloneRoute.Dossier}/:stormId`]: authedStormGet(async (req, stormId) =>
      jsonResponse(req, await getCycloneDossier(stormId)),
    ),

  };
}
