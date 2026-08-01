import { type PointType } from "@shared/domain/pointType";
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
  type: PointType;
  lat: number;
  lon: number;
  timestamp?: string;
};

export enum IconStrokeWidth {
  None = 0,
  Standard = 2.5,
}
