import { describe, expect, test } from "bun:test";
import {
  createDeferredWriteCoordinator,
  type DeferredWriteCoordinator,
} from "../../src/client/lib/cache/deferredWriteCoordinator";

type Signal = Readonly<{
  promise: Promise<void>;
  resolve: () => void;
}>;

type WriteGate = Readonly<{
  started: Signal;
  release: Signal;
}>;

type Harness = Readonly<{
  coordinator: DeferredWriteCoordinator<unknown>;
  disk: Map<string, unknown>;
  blockNextWrite: () => Readonly<{
    started: Promise<void>;
    release: () => void;
  }>;
}>;

function signal(): Signal {
  let resolveSignal = (): void => undefined;
  const promise = new Promise<void>((resolve) => {
    resolveSignal = resolve;
  });
  return { promise, resolve: resolveSignal };
}

function createHarness(): Harness {
  const disk = new Map<string, unknown>();
  let gate: WriteGate | null = null;

  const coordinator = createDeferredWriteCoordinator<unknown>({
    minWriteIntervalMs: 5_000,
    now: () => 10_000,
    ready: () => Promise.resolve(),
    schedule: () => () => undefined,
    write: async (key, value, isCurrent) => {
      const activeGate = gate;
      if (activeGate) {
        gate = null;
        activeGate.started.resolve();
        await activeGate.release.promise;
      }
      if (isCurrent()) disk.set(key, value);
    },
  });

  return {
    coordinator,
    disk,
    blockNextWrite: () => {
      const started = signal();
      const release = signal();
      gate = { started, release };
      return {
        started: started.promise,
        release: release.resolve,
      };
    },
  };
}

describe("deferred write coordinator", () => {
  test("coalesces pending writes to the latest value", async () => {
    const harness = createHarness();
    harness.coordinator.setDeferred("key", "old");
    harness.coordinator.setDeferred("key", "new");

    await harness.coordinator.flush();

    expect(harness.disk.get("key")).toBe("new");
  });

  test("delete cancels a pending write", async () => {
    const harness = createHarness();
    harness.disk.set("key", "stored");
    harness.coordinator.setDeferred("key", "pending");

    await harness.coordinator.delete("key", async () => {
      harness.disk.delete("key");
    });
    await harness.coordinator.flush();

    expect(harness.disk.has("key")).toBe(false);
  });

  test("delete cannot be undone by an in-flight old write", async () => {
    const harness = createHarness();
    const gate = harness.blockNextWrite();
    harness.coordinator.setDeferred("key", "old");
    const flushing = harness.coordinator.flush();
    await gate.started;

    const deleting = harness.coordinator.delete("key", async () => {
      harness.disk.delete("key");
    });
    gate.release();
    await Promise.all([flushing, deleting]);

    expect(harness.disk.has("key")).toBe(false);
  });

  test("a write issued after delete survives", async () => {
    const harness = createHarness();
    harness.disk.set("key", "old");
    const deleteStarted = signal();
    const allowDelete = signal();

    const deleting = harness.coordinator.delete("key", async () => {
      deleteStarted.resolve();
      await allowDelete.promise;
      harness.disk.delete("key");
    });
    await deleteStarted.promise;

    const writing = harness.coordinator.set("key", "new");
    allowDelete.resolve();
    await Promise.all([deleting, writing]);

    expect(harness.disk.get("key")).toBe("new");
  });

  test("clear removes disk-only and pending entries", async () => {
    const harness = createHarness();
    harness.disk.set("disk-only", "old");
    harness.coordinator.setDeferred("pending", "old");

    await harness.coordinator.clear(async () => {
      harness.disk.clear();
    });
    await harness.coordinator.flush();

    expect(harness.disk.size).toBe(0);
  });

  test("a write issued after clear waits and survives", async () => {
    const harness = createHarness();
    harness.disk.set("old", "value");
    const clearStarted = signal();
    const allowClear = signal();

    const clearing = harness.coordinator.clear(async () => {
      clearStarted.resolve();
      await allowClear.promise;
      harness.disk.clear();
    });
    await clearStarted.promise;

    const writing = harness.coordinator.set("new", "value");
    allowClear.resolve();
    await Promise.all([clearing, writing]);

    expect([...harness.disk]).toEqual([["new", "value"]]);
  });

  test("a newer write cannot be clobbered by a forced old flush", async () => {
    const harness = createHarness();
    const gate = harness.blockNextWrite();
    harness.coordinator.setDeferred("key", "old");
    const flushing = harness.coordinator.flush();
    await gate.started;

    const writing = harness.coordinator.set("key", "new");
    gate.release();
    await Promise.all([flushing, writing]);

    expect(harness.disk.get("key")).toBe("new");
  });

  test("set resolves only after the backend commit completes", async () => {
    const harness = createHarness();
    const gate = harness.blockNextWrite();
    let resolved = false;
    const writing = harness.coordinator.set("key", "value").then(() => {
      resolved = true;
    });
    await gate.started;

    expect(resolved).toBe(false);
    gate.release();
    await writing;

    expect(resolved).toBe(true);
    expect(harness.disk.get("key")).toBe("value");
  });

  test("deleting one key does not invalidate another key", async () => {
    const harness = createHarness();
    harness.coordinator.setDeferred("delete", "value");
    harness.coordinator.setDeferred("keep", "value");

    await harness.coordinator.delete("delete", async () => {
      harness.disk.delete("delete");
    });
    await harness.coordinator.flush();

    expect(harness.disk.has("delete")).toBe(false);
    expect(harness.disk.get("keep")).toBe("value");
  });
});
