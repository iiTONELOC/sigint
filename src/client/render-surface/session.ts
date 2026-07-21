import {
  RENDER_PROTOCOL_VERSION,
  createRenderCommand,
  type RenderInteractionPayload,
  type RenderWorkerCommand,
  type RenderWorkerCommandBody,
} from "@/workers/render/protocol";
import { RENDER_POLICY } from "@/workers/render/policy";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import { isRecord } from "@shared/geo";
import {
  attachInputHandlers,
  createInputHandlers,
  detachInputHandlers,
  type InputHandlers,
} from "@/render-surface/input";
import {
  emitRenderInteraction,
  emitRenderSignal,
  isRenderInteraction,
  RENDER_SURFACE_DATA_READY_EVENT,
  RENDER_SURFACE_MIDDLE_CLICK_EVENT,
  RENDER_SURFACE_READY_EVENT,
} from "@/render-surface/events";
import {
  createBrowserViewportAdapter,
  type ViewportAdapter,
} from "@/render-surface/viewport";

export type RenderWorkerEndpoint = Readonly<{
  post: (
    message: RenderWorkerCommand,
    transfer?: readonly Transferable[],
  ) => void;
  subscribe: (listener: (message: unknown) => void) => () => void;
  terminate: () => void;
}>;

export type RenderCommandSender = Readonly<{
  send: (
    body: RenderWorkerCommandBody,
    transfer?: readonly Transferable[],
  ) => void;
}>;

export type RenderSurfaceSession = Readonly<{
  start: (canvas: HTMLCanvasElement, host: HTMLElement) => void;
  send: (
    body: RenderWorkerCommandBody,
    transfer?: readonly Transferable[],
  ) => void;
  stop: () => void;
}>;

export type RenderSurfaceSessionFactory = () => RenderSurfaceSession;

export type RenderSurfaceSessionDependencies = Readonly<{
  createWorkerEndpoint?: () => RenderWorkerEndpoint;
  createSessionId?: () => string;
}>;

export function createRenderCommandSender(
  endpoint: RenderWorkerEndpoint,
  sessionId: string,
): RenderCommandSender {
  let sequence = 0;
  return {
    send(
      body: RenderWorkerCommandBody,
      transfer: readonly Transferable[] = [],
    ): void {
      sequence += 1;
      endpoint.post(
        createRenderCommand(body, sessionId, sequence),
        transfer,
      );
    },
  };
}

function createBrowserWorkerEndpoint(): RenderWorkerEndpoint {
  const worker = new Worker("/workers/pointWorker.js", { type: "module" });
  return {
    post(message, transfer = []): void {
      worker.postMessage(message, Array.from(transfer));
    },
    subscribe(listener): () => void {
      const handleMessage = (event: MessageEvent<unknown>): void => {
        listener(event.data);
      };
      worker.addEventListener("message", handleMessage);
      return () => worker.removeEventListener("message", handleMessage);
    },
    terminate(): void {
      worker.terminate();
    },
  };
}

function acceptsWorkerEvent(
  value: unknown,
  sessionId: string,
): value is Readonly<Record<string, unknown>> {
  if (!isRecord(value)) return false;
  return (
    value.protocolVersion === RENDER_PROTOCOL_VERSION &&
    value.sessionId === sessionId &&
    typeof value.sequence === "number" &&
    Number.isSafeInteger(value.sequence) &&
    value.sequence > 0 &&
    typeof value.type === "string"
  );
}

export function createRenderSurfaceSession(
  dependencies: RenderSurfaceSessionDependencies = {},
): RenderSurfaceSession {
  let endpoint: RenderWorkerEndpoint | null = null;
  let sender: RenderCommandSender | null = null;
  let viewport: ViewportAdapter | null = null;
  let input: InputHandlers | null = null;
  let canvas: HTMLCanvasElement | null = null;
  let unsubscribe: (() => void) | null = null;

  const send: RenderCommandSender["send"] = (body, transfer = []): void => {
    sender?.send(body, transfer);
  };

  return {
    start(nextCanvas, host): void {
      if (endpoint) return;
      canvas = nextCanvas;
      const sessionId =
        dependencies.createSessionId?.() ?? globalThis.crypto.randomUUID();
      endpoint =
        dependencies.createWorkerEndpoint?.() ?? createBrowserWorkerEndpoint();
      sender = createRenderCommandSender(endpoint, sessionId);

      unsubscribe = endpoint.subscribe((message) => {
        if (!acceptsWorkerEvent(message, sessionId)) return;
        if (message.type === "ready") {
          nextCanvas.dataset.renderWorkerReady = "true";
          emitRenderSignal(host, RENDER_SURFACE_READY_EVENT);
          return;
        }
        if (message.type === "dataChannelReady") {
          nextCanvas.dataset.renderDataChannelReady = "true";
          emitRenderSignal(host, RENDER_SURFACE_DATA_READY_EVENT);
          return;
        }
        if (message.type !== "interaction") return;
        const interaction = message.payload;
        if (!isRenderInteraction(interaction)) return;
        if (interaction.kind === "cursor") {
          nextCanvas.style.cursor = interaction.cursor;
        }
        emitRenderInteraction(host, interaction);
      });

      const offscreen = nextCanvas.transferControlToOffscreen();
      const dataClient = getDataWorkerClient();
      if (dataClient && typeof MessageChannel !== "undefined") {
        const channel = new MessageChannel();
        send(
          { type: "init", canvas: offscreen, dataPort: channel.port2 },
          [offscreen, channel.port2],
        );
        void dataClient.connectRender(channel.port1, sessionId);
      } else {
        send({ type: "init", canvas: offscreen }, [offscreen]);
      }

      viewport = createBrowserViewportAdapter(
        host,
        (payload) => send({ type: "viewport", payload }),
        RENDER_POLICY.maxDevicePixelRatio,
      );
      viewport.start();

      input = createInputHandlers({
        canvas: nextCanvas,
        sendInput: (payload) => send({ type: "input", payload }),
        onMiddleClick: () => {
          emitRenderSignal(host, RENDER_SURFACE_MIDDLE_CLICK_EVENT);
        },
      });
      attachInputHandlers(nextCanvas, input);
    },

    send,

    stop(): void {
      viewport?.stop();
      viewport = null;
      if (canvas && input) detachInputHandlers(canvas, input);
      input = null;
      if (sender) sender.send({ type: "dispose" });
      unsubscribe?.();
      unsubscribe = null;
      endpoint?.terminate();
      endpoint = null;
      sender = null;
      canvas = null;
    },
  };
}
