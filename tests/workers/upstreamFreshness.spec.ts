import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { SourceCompleteness } from "@shared/source";
import { SourceStatus } from "@shared/domain/sourceStatus";
import {
  RemoteSource,
  SourceFetchFailure,
  type SourceFailureMessages,
  type SourceFetch,
  type SourceTransport,
} from "@/workers/data/source-model/remoteSource";
import { createPointSourceRuntime } from "@/workers/data/sourceRuntime";

type Item = Readonly<{ id: string }>;

const FETCHED_AT = 1_700_000_000_000;
const BROWSER_NOW = 1_800_000_000_000;

class TestFeed extends RemoteSource<Item> {
  protected readonly transport: SourceTransport = { url: "https://example.test/feed", headers: {} };
  protected readonly failureMessages: SourceFailureMessages = {
    [SourceFetchFailure.Request]: "rejected",
    [SourceFetchFailure.Payload]: "invalid",
  };
  protected readonly completeness = SourceCompleteness.Complete;
  protected items(payload: unknown): readonly unknown[] | null {
    return Array.isArray((payload as { data?: unknown }).data) ? (payload as { data: unknown[] }).data : null;
  }
  protected toEntity(item: unknown): Item | null {
    return typeof item === "string" ? { id: item } : null;
  }
}

function serving(body: unknown): SourceFetch {
  return async () => Response.json(body);
}

describe("remote source freshness", () => {
  test("uses the server's fetch time and error instead of the browser clock", async () => {
    const snapshot = await new TestFeed().fetchSnapshot(() => BROWSER_NOW, serving({ data: ["a"], fetchedAt: FETCHED_AT, error: "feed down" }));
    expect(snapshot.observedAt).toBe(FETCHED_AT);
    expect(snapshot.upstreamError).toBe("feed down");
  });

  test("falls back to the browser clock for feeds with no server envelope", async () => {
    const snapshot = await new TestFeed().fetchSnapshot(() => BROWSER_NOW, serving({ data: ["a"] }));
    expect(snapshot.observedAt).toBe(BROWSER_NOW);
    expect(snapshot.upstreamError).toBeUndefined();
  });
});

describe("source runtime with an upstream error", () => {
  test("applies the data but reports the source as cached with the server's error", async () => {
    const statuses: { status: string; error: string | null }[] = [];
    const runtime = createPointSourceRuntime<Item>({
      id: Domain.Events,
      pollIntervalMs: 1_000,
      readCache: async () => null,
      parseCache: () => null,
      persistCache: async () => undefined,
      deleteCache: () => undefined,
      fetchSnapshot: async () => ({ completeness: SourceCompleteness.Complete, entities: [{ id: "a" }], observedAt: FETCHED_AT, upstreamError: "feed down" }),
      publishStatus: (status) => statuses.push(status),
      publishPatch: () => undefined,
      schedule: () => () => undefined,
    });
    await runtime.refresh();
    expect(runtime.get("a")).toEqual({ id: "a" });
    expect(statuses.at(-1)).toMatchObject({ status: SourceStatus.Cached, error: "feed down", lastUpdatedAt: FETCHED_AT });
  });
});
