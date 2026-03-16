import {
  lookupAircraftMetadata,
  lookupAircraftMetadataBatch,
} from "./aircraftMetadata";
import { generateToken, guardAuth, guardRateLimit } from "./auth";
import { getGdeltCache } from "./gdeltCache";
import { getAisCache } from "./aisCache";

// ── Gzip response helper ─────────────────────────────────────────────

function jsonResponse(req: Request, body: unknown): Response {
  const json = JSON.stringify(body);
  const acceptEncoding = req.headers.get("accept-encoding") ?? "";
  if (acceptEncoding.includes("gzip")) {
    const compressed = Bun.gzipSync(Buffer.from(json));
    return new Response(compressed, {
      headers: {
        "Content-Type": "application/json",
        "Content-Encoding": "gzip",
      },
    });
  }
  return new Response(json, {
    headers: { "Content-Type": "application/json" },
  });
}

export const apiRoutes = {
  // ── Auth token ──────────────────────────────────────────────────
  // Rate limited but no token required (this is how you get one).
  "/api/auth/token": {
    GET(req: Request) {
      const blocked = guardRateLimit(req);
      if (blocked) return blocked;

      const token = generateToken();
      return Response.json({ token });
    },
  },

  // ── Aircraft metadata ──────────────────────────────────────────
  "/api/aircraft/metadata/:icao24": async (req: any) => {
    const blocked = guardAuth(req);
    if (blocked) return blocked;

    const { method, params } = req;
    const { icao24 = "" } = params ?? {};

    if (method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const item = await lookupAircraftMetadata(String(icao24));
    return Response.json({ item });
  },

  "/api/aircraft/metadata/batch": {
    async GET(req: Request) {
      const blocked = guardAuth(req);
      if (blocked) return blocked;

      const url = new URL(req.url);
      const idsParam = url.searchParams.get("ids") ?? "";
      const icao24 = idsParam
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean);

      const items = await lookupAircraftMetadataBatch(icao24);
      return Response.json({ items });
    },
  },

  // ── GDELT events ───────────────────────────────────────────────
  "/api/events/latest": {
    GET(req: Request) {
      const blocked = guardAuth(req);
      if (blocked) return blocked;

      const cache = getGdeltCache();
      if (!cache.data) {
        return Response.json(
          { error: cache.error ?? "No data available yet" },
          { status: 503 },
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
    GET(req: Request) {
      const blocked = guardAuth(req);
      if (blocked) return blocked;

      const cache = getAisCache();
      if (!cache.data) {
        return Response.json(
          { error: cache.error ?? "No AIS data available yet" },
          { status: 503 },
        );
      }

      return jsonResponse(req, {
        data: cache.data,
        vesselCount: cache.vesselCount,
        connected: cache.connected,
      });
    },
  },
};
