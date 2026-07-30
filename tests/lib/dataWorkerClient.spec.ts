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
