import type { RenderViewportPayload } from "@/workers/render/protocol";

export type ViewportObserver = Readonly<{
  observe: (element: Element) => void;
  disconnect: () => void;
}>;

export type ViewportAdapterOptions = Readonly<{
  host: HTMLElement;
  maxDevicePixelRatio: number;
  readDevicePixelRatio: () => number;
  requestFrame: (callback: FrameRequestCallback) => number;
  cancelFrame: (handle: number) => void;
  createObserver: (notify: () => void) => ViewportObserver;
  sendViewport: (viewport: RenderViewportPayload) => void;
}>;

export type ViewportAdapter = Readonly<{
  start: () => void;
  invalidate: () => void;
  stop: () => void;
}>;

export function measureRenderViewport(
  host: HTMLElement,
  devicePixelRatio: number,
  maximumDevicePixelRatio: number,
): RenderViewportPayload {
  return {
    width: Math.max(0, host.clientWidth),
    height: Math.max(0, host.clientHeight),
    devicePixelRatio: Math.max(
      1,
      Math.min(devicePixelRatio, maximumDevicePixelRatio),
    ),
  };
}

export function createViewportAdapter(
  options: ViewportAdapterOptions,
): ViewportAdapter {
  let observer: ViewportObserver | null = null;
  let frame = 0;

  const sendCurrentViewport = (): void => {
    frame = 0;
    const viewport = measureRenderViewport(
      options.host,
      options.readDevicePixelRatio(),
      options.maxDevicePixelRatio,
    );
    if (viewport.width === 0 || viewport.height === 0) return;
    options.sendViewport(viewport);
  };

  const invalidate = (): void => {
    if (frame !== 0) return;
    frame = options.requestFrame(sendCurrentViewport);
  };

  return {
    start(): void {
      if (observer) return;
      sendCurrentViewport();
      observer = options.createObserver(invalidate);
      observer.observe(options.host);
    },

    invalidate,

    stop(): void {
      if (frame !== 0) options.cancelFrame(frame);
      frame = 0;
      observer?.disconnect();
      observer = null;
    },
  };
}

export function createBrowserViewportAdapter(
  host: HTMLElement,
  sendViewport: (viewport: RenderViewportPayload) => void,
  maxDevicePixelRatio: number,
): ViewportAdapter {
  return createViewportAdapter({
    host,
    maxDevicePixelRatio,
    readDevicePixelRatio: () => globalThis.devicePixelRatio || 1,
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (handle) => cancelAnimationFrame(handle),
    createObserver: (notify) => {
      const observer = new ResizeObserver(notify);
      return {
        observe: (element) => observer.observe(element),
        disconnect: () => observer.disconnect(),
      };
    },
    sendViewport,
  });
}
