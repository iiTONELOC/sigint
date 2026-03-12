import { serve } from "bun";
import { join } from "path";

const port = Number(process.env.PORT ?? 3000);
const distDir = join(import.meta.dir, "../dist");
const publicDir = join(import.meta.dir, "../public");

const serveFile = async (filePath: string): Promise<Response> => {
  const file = Bun.file(filePath);
  if (await file.exists()) return new Response(file);
  return new Response("Not found", { status: 404 });
};

const server = serve({
  hostname: "0.0.0.0",
  port,
  development: false,
  async fetch(req) {
    const { pathname } = new URL(req.url);

    // Fonts served from public/
    if (pathname === "/fonts.css" || pathname.startsWith("/fonts/")) {
      return serveFile(join(publicDir, pathname));
    }

    // Try exact file in dist/
    const exactFile = Bun.file(join(distDir, pathname));
    if (await exactFile.exists()) return new Response(exactFile);

    // SPA fallback — always serve dist/index.html
    return serveFile(join(distDir, "index.html"));
  },
});

console.log(`🚀 Production server running at ${server.url}`);
