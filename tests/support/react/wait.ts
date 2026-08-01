import { act } from "react";
import { ReactTestWaitTimeoutError } from "./errors";

enum ReactTestTimingMs {
  PollInterval = 10,
  WaitTimeout = 2_000,
}

/** Flush queued asynchronous React work. */
export async function flushReactUpdates(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
  });
}

/** Wait for a condition while React processes queued updates. */
export async function waitForReact(
  isReady: () => boolean,
  timeoutMs: number = ReactTestTimingMs.WaitTimeout,
): Promise<void> {
  const startedAt = Date.now();

  while (!isReady()) {
    if (Date.now() - startedAt > timeoutMs) {
      throw new ReactTestWaitTimeoutError();
    }
    await act(async () => {
      await new Promise<void>((resolve) => {
        setTimeout(resolve, ReactTestTimingMs.PollInterval);
      });
    });
  }
}
