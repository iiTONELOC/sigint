import type { DataPoint } from "@/features/base/dataPoints";
import type {
  DataWorkerEnvelope,
  DataWorkerEvent,
} from "@/workers/data/protocol";
import {
  createSourceAnswers,
  findQueryableSearchIds,
  isQueryableSourceId,
  type QueryableOwner,
  type QueryableSourceEntities,
  type QueryableSourceId,
  type SourceAnswers,
} from "@/workers/data/queryableSources";
import type { PointUiQuery } from "@/workers/data/uiQuery";
import type { RenderSearchSnapshot } from "@/workers/render/protocol";

enum CatalogSearchRevision {
  Initial = 0,
}

export enum SourceCatalogErrorKind {
  DuplicateSource = "The source is already registered",
  MissingSource = "The source is not registered",
}

export class SourceCatalogError extends Error {
  readonly kind: SourceCatalogErrorKind;
  readonly source: string;

  constructor(kind: SourceCatalogErrorKind, source: string) {
    super(kind);
    this.name = SourceCatalogError.name;
    this.kind = kind;
    this.source = source;
  }
}

export type CatalogSource<TEntity> = QueryableOwner<TEntity> &
  Readonly<{
    hydrate: () => Promise<void>;
    refresh: () => Promise<void>;
    start: () => Promise<void>;
  }>;

export type CatalogRenderBinding = Readonly<{
  publishRebase: () => void;
  publishSearch: (
    entityIds: readonly string[],
    revision: number,
    active: boolean,
  ) => void;
}>;

type SourceRegistration = Readonly<{
  answers: SourceAnswers;
  findSearchIds: (text: string) => readonly string[];
  hydrate: () => Promise<void>;
  render: CatalogRenderBinding;
  refresh: () => Promise<void>;
  start: () => Promise<void>;
  values: () => readonly DataPoint[];
}>;

export class SourceCatalog {
  private readonly registrations = new Map<
    QueryableSourceId,
    SourceRegistration
  >();
  private searchRevision = CatalogSearchRevision.Initial;
  private searchText: string | null = null;

  register<TId extends QueryableSourceId>(
    source: TId,
    owner: CatalogSource<QueryableSourceEntities[TId]>,
    render: CatalogRenderBinding,
    resolveEntity?: (id: string) => DataPoint | null,
  ): void {
    if (this.registrations.has(source)) {
      throw new SourceCatalogError(
        SourceCatalogErrorKind.DuplicateSource,
        source,
      );
    }
    this.registrations.set(source, {
      answers: createSourceAnswers(
        source,
        owner,
        resolveEntity,
      ),
      findSearchIds: (text) =>
        findQueryableSearchIds(source, owner.values(), text),
      hydrate: () => owner.hydrate(),
      render,
      refresh: () => owner.refresh(),
      start: () => owner.start(),
      values: () => owner.values(),
    });
  }

  has(source: string): source is QueryableSourceId {
    return (
      isQueryableSourceId(source) &&
      this.registrations.has(source)
    );
  }

  async startAll(): Promise<void> {
    await Promise.all(
      Array.from(this.registrations.values(), async (registration) => {
        await registration.hydrate();
        await registration.start();
      }),
    );
  }

  refresh(source: QueryableSourceId): Promise<void> {
    return this.registration(source).refresh();
  }

  values(source: QueryableSourceId): readonly DataPoint[] {
    return this.registration(source).values();
  }

  entity(
    source: QueryableSourceId,
    envelope: DataWorkerEnvelope,
    id: string,
  ): DataWorkerEvent | null {
    return this.registration(source).answers.entity(envelope, id);
  }

  query(
    source: QueryableSourceId,
    envelope: DataWorkerEnvelope,
    query: PointUiQuery,
  ): DataWorkerEvent | null {
    return this.registration(source).answers.query(envelope, query);
  }

  publishRenderRebases(): void {
    for (const registration of this.registrations.values()) {
      registration.render.publishRebase();
    }
  }

  setRenderSearch(search: RenderSearchSnapshot): void {
    if (search.revision < this.searchRevision) return;
    this.searchRevision = search.revision;
    this.searchText = search.text;
    for (const source of this.registrations.keys()) {
      this.refreshRenderSearch(source);
    }
  }

  refreshRenderSearch(source: QueryableSourceId): void {
    if (this.searchRevision === CatalogSearchRevision.Initial) return;
    const registration = this.registration(source);
    registration.render.publishSearch(
      this.searchText
        ? registration.findSearchIds(this.searchText)
        : [],
      this.searchRevision,
      this.searchText !== null,
    );
  }

  resetRenderSearch(): void {
    this.searchRevision = CatalogSearchRevision.Initial;
    this.searchText = null;
  }

  private registration(source: QueryableSourceId): SourceRegistration {
    const registration = this.registrations.get(source);
    if (registration) return registration;
    throw new SourceCatalogError(
      SourceCatalogErrorKind.MissingSource,
      source,
    );
  }
}
