import type { DatasetCompleteness, DatasetEntity } from "@/workers/data/datasetStore";
import type { PointSourceFetchSnapshot } from "@/workers/data/sourceRuntime";
import { isRecord } from "@shared/geo";

export enum SourceFetchFailure {
  Request = "Request",
  Payload = "Payload",
}

export type SourceFetch = (
  input: string,
  init: RequestInit,
) => Promise<Response>;

export type SourceTransport = Readonly<{
  url: string;
  headers: Readonly<Record<string, string>>;
  timeoutMs?: number;
  fetchImpl?: SourceFetch;
}>;

export type SourceFailureMessages = Readonly<
  Record<SourceFetchFailure, string>
>;

export class SourceFetchError extends Error {
  constructor(
    readonly failure: SourceFetchFailure,
    messages: SourceFailureMessages,
    readonly httpStatus: number | null = null,
  ) {
    super(messages[failure]);
    this.name = SourceFetchError.name;
  }
}

export function serverFetchedAt(payload: unknown): number | null {
  const value = isRecord(payload) ? payload.fetchedAt : undefined;
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function serverError(payload: unknown): string | null {
  const value = isRecord(payload) ? payload.error : undefined;
  return typeof value === "string" && value.length > 0 ? value : null;
}

function request(
  fetchImpl: SourceFetch,
  transport: SourceTransport,
): Promise<Response> {
  const controller = new AbortController();
  const timeout =
    transport.timeoutMs === undefined
      ? null
      : setTimeout(() => controller.abort(), transport.timeoutMs);
  return fetchImpl(transport.url, {
    headers: transport.headers,
    signal: controller.signal,
  }).finally(() => {
    if (timeout !== null) clearTimeout(timeout);
  });
}

export abstract class RemoteSource<TEntity extends DatasetEntity> {
  protected abstract readonly transport: SourceTransport;
  protected abstract readonly failureMessages: SourceFailureMessages;
  protected abstract readonly completeness: DatasetCompleteness;

  protected abstract items(payload: unknown): readonly unknown[] | null;

  protected abstract toEntity(
    item: unknown,
    observedAt: number,
    index: number,
  ): TEntity | null;

  failure(
    failure: SourceFetchFailure,
    httpStatus: number | null = null,
  ): SourceFetchError {
    return new SourceFetchError(failure, this.failureMessages, httpStatus);
  }

  async fetchSnapshot(
    now: () => number = Date.now,
    fetchImpl: SourceFetch = this.transport.fetchImpl ?? globalThis.fetch,
  ): Promise<PointSourceFetchSnapshot<TEntity>> {
    const response = await request(fetchImpl, this.transport);
    if (!response.ok) {
      throw this.failure(SourceFetchFailure.Request, response.status);
    }

    const payload: unknown = await response.json();
    const items = this.items(payload);
    if (!items) throw this.failure(SourceFetchFailure.Payload);

    const observedAt = serverFetchedAt(payload) ?? now();
    const upstreamError = serverError(payload);
    const byId = new Map<string, TEntity>();
    for (const [index, item] of items.entries()) {
      const entity = this.toEntity(item, observedAt, index);
      if (entity) byId.set(entity.id, entity);
    }
    return {
      completeness: this.completeness,
      entities: [...byId.values()],
      observedAt,
      ...(upstreamError ? { upstreamError } : {}),
    };
  }
}
