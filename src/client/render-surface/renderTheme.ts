import {
  RenderColorKey,
  isRenderWorkerColors,
  type RenderWorkerColors,
} from "@/workers/render/protocol";

enum RenderThemeObservedAttribute {
  Style = "style",
}

export type RenderThemeStyle = Pick<
  CSSStyleDeclaration,
  "getPropertyValue"
>;

export type RenderThemeObserver = Readonly<{
  observe: (element: Element, options: MutationObserverInit) => void;
  disconnect: () => void;
}>;

export type RenderThemeAdapterOptions = Readonly<{
  root: HTMLElement;
  readStyle: (root: HTMLElement) => RenderThemeStyle;
  createObserver: (notify: () => void) => RenderThemeObserver;
  setRenderTheme: (theme: RenderWorkerColors) => void;
}>;

export function renderColorCssVariable(key: RenderColorKey): string {
  return `--sigint-${key}`;
}

export function readRenderTheme(
  style: RenderThemeStyle,
): RenderWorkerColors | null {
  const entries = Object.values(RenderColorKey).map((key) => [
    key,
    style.getPropertyValue(renderColorCssVariable(key)).trim(),
  ]);
  const theme: unknown = Object.fromEntries(entries);
  return isRenderWorkerColors(theme) ? theme : null;
}

export class RenderThemeAdapter {
  private observer: RenderThemeObserver | null = null;

  constructor(
    private readonly options: RenderThemeAdapterOptions,
  ) {}

  start(): void {
    if (this.observer) return;
    this.observer = this.options.createObserver(this.publish);
    this.observer.observe(this.options.root, {
      attributes: true,
      attributeFilter: [RenderThemeObservedAttribute.Style],
    });
    this.publish();
  }

  stop(): void {
    this.observer?.disconnect();
    this.observer = null;
  }

  private readonly publish = (): void => {
    const theme = readRenderTheme(
      this.options.readStyle(this.options.root),
    );
    if (theme) this.options.setRenderTheme(theme);
  };
}

export function createBrowserRenderThemeAdapter(
  setRenderTheme: (theme: RenderWorkerColors) => void,
): RenderThemeAdapter {
  return new RenderThemeAdapter({
    root: document.documentElement,
    readStyle: (root) => getComputedStyle(root),
    createObserver: (notify) => {
      const observer = new MutationObserver(notify);
      return {
        observe: (element, options) =>
          observer.observe(element, options),
        disconnect: () => observer.disconnect(),
      };
    },
    setRenderTheme,
  });
}
