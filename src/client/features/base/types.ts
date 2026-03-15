// ── Provider interface ────────────────────────────────────────────────

export interface ProviderSnapshot<TEntity> {
  entities: TEntity[];
  lastUpdatedAt: number | null;
  loading: boolean;
  error: Error | null;
}

export interface DataProvider<TEntity> {
  readonly id: string;
  hydrate(): TEntity[] | null;
  refresh(): Promise<TEntity[]>;
  getData(): Promise<TEntity[]>;
  getSnapshot(): ProviderSnapshot<TEntity>;
}

// ── Base point shape ─────────────────────────────────────────────────

export interface BasePoint {
  id: string;
  type: string;
  lat: number;
  lon: number;
  timestamp?: string;
}

// ── Feature rendering contracts ──────────────────────────────────────

export interface TickerRendererProps {
  data: unknown;
  textColor: string;
  dimColor: string;
}

export interface FeatureDefinition<TData = unknown, TFilter = unknown> {
  /** Unique key matching the DataPoint type discriminator */
  id: string;

  /** Display metadata */
  label: string;
  icon: React.ForwardRefExoticComponent<any>;

  /** Does this item match the given filter? */
  matchesFilter: (item: BasePoint & { data: TData }, filter: TFilter) => boolean;

  /** Default filter state */
  defaultFilter: TFilter;

  /** Build detail panel rows from entity data */
  buildDetailRows: (data: TData, timestamp?: string) => [string, string][];

  /** Render ticker content for this feature type */
  TickerContent: React.ComponentType<TickerRendererProps>;

  /** Optional: filter control component for the header */
  FilterControl?: React.ComponentType<any>;
}
