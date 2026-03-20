// ── Provider type ────────────────────────────────────────────────

export type ProviderSnapshot<TEntity> = {
  entities: TEntity[];
  lastUpdatedAt: number | null;
  loading: boolean;
  error: Error | null;
};

export type DataProvider<TEntity> = {
  readonly id: string;
  hydrate(): Promise<TEntity[] | null>;
  refresh(): Promise<TEntity[]>;
  getData(pollInterval?: number): Promise<TEntity[]>;
  getSnapshot(): ProviderSnapshot<TEntity>;
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

export type FeatureDefinition<TData = unknown, TFilter = unknown> = {
  /** Unique key matching the DataPoint type discriminator */
  id: string;

  /** Display metadata */
  label: string;
  icon: React.ForwardRefExoticComponent<any>;

  /** Icon rendering props — filled icons (aircraft, events) vs stroked */
  iconProps: Record<string, unknown>;

  /** Does this item match the given filter? */
  matchesFilter: (
    item: BasePoint & { data: TData },
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
