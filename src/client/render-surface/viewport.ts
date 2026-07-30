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

export class ViewportAdapter {
  private observer: ViewportObserver | null = null;
  private frame = 0;

  constructor(
    private readonly options: ViewportAdapterOptions,
  ) {}

  start(): void {
    if (this.observer) return;
    this.sendCurrentViewport();
    this.observer = this.options.createObserver(this.invalidate);
    this.observer.observe(this.options.host);
  }

  readonly invalidate = (): void => {
    if (this.frame !== 0) return;
    this.frame = this.options.requestFrame(this.sendCurrentViewport);
  };

  stop(): void {
    if (this.frame !== 0) this.options.cancelFrame(this.frame);
    this.frame = 0;
    this.observer?.disconnect();
    this.observer = null;
  }

  private readonly sendCurrentViewport = (): void => {
    this.frame = 0;
    const viewport = measureRenderViewport(
      this.options.host,
      this.options.readDevicePixelRatio(),
      this.options.maxDevicePixelRatio,
    );
    if (viewport.width === 0 || viewport.height === 0) return;
    this.options.sendViewport(viewport);
  };
}

export function createViewportAdapter(
  options: ViewportAdapterOptions,
): ViewportAdapter {
  return new ViewportAdapter(options);
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
