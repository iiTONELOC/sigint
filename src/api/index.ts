import {
  lookupAircraftMetadata,
  lookupAircraftMetadataBatch,
} from "./aircraftMetadata";

export const apiRoutes = {
  "/api/hello": {
    async GET() {
      return Response.json({
        message: "Hello, world!",
        method: "GET",
      });
    },
    async PUT() {
      return Response.json({
        message: "Hello, world!",
        method: "PUT",
      });
    },
  },
  "/api/hello/:name": async (req: any) => {
    const name = req.params.name;
    return Response.json({
      message: `Hello, ${name}!`,
    });
  },

  "/api/aircraft/metadata/:icao24": async (req: any) => {
    const { method, params } = req;
    const { icao24 = "" } = params ?? {};

    if (method !== "GET") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const item = await lookupAircraftMetadata(String(icao24));
    return Response.json({ item });
  },

  "/api/aircraft/metadata/batch": {
    async POST(req: Request) {
      const body = (await req.json().catch(() => ({}))) as {
        icao24?: unknown;
      };
      const { icao24: rawIcao24 = [] } = body;
      const icao24 = Array.isArray(rawIcao24)
        ? rawIcao24.map((v) => String(v))
        : [];

      const items = await lookupAircraftMetadataBatch(icao24);
      return Response.json({ items });
    },
  },
};
