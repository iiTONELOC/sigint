import { describe, expect, test } from "bun:test";
import {
  ReducedMotionAdapter,
  type ReducedMotionMediaQuery,
} from "@/render-surface/reducedMotion";

class TestMediaQuery implements ReducedMotionMediaQuery {
  matches = false;
  private listener: (() => void) | null = null;

  addChangeListener(listener: () => void): void {
    this.listener = listener;
  }

  removeChangeListener(listener: () => void): void {
    if (this.listener === listener) this.listener = null;
  }

  setMatches(matches: boolean): void {
    this.matches = matches;
    this.listener?.();
  }
}

describe("ReducedMotionAdapter", () => {
  test("publishes media state until detached", () => {
    const query = new TestMediaQuery();
    const published: boolean[] = [];
    const adapter = new ReducedMotionAdapter({
      query,
      setReducedMotion: (value) => published.push(value),
    });

    adapter.start();
    query.setMatches(true);
    adapter.stop();
    query.setMatches(false);

    expect(published).toEqual([false, true]);
  });

  test("publishes the fallback when matchMedia is unavailable", () => {
    const published: boolean[] = [];
    const adapter = new ReducedMotionAdapter({
      query: null,
      setReducedMotion: (value) => published.push(value),
    });

    adapter.start();

    expect(published).toEqual([false]);
  });
});
