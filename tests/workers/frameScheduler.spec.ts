import { describe, expect, test } from "bun:test";
import { createFrameScheduler } from "@/workers/render/scheduler";

describe("frame scheduler", () => {
  test("coalesces invalidations and stops at idle", () => {
    const callbacks: FrameRequestCallback[] = [];
    let renderCount = 0;
    const scheduler = createFrameScheduler({
      requestFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancelFrame: () => undefined,
      render: () => {
        renderCount += 1;
        return false;
      },
    });

    scheduler.invalidate();
    scheduler.invalidate();
    expect(callbacks).toHaveLength(1);

    callbacks.shift()?.(0);
    expect(renderCount).toBe(1);
    expect(scheduler.isScheduled()).toBe(false);
    expect(callbacks).toHaveLength(0);
  });

  test("schedules one more frame only when motion continues", () => {
    const callbacks: FrameRequestCallback[] = [];
    const scheduler = createFrameScheduler({
      requestFrame: (callback) => {
        callbacks.push(callback);
        return callbacks.length;
      },
      cancelFrame: () => undefined,
      render: () => true,
    });

    scheduler.invalidate();
    callbacks.shift()?.(0);

    expect(callbacks).toHaveLength(1);
    expect(scheduler.isScheduled()).toBe(true);
  });
});
