import { serve } from "bun";
import index from "./index.html";

const server = serve({
  hostname: "0.0.0.0",
  port: 3000,
  routes: {
    "/fonts.css": async () => {
      const file = Bun.file("public/fonts.css");

      if (!(await file.exists())) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(file);
    },

    "/fonts/*": async (req) => {
      const { pathname } = new URL(req.url);
      const filePath = `public${pathname}`;
      const file = Bun.file(filePath);

      if (!(await file.exists())) {
        return new Response("Not found", { status: 404 });
      }

      return new Response(file);
    },

    // Serve index.html for all unmatched routes.
    "/*": index,

    "/api/hello": {
      async GET(req) {
        return Response.json({
          message: "Hello, world!",
          method: "GET",
        });
      },
      async PUT(req) {
        return Response.json({
          message: "Hello, world!",
          method: "PUT",
        });
      },
    },

    "/api/hello/:name": async (req) => {
      const name = req.params.name;
      return Response.json({
        message: `Hello, ${name}!`,
      });
    },
  },

  development: process.env.NODE_ENV !== "production" && {
    // Enable browser hot reloading in development
    hmr: true,

    // Echo console logs from the browser to the server
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
