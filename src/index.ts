import { serve } from "bun";
import index from "./index.html";
import { apiRoutes } from "./api";

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

    ...apiRoutes,

    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
