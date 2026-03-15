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
    async GET(req: Request) {
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
};
