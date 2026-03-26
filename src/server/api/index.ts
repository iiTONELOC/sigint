import {
  generateToken,
  tokenCookieHeader,
  guardAuth,
  guardRateLimit,
} from "./auth";
import { getGdeltCache } from "./gdeltCache";
import { getAisCache } from "./aisCache";
import { getFirmsCache } from "./firmsCache";
import { getNewsCache } from "./newsCache";
import {
  getAircraftDossier,
  isValidIcao24,
  isValidCallsign,
} from "./dossierCache";
import { withSecurityHeaders } from "./securityHeaders";

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
      return withSecurityHeaders(
        new Response(JSON.stringify({ ok: true }), {
          status: 200,
          headers: {
            "Content-Type": "application/json",
            "Set-Cookie": tokenCookieHeader(token),
          },
        }),
      );
    },
  },

  // ── Full aircraft metadata DB — versioned route, cached locally by client ──
  // Bump to /db/v2, /db/v3 etc. when ac-db.ndjson is rebuilt.
  // Client stores which version it has — exact match = no download.
  "/api/aircraft/metadata/db/v1": {
    async GET(req: Request) {
      const blocked = await guardAuth(req);
      if (blocked) return blocked;

      const dbFile = Bun.file(new URL("../data/ac-db.ndjson", import.meta.url));
      if (!(await dbFile.exists())) {
        return withSecurityHeaders(
          new Response("DB not found", { status: 404 }),
        );
      }

      const bytes = await dbFile.arrayBuffer();

      const acceptEncoding = req.headers.get("accept-encoding") ?? "";
      if (acceptEncoding.includes("gzip")) {
        const compressed = Bun.gzipSync(new Uint8Array(bytes));
        return withSecurityHeaders(
          new Response(compressed, {
            headers: {
              "Content-Type": "application/x-ndjson",
              "Content-Encoding": "gzip",
              "Cache-Control": "public, max-age=31536000, immutable",
            },
          }),
        );
      }

      return withSecurityHeaders(
        new Response(bytes, {
          headers: {
            "Content-Type": "application/x-ndjson",
            "Cache-Control": "public, max-age=31536000, immutable",
          },
        }),
      );
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
};
