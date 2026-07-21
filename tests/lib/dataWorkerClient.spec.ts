import { describe, expect, test } from "bun:test";
import {
  createDataWorkerClient,
  type DataWorkerTransport,
} from "@/lib/cache/dataWorkerClient";
import {
  DATA_WORKER_PROTOCOL_VERSION,
  parseDataWorkerCommand,
  parseDataWorkerEvent,
  type DataWorkerCommand,
} from "@/workers/data/protocol";

type WorkerHarness = Readonly<{
  transport: DataWorkerTransport;
  sent: unknown[];
  transfers: Transferable[][];
  emit: (value: unknown) => void;
}>;

function createWorkerHarness(): WorkerHarness {
  const sent: unknown[] = [];
  const transfers: Transferable[][] = [];
  const transport: DataWorkerTransport = {
    onmessage: null,
    onerror: null,
    postMessage(message: unknown, transfer: Transferable[] = []): void {
      sent.push(message);
      transfers.push(transfer);
    },
    terminate(): void {},
  };
  return {
    transport,
    sent,
    transfers,
    emit(value: unknown): void {
      transport.onmessage?.(
        new MessageEvent<unknown>("message", { data: value }),
      );
    },
  };
}

function latestCommand(harness: WorkerHarness): DataWorkerCommand {
  const command = parseDataWorkerCommand(harness.sent.at(-1));
  if (!command) throw new Error("Expected DataWorker command");
  return command;
}

function event(
  requestId: number | null,
  value: Readonly<Record<string, unknown>>,
): unknown {
  return {
    ...value,
    protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
    requestId,
  };
}

describe("DataWorker protocol", () => {
  test("rejects unknown versions and malformed commands", () => {
    expect(
      parseDataWorkerCommand({
        type: "init",
        protocolVersion: 99,
        requestId: 1,
      }),
    ).toBeNull();
    expect(
      parseDataWorkerCommand({
        type: "set",
        protocolVersion: DATA_WORKER_PROTOCOL_VERSION,
        requestId: 1,
        key: 42,
      }),
    ).toBeNull();
  });

  test("validates source snapshots at the worker boundary", () => {
    expect(
      parseDataWorkerEvent(
        event(null, {
          type: "sourceSnapshot",
          snapshot: {
            source: "earthquake",
            version: 3,
            status: "live",
            loading: false,
            count: 24,
            lastUpdatedAt: 2_000,
            error: null,
          },
        }),
      ),
    ).not.toBeNull();
    expect(
      parseDataWorkerEvent(
        event(null, {
          type: "sourceSnapshot",
          snapshot: {
            source: "earthquake",
            version: 3,
            status: "live",
            loading: false,
            count: -1,
            lastUpdatedAt: 2_000,
            error: null,
          },
        }),
      ),
    ).toBeNull();
  });

  test("validates ready entries instead of trusting worker payloads", () => {
    expect(
      parseDataWorkerEvent(
        event(1, {
          type: "ready",
          entries: [{ key: "aircraft", value: { data: [] } }],
        }),
      ),
    ).not.toBeNull();
    expect(
      parseDataWorkerEvent(
        event(1, {
          type: "ready",
          entries: [{ key: 42, value: null }],
        }),
      ),
    ).toBeNull();
  });
});

