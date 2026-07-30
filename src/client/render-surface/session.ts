import {
  RenderInteractionKind,
  RenderMessageType,
  RenderProtocolVersion,
  createRenderMessage,
  isRenderGlobeStateSnapshot,
  type RenderWorkerCommand,
  type RenderWorkerCommandBody,
} from "@/workers/render/protocol";
import { RENDER_POLICY } from "@/workers/render/policy";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import { DomEvent } from "@/lib/runtime/domEvent";
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
import {
  RenderGlobeStateStore,
  renderGlobeStateStore,
} from "@/render-surface/globeStateStore";

enum DatasetState {
  Ready = "true",
}

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
  globeStateStore?: RenderGlobeStateStore;
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
        createRenderMessage(body, sessionId, sequence),
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
      worker.addEventListener(DomEvent.Message, handleMessage);
      return () =>
        worker.removeEventListener(DomEvent.Message, handleMessage);
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
    value.protocolVersion === RenderProtocolVersion.Current &&
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
  let disconnectGlobeState: (() => void) | null = null;
  const globeState =
    dependencies.globeStateStore ?? renderGlobeStateStore;

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
        if (message.type === RenderMessageType.Ready) {
          nextCanvas.dataset.renderWorkerReady = DatasetState.Ready;
          emitRenderSignal(host, RENDER_SURFACE_READY_EVENT);
          return;
        }
        if (message.type === RenderMessageType.DataChannelReady) {
          nextCanvas.dataset.renderDataChannelReady = DatasetState.Ready;
          emitRenderSignal(host, RENDER_SURFACE_DATA_READY_EVENT);
          return;
        }
        if (message.type === RenderMessageType.GlobeState) {
          if (isRenderGlobeStateSnapshot(message.payload)) {
            globeState.accept(message.payload);
          }
          return;
        }
        if (message.type !== RenderMessageType.Interaction) return;
        const interaction = message.payload;
        if (!isRenderInteraction(interaction)) return;
        if (interaction.kind === RenderInteractionKind.Cursor) {
          nextCanvas.style.cursor = interaction.cursor;
        }
        emitRenderInteraction(host, interaction);
      });

      const offscreen = nextCanvas.transferControlToOffscreen();
      const dataClient = getDataWorkerClient();
      if (dataClient && typeof MessageChannel !== "undefined") {
        const channel = new MessageChannel();
        send(
          {
            type: RenderMessageType.Init,
            canvas: offscreen,
            dataPort: channel.port2,
          },
          [offscreen, channel.port2],
        );
        void dataClient.connectRender(channel.port1, sessionId);
      } else {
        send(
          { type: RenderMessageType.Init, canvas: offscreen },
          [offscreen],
        );
      }
      disconnectGlobeState = globeState.connect((command) =>
        send({
          type: RenderMessageType.GlobeCommand,
          payload: command,
        }),
      );

      viewport = createBrowserViewportAdapter(
        host,
        (payload) =>
          send({ type: RenderMessageType.Viewport, payload }),
        RENDER_POLICY.maxDevicePixelRatio,
      );
      viewport.start();

      input = createInputHandlers({
        canvas: nextCanvas,
        sendInput: (payload) =>
          send({ type: RenderMessageType.Input, payload }),
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
      disconnectGlobeState?.();
      disconnectGlobeState = null;
      if (canvas && input) detachInputHandlers(canvas, input);
      input = null;
      if (sender) {
        sender.send({ type: RenderMessageType.Dispose });
      }
      unsubscribe?.();
      unsubscribe = null;
      endpoint?.terminate();
      endpoint = null;
      sender = null;
      canvas = null;
    },
  };
}
