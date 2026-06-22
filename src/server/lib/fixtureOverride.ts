// One owner for the dev-only fixture-override loader the aircraft and cyclones
// caches each copied verbatim. Loads tests/fixtures/<category>/<label>.json when
// overrides are enabled (non-production only — gated by the caller via opts.enabled,
// which the composition root sets from `!isProduction`). NOT a production data path.

const FIXTURE_LABEL_RE = /^[a-z0-9-]+$/;

export type FixtureOverride = { body: unknown };

export type FixtureOptions = Readonly<{
  enabled: boolean;
  label: string | undefined;
}>;

/**
 * Resolve a fixture override for a feature.
 * @param category fixture subdirectory under tests/fixtures (e.g. "aircraft").
 * @param envVarName the env var the label came from, for a clear error message.
 * @param opts whether overrides are enabled and the requested fixture label.
 * @returns the parsed fixture body, or null when overrides are off / no label.
 * @throws if the label is malformed or the fixture file is missing.
 */
export async function resolveFixtureOverride(
  category: string,
  envVarName: string,
  opts: FixtureOptions,
): Promise<FixtureOverride | null> {
  if (!opts.enabled || !opts.label) return null;
  if (!FIXTURE_LABEL_RE.test(opts.label)) {
    throw new Error(`Invalid ${envVarName} value: ${opts.label}`);
  }
  const path = `tests/fixtures/${category}/${opts.label}.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`Fixture not found: ${path}`);
  }
  return { body: await file.json() };
}
