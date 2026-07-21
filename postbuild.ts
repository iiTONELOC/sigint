#!/usr/bin/env bun
import { existsSync } from "node:fs";
import { cp, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  collectArtifactPaths,
  createBuildId,
  createPrecacheUrls,
  selectIdentityArtifacts,
} from "./scripts/pwaBuild";

const distDir = resolve(import.meta.dir, "dist");
const publicDir = resolve(import.meta.dir, "public");
const serviceWorkerEntry = resolve(
  import.meta.dir,
  "src/client/workers/serviceWorker.ts",
);
const serviceWorkerOutput = join(distDir, "sw.js");
const buildMetadataOutput = join(distDir, "build-meta.json");
const STATIC_ARTIFACTS = [
  "data",
  "fonts",
  "fonts.css",
  "icons",
  "manifest.json",
] as const;
const REQUIRED_BUILD_ARTIFACTS = [
  "index.html",
  "workers/correlationWorker.js",
  "workers/dataWorker.js",
  "workers/pointWorker.js",
] as const;

type BuildMetadata = {
  buildId: string;
  artifacts: readonly string[];
  precacheUrls: readonly string[];
};

function fail(message: string): never {
  console.error(message);
  process.exit(1);
}

if (!existsSync(distDir)) fail("dist/ not found. Run build.ts first.");
if (!existsSync(serviceWorkerEntry)) {
  fail("Production service-worker source is missing.");
}

for (const artifact of STATIC_ARTIFACTS) {
  const source = join(publicDir, artifact);
  if (!existsSync(source)) fail(`Required public artifact is missing: ${artifact}`);
  await cp(source, join(distDir, artifact), { recursive: true, force: true });
}

for (const artifact of REQUIRED_BUILD_ARTIFACTS) {
  if (!existsSync(join(distDir, artifact))) {
    fail(`Required build artifact is missing: ${artifact}`);
  }
}

const artifactPaths = await collectArtifactPaths(distDir);
const identityArtifacts = selectIdentityArtifacts(artifactPaths);
const buildId = await createBuildId(distDir, identityArtifacts);
const precacheUrls = createPrecacheUrls(identityArtifacts);

const serviceWorkerBuild = await Bun.build({
  entrypoints: [serviceWorkerEntry],
  outdir: distDir,
  naming: "sw.js",
  target: "browser",
  format: "iife",
  minify: true,
  define: {
    __SIGINT_BUILD_ID__: JSON.stringify(buildId),
    __SIGINT_PRECACHE_URLS__: JSON.stringify(precacheUrls),
  },
});

if (!serviceWorkerBuild.success) {
  for (const log of serviceWorkerBuild.logs) console.error(log);
  fail("Production service-worker build failed.");
}
if (!existsSync(serviceWorkerOutput)) {
  fail("Production service-worker output is missing.");
}

const metadata: BuildMetadata = {
  buildId,
  artifacts: identityArtifacts,
  precacheUrls,
};
await writeFile(
  buildMetadataOutput,
  `${JSON.stringify(metadata, null, 2)}\n`,
  "utf8",
);

console.log(
  `PWA build ${buildId} contains ${precacheUrls.length} offline assets.`,
);
