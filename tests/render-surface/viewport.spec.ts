import { describe, expect, test } from "bun:test";
import {
  ViewportAdapter,
  createViewportAdapter,
  measureRenderViewport,
} from "@/render-surface/viewport";

describe("render surface viewport", () => {
  test("measures CSS size and limits device-pixel ratio", () => {
    const host = document.createElement("div");
    Object.defineProperties(host, {
      clientWidth: { configurable: true, value: 640 },
      clientHeight: { configurable: true, value: 360 },
    });

    expect(measureRenderViewport(host, 3, 2)).toEqual({
      width: 640,
      height: 360,
      devicePixelRatio: 2,
      isMobile: true,
    });
  });

  test("coalesces resize notifications into one frame", () => {
    const host = document.createElement("div");
    Object.defineProperties(host, {
      clientWidth: { configurable: true, value: 800 },
      clientHeight: { configurable: true, value: 600 },
    });
    const frames: FrameRequestCallback[] = [];
    const sent: unknown[] = [];
    const observed: Element[] = [];
    let disconnected = false;
    const adapter = createViewportAdapter({
      host,
      maxDevicePixelRatio: 2,
      readDevicePixelRatio: () => 1.5,
      requestFrame: (callback) => {
        frames.push(callback);
        return frames.length;
      },
      cancelFrame: () => undefined,
      createObserver: (notify) => ({
        observe: (element) => {
          observed.push(element);
          notify();
          notify();
        },
        disconnect: () => {
          disconnected = true;
        },
      }),
      sendViewport: (viewport) => sent.push(viewport),
    });

    expect(adapter).toBeInstanceOf(ViewportAdapter);
    adapter.start();
    expect(observed).toEqual([host]);
    expect(sent).toHaveLength(1);
    expect(frames).toHaveLength(1);

    frames[0]?.(0);
    expect(sent).toHaveLength(2);

    adapter.stop();
    expect(disconnected).toBe(true);
  });
});
