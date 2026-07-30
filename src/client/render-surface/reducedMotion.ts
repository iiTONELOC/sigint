import { DomEvent } from "@/lib/runtime/domEvent";

export enum RenderMediaQuery {
  ReducedMotion = "(prefers-reduced-motion: reduce)",
}

export type ReducedMotionMediaQuery = Readonly<{
  matches: boolean;
  addChangeListener: (listener: () => void) => void;
  removeChangeListener: (listener: () => void) => void;
}>;

export type ReducedMotionAdapterOptions = Readonly<{
  query: ReducedMotionMediaQuery | null;
  setReducedMotion: (reducedMotion: boolean) => void;
}>;

export class ReducedMotionAdapter {
  private started = false;

  constructor(
    private readonly options: ReducedMotionAdapterOptions,
  ) {}

  start(): void {
    if (this.started) return;
    this.started = true;
    this.publish();
    this.options.query?.addChangeListener(this.handleChange);
  }

  stop(): void {
    if (!this.started) return;
    this.options.query?.removeChangeListener(this.handleChange);
    this.started = false;
  }

  private readonly handleChange = (): void => {
    this.publish();
  };

  private publish(): void {
    this.options.setReducedMotion(
      this.options.query?.matches ?? false,
    );
  }
}

export function createBrowserReducedMotionAdapter(
  setReducedMotion: (reducedMotion: boolean) => void,
): ReducedMotionAdapter {
  const query =
    typeof globalThis.matchMedia === "function"
      ? globalThis.matchMedia(RenderMediaQuery.ReducedMotion)
      : null;
  return new ReducedMotionAdapter({
    query: query
      ? {
          get matches() {
            return query.matches;
          },
          addChangeListener: (listener) =>
            query.addEventListener(DomEvent.Change, listener),
          removeChangeListener: (listener) =>
            query.removeEventListener(DomEvent.Change, listener),
        }
      : null,
    setReducedMotion,
  });
}
