import type { DatasetCompleteness, DatasetEntity } from "@/workers/data/datasetStore";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";

export enum SourceFetchFailure {
  Request = "Request",
  Payload = "Payload",
}

export enum HttpHeader {
  UserAgent = "User-Agent",
  Accept = "Accept",
}

export enum MediaType {
  GeoJson = "application/geo+json",
}

export const CLIENT_USER_AGENT = "(sigint-dashboard, osint-tool)";

export type SourceFetchError = Error &
  Readonly<{ failure: SourceFetchFailure }>;

export type SourceTransport = Readonly<{
  url: string;
  headers: Readonly<Record<string, string>>;
}>;

export type SourceFailureMessages = Readonly<
  Record<SourceFetchFailure, string>
>;

export abstract class RemoteSource<TEntity extends DatasetEntity> {
  protected abstract readonly transport: SourceTransport;
  protected abstract readonly failureMessages: SourceFailureMessages;
  protected abstract readonly completeness: DatasetCompleteness;

  protected abstract items(payload: unknown): readonly unknown[] | null;

  protected abstract toEntity(
    item: unknown,
    observedAt: number,
  ): TEntity | null;

  protected failure(failure: SourceFetchFailure): SourceFetchError {
    return Object.assign(new Error(this.failureMessages[failure]), {
      failure,
    });
  }

  async fetchSnapshot(
    now: () => number = Date.now,
  ): Promise<PointSourceFetchSnapshot<TEntity>> {
    const response = await fetch(this.transport.url, {
      headers: this.transport.headers,
    });
    if (!response.ok) throw this.failure(SourceFetchFailure.Request);

    const payload: unknown = await response.json();
    const items = this.items(payload);
    if (!items) throw this.failure(SourceFetchFailure.Payload);

    const observedAt = now();
    const byId = new Map<string, TEntity>();
    for (const item of items) {
      const entity = this.toEntity(item, observedAt);
      if (entity) byId.set(entity.id, entity);
    }
    return {
      completeness: this.completeness,
      entities: [...byId.values()],
      observedAt,
    };
  }
}
