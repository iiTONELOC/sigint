const FIXTURE_LABEL_RE = /^[a-z0-9-]+$/;

export type FixtureOverride = Readonly<{ body: unknown }>;

export type FixtureOptions = Readonly<{
  enabled: boolean;
  label: string | undefined;
}>;

export enum FixtureOverrideErrorKind {
  InvalidLabel = "invalid-label",
  MissingFixture = "missing-fixture",
}

export class FixtureOverrideError extends Error {
  constructor(
    readonly kind: FixtureOverrideErrorKind,
    readonly environmentVariable: string | null,
    readonly label: string | null,
    readonly fixturePath: string | null,
  ) {
    super(
      FixtureOverrideError.message(
        kind,
        environmentVariable,
        label,
        fixturePath,
      ),
    );
    this.name = "FixtureOverrideError";
  }

  private static message(
    kind: FixtureOverrideErrorKind,
    environmentVariable: string | null,
    label: string | null,
    fixturePath: string | null,
  ): string {
    switch (kind) {
      case FixtureOverrideErrorKind.InvalidLabel:
        return `Invalid ${environmentVariable ?? "fixture"} value: ${label ?? ""}`;
      case FixtureOverrideErrorKind.MissingFixture:
        return `Fixture not found: ${fixturePath ?? ""}`;
    }
  }
}

/** Resolve a development fixture override for one feature. */
export async function resolveFixtureOverride(
  category: string,
  envVarName: string,
  opts: FixtureOptions,
): Promise<FixtureOverride | null> {
  if (!opts.enabled || !opts.label) return null;
  if (!FIXTURE_LABEL_RE.test(opts.label)) {
    throw new FixtureOverrideError(
      FixtureOverrideErrorKind.InvalidLabel,
      envVarName,
      opts.label,
      null,
    );
  }
  const path = `tests/fixtures/${category}/${opts.label}.json`;
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new FixtureOverrideError(
      FixtureOverrideErrorKind.MissingFixture,
      null,
      null,
      path,
    );
  }
  return { body: await file.json() };
}

export class FixtureOverrideOwner {
  private options: FixtureOptions = { enabled: false, label: undefined };

  constructor(private readonly category: string, private readonly environmentVariable: string) {}

  configure(options: FixtureOptions): void {
    this.options = options;
  }

  resolve(options: FixtureOptions = this.options): Promise<FixtureOverride | null> {
    return resolveFixtureOverride(this.category, this.environmentVariable, options);
  }
}
