import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  BUILD_ID_LENGTH,
  collectArtifactPaths,
  createBuildId,
  createPrecacheUrls,
  selectIdentityArtifacts,
} from "../../scripts/pwaBuild";

const projectRoot = resolve(import.meta.dir, "../..");
const temporaryDirectories: string[] = [];

async function createArtifactDirectory(): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), "sigint-pwa-test-"));
  temporaryDirectories.push(directory);
  await mkdir(join(directory, "workers"));
  await writeFile(join(directory, "index.html"), "shell-a");
  await writeFile(join(directory, "workers/dataWorker.js"), "worker-a");
  await writeFile(join(directory, "app.js.map"), "map-a");
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("PWA build identity", () => {
  test("is deterministic for the same artifact set", async () => {
    const directory = await createArtifactDirectory();
    const paths = selectIdentityArtifacts(
      await collectArtifactPaths(directory),
    );

    const first = await createBuildId(directory, paths);
    const second = await createBuildId(directory, [...paths].reverse());

    expect(first).toBe(second);
    expect(first).toHaveLength(BUILD_ID_LENGTH);
  });

  test("changes when artifact content changes", async () => {
    const directory = await createArtifactDirectory();
    const paths = selectIdentityArtifacts(
      await collectArtifactPaths(directory),
    );
    const first = await createBuildId(directory, paths);

    await writeFile(join(directory, "workers/dataWorker.js"), "worker-b");
    const second = await createBuildId(directory, paths);

    expect(second).not.toBe(first);
  });

  test("binds the shell and worker URLs into one precache manifest", async () => {
    const directory = await createArtifactDirectory();
    const urls = createPrecacheUrls(await collectArtifactPaths(directory));

    expect(urls).toContain("/");
    expect(urls).toContain("/workers/dataWorker.js");
    expect(urls).not.toContain("/index.html");
    expect(urls).not.toContain("/app.js.map");
  });
});

describe("production service worker", () => {
  test("uses an injected build identity and atomic cache install", async () => {
    const source = await Bun.file(
      join(projectRoot, "src/client/workers/serviceWorker.ts"),
    ).text();

    expect(source).toContain("__SIGINT_BUILD_ID__");
    expect(source).toContain("cache.addAll(PRECACHE_URLS)");
    expect(source).not.toContain("CACHE_VERSION");
    expect(source).not.toContain("Promise.allSettled");
    expect(source).not.toContain("cache.put(");
  });

  test("activates only the waiting build through a typed command", async () => {
    const source = await Bun.file(
      join(projectRoot, "src/client/lib/runtime/swRegistration.ts"),
    ).text();

    expect(source).toContain("registration?.waiting?.postMessage");
    expect(source).toContain("SW_ACTIVATE_WAITING");
    expect(source).not.toContain("controller?.postMessage");
  });

  test("checks on visibility, connectivity, and a named cadence", async () => {
    const source = await Bun.file(
      join(projectRoot, "src/client/lib/runtime/swRegistration.ts"),
    ).text();

    expect(source).toContain('"visibilitychange"');
    expect(source).toContain('"online"');
    expect(source).toContain("UPDATE_CHECK_INTERVAL_MS");
    expect(source).toContain("updateCheck");
  });
});

type ManifestIcon = {
  src: string;
  sizes: string;
  type: string;
  purpose?: string;
};

type WebManifest = {
  name?: string;
  short_name?: string;
  start_url?: string;
  display?: string;
  theme_color?: string;
  background_color?: string;
  icons: ManifestIcon[];
};

describe("web manifest", () => {
  test("contains installable metadata and icons", async () => {
    const manifest: WebManifest = await Bun.file(
      join(projectRoot, "public/manifest.json"),
    ).json();
    const sizes = manifest.icons.map((icon) => icon.sizes);

    expect(manifest.name).toBeDefined();
    expect(manifest.short_name).toBeDefined();
    expect(manifest.start_url).toBe("/");
    expect(manifest.display).toBe("standalone");
    expect(manifest.theme_color).toMatch(/^#/);
    expect(manifest.background_color).toMatch(/^#/);
    expect(sizes).toContain("192x192");
    expect(sizes).toContain("384x384");
    expect(
      manifest.icons.some((icon) => icon.purpose?.includes("maskable")),
    ).toBe(true);
  });
});