describe("createDataWorkerClient", () => {
  test("resolves initialization with validated cache entries", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.init();
    const command = latestCommand(harness);
    expect(command.type).toBe("init");

    harness.emit(
      event(command.requestId, {
        type: "ready",
        entries: [{ key: "trails", value: { a: 1 } }],
      }),
    );

    expect(await pending).toEqual([
      { key: "trails", value: { a: 1 } },
    ]);
  });
  test("transfers the direct render port", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const channel = new MessageChannel();
    const pending = client.connectRender(channel.port1, "render-session");
    const command = latestCommand(harness);
    if (command.type !== "connectRender") {
      throw new Error("Expected connectRender command");
    }

    expect(command.renderSessionId).toBe("render-session");
    expect(harness.transfers.at(-1)).toEqual([channel.port1]);

    harness.emit(event(command.requestId, { type: "complete" }));
    await pending;
    channel.port1.close();
    channel.port2.close();
  });


  test("retains and publishes unsolicited source snapshots", () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const received: number[] = [];
    const unsubscribe = client.subscribeSource(
      "earthquake",
      (snapshot) => received.push(snapshot.count),
    );

    harness.emit(
      event(null, {
        type: "sourceSnapshot",
        snapshot: {
          source: "earthquake",
          version: 1,
          status: "live",
          loading: false,
          count: 12,
          lastUpdatedAt: 2_000,
          error: null,
        },
      }),
    );

    expect(received).toEqual([12]);
    expect(client.getSourceSnapshot("earthquake")?.count).toBe(12);
    unsubscribe();
  });

  test("requests an explicit source refresh", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.refreshSource("earthquake");
    const command = latestCommand(harness);
    expect(command.type).toBe("refreshSource");

    harness.emit(event(command.requestId, { type: "complete" }));

    await pending;
  });

  test("returns one validated source entity with its dataset version", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.getSourceEntity("earthquake", "Qone");
    const command = latestCommand(harness);
    if (command.type !== "getSourceEntity") {
      throw new Error("Expected getSourceEntity command");
    }
    expect(command.id).toBe("Qone");

    harness.emit(
      event(command.requestId, {
        type: "sourceEntity",
        source: "earthquake",
        sourceVersion: 7,
        value: {
          id: "Qone",
          type: "quakes",
          lon: -80,
          lat: 30,
          timestamp: "2026-07-21T12:00:00.000Z",
          data: { magnitude: 4 },
        },
      }),
    );

    expect(await pending).toEqual({
      sourceVersion: 7,
      value: {
        id: "Qone",
        type: "quakes",
        lon: -80,
        lat: 30,
        timestamp: "2026-07-21T12:00:00.000Z",
        data: { magnitude: 4 },
      },
    });
  });

  test("returns a validated versioned source query", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.querySource("earthquake", {
      kind: "table",
      minMagnitude: 3,
      sortKey: "value1",
      sortDirection: "desc",
      offset: 0,
      limit: 20,
    });
    const command = latestCommand(harness);
    if (command.type !== "querySource") {
      throw new Error("Expected querySource command");
    }
    expect(command.query.kind).toBe("table");

    harness.emit(
      event(command.requestId, {
        type: "sourceQuery",
        source: "earthquake",
        sourceVersion: 8,
        result: {
          kind: "table",
          total: 1,
          items: [
            {
              id: "Qone",
              type: "quakes",
              lon: -80,
              lat: 30,
              timestamp: "2026-07-21T12:00:00.000Z",
              data: { magnitude: 4 },
            },
          ],
        },
      }),
    );

    const result = await pending;
    expect(result.sourceVersion).toBe(8);
    expect(result.result).toEqual({
      kind: "table",
      total: 1,
      items: [
        {
          id: "Qone",
          type: "quakes",
          lon: -80,
          lat: 30,
          timestamp: "2026-07-21T12:00:00.000Z",
          data: { magnitude: 4 },
        },
      ],
    });
  });

  test("sets the worker-owned source search filter", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.setSourceSearch("earthquake", "Mexico");
    const command = latestCommand(harness);
    expect(command.type).toBe("setSourceSearch");
    harness.emit(event(command.requestId, { type: "complete" }));
    await pending;
  });

  test("waits for worker completion on durable writes", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    let settled = false;
    const pending = client.set("aircraft", { data: [1] }).then(() => {
      settled = true;
    });
    const command = latestCommand(harness);
    expect(command.type).toBe("set");
    await Promise.resolve();
    expect(settled).toBe(false);

    harness.emit(event(command.requestId, { type: "complete" }));
    await pending;
    expect(settled).toBe(true);
  });

  test("sends deferred writes without creating a response waiter", () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);

    client.setDeferred("trails", { a: 1 });

    const command = latestCommand(harness);
    expect(command.type).toBe("setDeferred");
    expect(command.requestId).toBeNull();
  });

  test("propagates worker operation errors", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.get("aircraft");
    const command = latestCommand(harness);

    harness.emit(
      event(command.requestId, {
        type: "error",
        message: "IndexedDB unavailable",
      }),
    );

    await expect(pending).rejects.toThrow("IndexedDB unavailable");
  });

  test("rejects incompatible worker generations instead of hanging", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.init();
    const command = latestCommand(harness);

    harness.emit({
      type: "ready",
      protocolVersion: DATA_WORKER_PROTOCOL_VERSION - 1,
      requestId: command.requestId,
      entries: [],
    });

    await expect(pending).rejects.toThrow("protocol is incompatible");
  });

  test("times out an unanswered worker request", async () => {
    const requestTimeoutMs = 1;
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport, {
      requestTimeoutMs,
    });

    await expect(client.init()).rejects.toThrow(
      `timed out after ${requestTimeoutMs}ms`,
    );
  });

  test("imports legacy JSON through the worker boundary", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.importJson("land", "{\"version\":1}");
    const command = latestCommand(harness);
    expect(command.type).toBe("importJson");

    harness.emit(
      event(command.requestId, {
        type: "value",
        value: { version: 1 },
      }),
    );

    expect(await pending).toEqual({ version: 1 });
  });
});
