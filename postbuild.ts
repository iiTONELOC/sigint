#!/usr/bin/env bun
// ── Post-build: inject hashed asset URLs into service worker ─────────
// Run after build.ts: bun run build.ts && bun run postbuild.ts
//
// Reads dist/ output, finds hashed JS/CSS chunks, and prepends
// self.__PRECACHE_MANIFEST to the SW file so it knows what to cache.

import { readdir, readFile, writeFile, copyFile, mkdir } from "fs/promises";
import { join, resolve } from "path";
import { existsSync } from "fs";

const distDir = resolve(import.meta.dir, "dist");
const publicDir = resolve(import.meta.dir, "public");
const swSrc = join(publicDir, "sw.js");
const swDest = join(distDir, "sw.js");

if (!existsSync(distDir)) {
  console.error("❌ dist/ not found — run build.ts first");
  process.exit(1);
}

// Find hashed assets in dist/
const files = await readdir(distDir);
const hashedAssets = files.filter(
  (f) =>
    (f.endsWith(".js") || f.endsWith(".css") || f.endsWith(".svg")) &&
    f !== "sw.js" &&
    !f.endsWith(".map"),
);

console.log(`📦 Found ${hashedAssets.length} hashed assets to precache:`);
for (const f of hashedAssets) console.log(`   /${f}`);

// Build the manifest injection
const manifest = hashedAssets.map((f) => `"/${f}"`).join(", ");
const injection = `self.__PRECACHE_MANIFEST = [${manifest}];\n`;

// Read SW source, prepend manifest, write to dist/
const swSource = await readFile(swSrc, "utf-8");
await writeFile(swDest, injection + swSource, "utf-8");
console.log(`✅ Wrote ${swDest} with ${hashedAssets.length} precache entries`);

// Copy manifest.json and icons to dist/ so prod server can serve from either location
const manifestSrc = join(publicDir, "manifest.json");
if (existsSync(manifestSrc)) {
  await copyFile(manifestSrc, join(distDir, "manifest.json"));
  console.log("✅ Copied manifest.json to dist/");
}

const iconsSrc = join(publicDir, "icons");
if (existsSync(iconsSrc)) {
  const iconsDistDir = join(distDir, "icons");
  if (!existsSync(iconsDistDir)) await mkdir(iconsDistDir, { recursive: true });
  const icons = await readdir(iconsSrc);
  for (const icon of icons) {
    await copyFile(join(iconsSrc, icon), join(iconsDistDir, icon));
  }
  console.log(`✅ Copied ${icons.length} icons to dist/icons/`);
}

console.log("\n🎉 PWA post-build complete\n");
