import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { type PointType } from "@shared/domain/pointType";
import { type SourceId } from "@shared/source";
import { SourceStatus } from "@shared/domain/sourceStatus";
import { AircraftRouteSource } from "@shared/domain/aircraftDossier";
import { DomEvent } from "@/lib/runtime/domEvent";
import {
  DataWorkerClientError,
  createDataWorkerClient,
  type DataWorkerTransport,
} from "@/lib/cache/dataWorkerClient";
import {
  DataWorkerMessageType,
  DataWorkerProtocolVersion,
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

enum DataWorkerClientTestTimeout {
  ImmediateMs = 1,
}

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
        new MessageEvent<unknown>(DomEvent.Message, { data: value }),
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
    protocolVersion: DataWorkerProtocolVersion.Current,
    requestId,
  };
}

describe("DataWorker protocol", () => {
  test("rejects unknown versions and malformed commands", () => {
    expect(
      parseDataWorkerCommand({
        type: DataWorkerMessageType.Init,
        protocolVersion: 99,
        requestId: 1,
      }),
    ).toBeNull();
    expect(
      parseDataWorkerCommand({
        type: DataWorkerMessageType.Set,
        protocolVersion: DataWorkerProtocolVersion.Current,
        requestId: 1,
        key: 42,
      }),
    ).toBeNull();
  });

  test("validates source snapshots at the worker boundary", () => {
    expect(
      parseDataWorkerEvent(
        event(null, {
          type: DataWorkerMessageType.SourceSnapshot,
          snapshot: {
            source: Domain.Earthquake,
            version: 3,
            status: SourceStatus.Live,
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
          type: DataWorkerMessageType.SourceSnapshot,
          snapshot: {
            source: Domain.Earthquake,
            version: 3,
            status: SourceStatus.Live,
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
          type: DataWorkerMessageType.Ready,
          entries: [{ key: "aircraft", value: { data: [] } }],
        }),
      ),
    ).not.toBeNull();
    expect(
      parseDataWorkerEvent(
        event(1, {
          type: DataWorkerMessageType.Ready,
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
    expect(command.type).toBe(DataWorkerMessageType.Init);

    harness.emit(
      event(command.requestId, {
        type: DataWorkerMessageType.Ready,
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
    if (command.type !== DataWorkerMessageType.ConnectRender) {
      throw new Error("Expected connectRender command");
    }

    expect(command.renderSessionId).toBe("render-session");
    expect(harness.transfers.at(-1)).toEqual([channel.port1]);

    harness.emit(
      event(command.requestId, {
        type: DataWorkerMessageType.Complete,
      }),
    );
    await pending;
    channel.port1.close();
    channel.port2.close();
  });


  test("transfers the direct correlation port", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const channel = new MessageChannel();
    const pending = client.connectCorrelation(
      channel.port1,
      "correlation-session",
    );
    const command = latestCommand(harness);
    if (command.type !== DataWorkerMessageType.ConnectCorrelation) {
      throw new Error("Expected connectCorrelation command");
    }

    expect(command.correlationSessionId).toBe("correlation-session");
    expect(harness.transfers.at(-1)).toEqual([channel.port1]);

    harness.emit(
      event(command.requestId, {
        type: DataWorkerMessageType.Complete,
      }),
    );
    await pending;
    channel.port1.close();
    channel.port2.close();
  });

  test("retains and publishes unsolicited source snapshots", () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const received: number[] = [];
    const unsubscribe = client.subscribeSource(
      Domain.Earthquake,
      (snapshot) => received.push(snapshot.count),
    );

    harness.emit(
      event(null, {
        type: DataWorkerMessageType.SourceSnapshot,
        snapshot: {
          source: Domain.Earthquake,
          version: 1,
          status: SourceStatus.Live,
          loading: false,
          count: 12,
          lastUpdatedAt: 2_000,
          error: null,
        },
      }),
    );

    expect(received).toEqual([12]);
    expect(client.getSourceSnapshot(Domain.Earthquake)?.count).toBe(12);
    unsubscribe();
  });

  test("requests an explicit source refresh", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.refreshSource(Domain.Earthquake);
    const command = latestCommand(harness);
    expect(command.type).toBe(DataWorkerMessageType.RefreshSource);

    harness.emit(
      event(command.requestId, {
        type: DataWorkerMessageType.Complete,
      }),
    );

    await pending;
  });

  test("returns one validated source entity with its dataset version", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.getSourceEntity(Domain.Earthquake, "Qone");
    const command = latestCommand(harness);
    if (command.type !== DataWorkerMessageType.GetSourceEntity) {
      throw new Error("Expected getSourceEntity command");
    }
    expect(command.id).toBe("Qone");

    harness.emit(
      event(command.requestId, {
        type: DataWorkerMessageType.SourceEntity,
        source: Domain.Earthquake,
        sourceVersion: 7,
        value: {
          id: "Qone",
          type: Domain.Quakes,
          lon: -80,
          lat: 30,
          timestamp: "2026-07-21T12:00:00.000Z",
          data: { magnitude: 4 },
        },
      }),
    );

    const entity = await pending;
    expect(entity.source).toBe(Domain.Earthquake);
    expect(entity.sourceVersion).toBe(7);
    expect(entity.value).toEqual({
      id: "Qone",
      type: Domain.Quakes,
      lon: -80,
      lat: 30,
      timestamp: "2026-07-21T12:00:00.000Z",
      data: { magnitude: 4 },
    });
  });

  test("returns a validated versioned source query", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.querySource({
      source: Domain.Earthquake,
      query: {
        kind: "table",
      minValue: 3,
      sortKey: "value1",
      sortDirection: "desc",
      offset: 0,
        limit: 20,
      },
    });
    const command = latestCommand(harness);
    if (command.type !== DataWorkerMessageType.QuerySource) {
      throw new Error("Expected querySource command");
    }
    expect(command.query.kind).toBe("table");

    harness.emit(
      event(command.requestId, {
        type: DataWorkerMessageType.SourceQuery,
        source: Domain.Earthquake,
        sourceVersion: 8,
        result: {
          kind: "table",
          total: 1,
          items: [
            {
              id: "Qone",
              type: Domain.Quakes,
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
    expect(result.source).toBe(Domain.Earthquake);
    expect(result.sourceVersion).toBe(8);
    expect(result.result).toEqual({
      kind: "table",
      total: 1,
      items: [
        {
          id: "Qone",
          type: Domain.Quakes,
          lon: -80,
          lat: 30,
          timestamp: "2026-07-21T12:00:00.000Z",
          data: { magnitude: 4 },
        },
      ],
    });
  });

  test("returns a validated bounded aircraft dossier", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.getAircraftDossier("aircraft-a");
    const command = latestCommand(harness);
    if (command.type !== DataWorkerMessageType.GetAircraftDossier) {
      throw new Error("Expected aircraft dossier command");
    }
    expect(command.entityId).toBe("aircraft-a");

    harness.emit(
      event(command.requestId, {
        type: DataWorkerMessageType.AircraftDossier,
        entityId: "aircraft-a",
        dossier: {
          icao24: "abc123",
          aircraft: null,
          route: {
            source: AircraftRouteSource.FlightAware,
            origin: { icao: "KJFK" },
            destination: { icao: "KLAX" },
            waypoints: [
              [40.6, -73.7],
              [33.9, -118.4],
            ],
          },
        },
      }),
    );

    expect((await pending)?.route?.source).toBe(
      AircraftRouteSource.FlightAware,
    );
  });

  test("waits for worker completion on durable writes", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    let settled = false;
    const pending = client.set("aircraft", { data: [1] }).then(() => {
      settled = true;
    });
    const command = latestCommand(harness);
    expect(command.type).toBe(DataWorkerMessageType.Set);
    await Promise.resolve();
    expect(settled).toBe(false);

    harness.emit(
      event(command.requestId, {
        type: DataWorkerMessageType.Complete,
      }),
    );
    await pending;
    expect(settled).toBe(true);
  });

  test("sends deferred writes without creating a response waiter", () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);

    client.setDeferred("trails", { a: 1 });

    const command = latestCommand(harness);
    expect(command.type).toBe(DataWorkerMessageType.SetDeferred);
    expect(command.requestId).toBeNull();
  });

  test("propagates worker operation errors", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.get("aircraft");
    const command = latestCommand(harness);

    harness.emit(
      event(command.requestId, {
        type: DataWorkerMessageType.Error,
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
      type: DataWorkerMessageType.Ready,
      protocolVersion: DataWorkerProtocolVersion.Current - 1,
      requestId: command.requestId,
      entries: [],
    });

    await expect(pending).rejects.toThrow(
      DataWorkerClientError.ProtocolIncompatible,
    );
  });

  test("times out an unanswered worker request", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport, {
      requestTimeoutMs: DataWorkerClientTestTimeout.ImmediateMs,
    });

    await expect(client.init()).rejects.toThrow(
      DataWorkerClientError.RequestTimedOut,
    );
  });

  test("imports legacy JSON through the worker boundary", async () => {
    const harness = createWorkerHarness();
    const client = createDataWorkerClient(harness.transport);
    const pending = client.importJson("land", "{\"version\":1}");
    const command = latestCommand(harness);
    expect(command.type).toBe(DataWorkerMessageType.ImportJson);

    harness.emit(
      event(command.requestId, {
        type: DataWorkerMessageType.Value,
        value: { version: 1 },
      }),
    );

    expect(await pending).toEqual({ version: 1 });
  });
});
