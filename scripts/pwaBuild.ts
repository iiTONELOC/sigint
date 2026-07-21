import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { join, sep } from "node:path";

export const BUILD_ID_LENGTH = 20;

const GENERATED_ARTIFACTS = new Set(["build-meta.json", "sw.js"]);

function normalizeArtifactPath(path: string): string {
  return path.split(sep).join("/");
}

export async function collectArtifactPaths(
  root: string,
  relativeDirectory = "",
): Promise<string[]> {
  const directory = join(root, relativeDirectory);
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];

  for (const entry of entries) {
    const relativePath = normalizeArtifactPath(
      join(relativeDirectory, entry.name),
    );
    if (entry.isDirectory()) {
      paths.push(...(await collectArtifactPaths(root, relativePath)));
      continue;
    }
    if (entry.isFile()) paths.push(relativePath);
  }

  return paths.sort();
}

export async function createBuildId(
  root: string,
  artifactPaths: readonly string[],
): Promise<string> {
  const hash = createHash("sha256");

  for (const artifactPath of [...artifactPaths].sort()) {
    hash.update(artifactPath);
    hash.update("\0");
    hash.update(await readFile(join(root, artifactPath)));
    hash.update("\0");
  }

  return hash.digest("hex").slice(0, BUILD_ID_LENGTH);
}

export function selectIdentityArtifacts(
  artifactPaths: readonly string[],
): string[] {
  return artifactPaths
    .filter((path) => !GENERATED_ARTIFACTS.has(path))
    .sort();
}

export function createPrecacheUrls(
  artifactPaths: readonly string[],
): string[] {
  const urls = artifactPaths
    .filter(
      (path) => !GENERATED_ARTIFACTS.has(path) && !path.endsWith(".map"),
    )
    .map((path) => (path === "index.html" ? "/" : `/${path}`));

  return [...new Set(urls)].sort();
}
