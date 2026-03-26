import { serve } from "bun";
import { resolve } from "path";
import index from "../../index.html";
import { apiRoutes } from "./api";
import { startGdeltPolling } from "./api/gdeltCache";
import { startAisPolling } from "./api/aisCache";
import { startFirmsPolling } from "./api/firmsCache";
import { startNewsPolling } from "./api/newsCache";
import { createStaticRoutes } from "./staticRoutes";

const publicDir = resolve(import.meta.dir, "../../public");

const server = serve({
  hostname: "0.0.0.0",
  port: 3000,
  maxRequestBodySize: 1024 * 1024, // 1 MB — all API routes are GET, this is a safety cap
  routes: {
    ...createStaticRoutes(publicDir),

    ...apiRoutes,

    "/*": index,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Dev server running at ${server.url}`);
console.log(`🔒 Access via https://localhost (Caddy reverse proxy)`);
startGdeltPolling();
startAisPolling();
startFirmsPolling();
startNewsPolling();
