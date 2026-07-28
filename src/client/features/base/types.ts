import type { SourceState } from "@shared/source";

// ── Provider type ────────────────────────────────────────────────

export type ProviderFetchResult<TEntity> = Readonly<{
  data: TEntity[];
  source: SourceState;
}>;

export type ProviderSnapshot<TEntity> = {
  entities: TEntity[];
  source: SourceState | null;
  /**
   * Monotonic counter bumped on every refresh that produces a usable
   * snapshot (success path or stale-cache fallback). Subscribers gate
   * version-sensitive recomputation on this number while reference
   * equality on `entities` skips work that only depends on membership.
   * See diffEntities.ts.
   */
  version: number;
  lastUpdatedAt: number | null;
  loading: boolean;
  error: Error | null;
};

export type DataProvider<TEntity> = {
  readonly id: string;
  hydrate(): Promise<{ data: TEntity[]; stale: boolean } | TEntity[] | null>;
  refresh(): Promise<TEntity[]>;
  getData(pollInterval?: number): Promise<TEntity[]>;
  getSnapshot(): ProviderSnapshot<TEntity>;
  onChange?(cb: (() => void) | null): void;

  /**
   * Suspend onChange notifications. Returns a restore token that re-installs
   * the prior callback when passed to unmute(). Used by frontend.tsx during
   * the boot batch to coalesce hydration into a single React render.
   */
  mute(): () => void;
  /** Restore notifications via the token from mute() and fire once. */
  unmute(restore: () => void): void;
};

// ── Base point shape ─────────────────────────────────────────────────

export type BasePoint = {
  id: string;
  type: string;
  lat: number;
  lon: number;
  timestamp?: string;
};

// ── Feature rendering contracts ──────────────────────────────────────

export type TickerRendererProps = {
  data: unknown;
  textColor: string;
  dimColor: string;
};

export type FeatureDefinition<
  TData = unknown,
  TFilter = unknown,
  TType extends string = string,
> = {
  /** Unique key matching the DataPoint type discriminator */
  id: TType;

  /** Display metadata */
  label: string;
  icon: React.ForwardRefExoticComponent<any>;

  /** Icon rendering props — filled icons (aircraft, events) vs stroked */
  iconProps: Record<string, unknown>;

  /** Does this item match the given filter? */
  matchesFilter: (
    item: BasePoint & { type: TType; data: TData },
    filter: TFilter,
  ) => boolean;

  /** Default filter state */
  defaultFilter: TFilter;

  /** Build detail panel rows from entity data */
  buildDetailRows: (data: TData, timestamp?: string) => [string, string][];

  /** Render ticker content for this feature type */
  TickerContent: React.ComponentType<TickerRendererProps>;

  /** Optional: filter control component for the header */
  FilterControl?: React.ComponentType<any>;

  /** Optional: build searchable text for this entity (used by global search) */
  getSearchText?: (data: TData) => string;
};
