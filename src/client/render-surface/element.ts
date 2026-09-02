import type {
  RenderSurfaceSessionHandle,
  RenderSurfaceSessionFactory,
} from "@/render-surface/session";
import type { RenderWorkerCommandBody } from "@/workers/render/protocol";

export type {
  RenderSurfaceSessionHandle,
  RenderSurfaceSessionFactory,
} from "@/render-surface/session";

export type RenderSurfaceElementOptions = Readonly<{
  createSession: RenderSurfaceSessionFactory;
}>;

const activeSessions = new WeakMap<
  HTMLElement,
  RenderSurfaceSessionHandle
>();

function createCanvas(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.setAttribute("part", "canvas");
  canvas.style.display = "block";
  canvas.style.width = canvas.style.height = "100%";
  canvas.style.touchAction = "none";
  return canvas;
}

export function sendRenderSurfaceCommand(
  host: HTMLElement,
  body: RenderWorkerCommandBody,
  transfer: readonly Transferable[] = [],
): boolean {
  const session = activeSessions.get(host);
  if (!session) return false;
  session.send(body, transfer);
  return true;
}

export function createRenderSurfaceElementClass(
  options: RenderSurfaceElementOptions,
): CustomElementConstructor {
  return class RenderSurfaceElement extends HTMLElement {
    readonly #root: ShadowRoot;
    #canvas: HTMLCanvasElement | null = null;
    #session: RenderSurfaceSessionHandle | null = null;

    constructor() {
      super();
      this.#root = this.attachShadow({ mode: "open" });
    }

    connectedCallback(): void {
      if (this.#session) return;
      const canvas = createCanvas();
      const session = options.createSession();
      this.#root.append(canvas);
      this.#canvas = canvas;
      this.#session = session;
      activeSessions.set(this, session);
      session.start(canvas, this);
    }

    disconnectedCallback(): void {
      queueMicrotask(() => {
        if (this.isConnected) return;
        activeSessions.delete(this);
        this.#session?.stop();
        this.#session = null;
        this.#canvas?.remove();
        this.#canvas = null;
      });
    }
  };
}
