import { basename, normalize, relative, resolve } from "node:path";
import type { SecurityHeaders } from "./api/securityHeaders";

const WORKER_SRC_DIR = resolve(import.meta.dir, "../client/workers");
const DEFAULT_STATIC_ROUTE_OPTIONS: StaticRouteOptions = {
  buildWorkersFromSource: true,
};

type StaticRouteOptions = {
  buildWorkersFromSource: boolean;
};

type StaticFileServer = (pathname: string) => Promise<Response>;
type StaticRouteHandler = (request: Request) => Promise<Response>;

const WORKER_BUILD_FAILED_STATUS = 500;

function workerScriptResponse(code: string): Response {
  return new Response(code, {
    headers: {
      "Content-Type": "text/javascript; charset=utf-8",
      "Cache-Control": "no-cache, must-revalidate",
    },
  });
}

async function buildWorkerFromTs(pathname: string): Promise<Response | null> {
  if (!pathname.endsWith(".js")) return null;
  const name = basename(pathname, ".js");
  const entry = resolve(WORKER_SRC_DIR, `${name}.ts`);
  if (!(await Bun.file(entry).exists())) return null;

  const built = await Bun.build({
    entrypoints: [entry],
    target: "browser",
    format: "esm",
  });
  const [output] = built.outputs;
  if (built.success && output) return workerScriptResponse(await output.text());

  const logs = built.logs.map((log) => log.message).join("\n");
  console.error(`Worker build failed for ${name}.ts\n${logs}`);
  return new Response(logs, {
    status: WORKER_BUILD_FAILED_STATUS,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export function safePath(base: string, urlPath: string): string | null {
  const decoded = decodeURIComponent(urlPath);
  if (decoded.includes("..") || decoded.includes("\0")) return null;
  const normalized = normalize(decoded);
  const resolved = resolve(base, "." + normalized);
  const rel = relative(base, resolved);
  if (!rel || rel.startsWith("..") || rel.startsWith("/")) return null;
  return resolved;
}

export function createStaticFileServer(
  staticDir: string,
  security: SecurityHeaders,
): StaticFileServer {
  const { withSecurityHeaders } = security;
  return async function serveStaticFile(pathname: string): Promise<Response> {
    const safe = safePath(staticDir, pathname);
    if (!safe) return new Response("Forbidden", { status: 403 });

    const file = Bun.file(safe);
    if (!(await file.exists())) {
      return new Response("Not found", { status: 404 });
    }

    return withSecurityHeaders(new Response(file));
  };
}

export function createStaticRoutes(
  staticDir: string,
  security: SecurityHeaders,
  options: StaticRouteOptions = DEFAULT_STATIC_ROUTE_OPTIONS,
): Record<string, StaticRouteHandler> {
  const serveStaticFile = createStaticFileServer(staticDir, security);

  return {
    "/fonts.css": async () => serveStaticFile("/fonts.css"),

    "/fonts/*": async (request) => {
      const { pathname } = new URL(request.url);
      return serveStaticFile(pathname);
    },

    "/data/*": async (request) => {
      const { pathname } = new URL(request.url);
      return serveStaticFile(pathname);
    },

    "/workers/*": async (request) => {
      const { pathname } = new URL(request.url);
      if (!options.buildWorkersFromSource) return serveStaticFile(pathname);
      return (await buildWorkerFromTs(pathname)) ?? serveStaticFile(pathname);
    },

    "/sw.js": async () => {
      const response = await serveStaticFile("/sw.js");
      response.headers.set("Cache-Control", "no-cache, must-revalidate");
      response.headers.set("Service-Worker-Allowed", "/");
      return response;
    },

    "/manifest.json": async () => serveStaticFile("/manifest.json"),

    "/icons/*": async (request) => {
      const { pathname } = new URL(request.url);
      return serveStaticFile(pathname);
    },
  };
}
