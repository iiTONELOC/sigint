import {
  RenderGlobeCommandKind,
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
  InputAdapter,
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
import {
  createBrowserAircraftFilterUrlAdapter,
} from "@/render-surface/aircraftFilterUrl";
import {
  createBrowserReducedMotionAdapter,
} from "@/render-surface/reducedMotion";
import {
  createBrowserRenderThemeAdapter,
} from "@/render-surface/renderTheme";

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

type RenderSurfaceAdapter = Readonly<{
  start: () => void;
  stop: () => void;
}>;

export type RenderSurfaceSessionHandle = Pick<
  RenderSurfaceSession,
  "start" | "send" | "stop"
>;

export type RenderSurfaceSessionFactory =
  () => RenderSurfaceSessionHandle;

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

export class RenderSurfaceSession {
  private endpoint: RenderWorkerEndpoint | null = null;
  private sender: RenderCommandSender | null = null;
  private viewport: ViewportAdapter | null = null;
  private input: InputAdapter | null = null;
  private unsubscribe: (() => void) | null = null;
  private disconnectGlobeState: (() => void) | null = null;
  private browserAdapters: readonly RenderSurfaceAdapter[] = [];
  private readonly globeState: RenderGlobeStateStore;

  constructor(
    private readonly dependencies: RenderSurfaceSessionDependencies = {},
  ) {
    this.globeState =
      dependencies.globeStateStore ?? renderGlobeStateStore;
  }

  start(nextCanvas: HTMLCanvasElement, host: HTMLElement): void {
    if (this.endpoint) return;
    const sessionId =
      this.dependencies.createSessionId?.() ??
      globalThis.crypto.randomUUID();
    this.endpoint =
      this.dependencies.createWorkerEndpoint?.() ??
      createBrowserWorkerEndpoint();
    this.sender = createRenderCommandSender(this.endpoint, sessionId);
    this.unsubscribe = this.endpoint.subscribe((message) => {
      this.handleWorkerEvent(
        message,
        sessionId,
        nextCanvas,
        host,
      );
    });

    this.initializeWorker(nextCanvas, sessionId);
    this.startStateAdapters();
    this.disconnectGlobeState = this.globeState.connect((command) =>
      this.send({
        type: RenderMessageType.GlobeCommand,
        payload: command,
      }),
    );
    this.viewport = createBrowserViewportAdapter(
      host,
      (payload) =>
        this.send({ type: RenderMessageType.Viewport, payload }),
      RENDER_POLICY.maxDevicePixelRatio,
    );
    this.viewport.start();
    this.input = new InputAdapter({
      canvas: nextCanvas,
      sendInput: (payload) =>
        this.send({ type: RenderMessageType.Input, payload }),
      onMiddleClick: () => {
        emitRenderSignal(host, RENDER_SURFACE_MIDDLE_CLICK_EVENT);
      },
    });
    this.input.start();
  }

  send(
    body: RenderWorkerCommandBody,
    transfer: readonly Transferable[] = [],
  ): void {
    this.sender?.send(body, transfer);
  }

  stop(): void {
    this.input?.stop();
    this.input = null;
    this.viewport?.stop();
    this.viewport = null;
    for (const adapter of this.browserAdapters) adapter.stop();
    this.browserAdapters = [];
    this.disconnectGlobeState?.();
    this.disconnectGlobeState = null;
    if (this.sender) {
      this.sender.send({ type: RenderMessageType.Dispose });
    }
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.endpoint?.terminate();
    this.endpoint = null;
    this.sender = null;
  }

  private handleWorkerEvent(
    message: unknown,
    sessionId: string,
    canvas: HTMLCanvasElement,
    host: HTMLElement,
  ): void {
    if (!acceptsWorkerEvent(message, sessionId)) return;
    if (message.type === RenderMessageType.Ready) {
      canvas.dataset.renderWorkerReady = DatasetState.Ready;
      emitRenderSignal(host, RENDER_SURFACE_READY_EVENT);
      return;
    }
    if (message.type === RenderMessageType.DataChannelReady) {
      canvas.dataset.renderDataChannelReady = DatasetState.Ready;
      emitRenderSignal(host, RENDER_SURFACE_DATA_READY_EVENT);
      return;
    }
    if (message.type === RenderMessageType.GlobeState) {
      if (isRenderGlobeStateSnapshot(message.payload)) {
        this.globeState.accept(message.payload);
      }
      return;
    }
    if (message.type !== RenderMessageType.Interaction) return;
    const interaction = message.payload;
    if (!isRenderInteraction(interaction)) return;
    if (interaction.kind === RenderInteractionKind.Cursor) {
      canvas.style.cursor = interaction.cursor;
    }
    emitRenderInteraction(host, interaction);
  }

  private initializeWorker(
    canvas: HTMLCanvasElement,
    sessionId: string,
  ): void {
    const offscreen = canvas.transferControlToOffscreen();
    const dataClient = getDataWorkerClient();
    if (dataClient && typeof MessageChannel !== "undefined") {
      const channel = new MessageChannel();
      this.send(
        {
          type: RenderMessageType.Init,
          canvas: offscreen,
          dataPort: channel.port2,
        },
        [offscreen, channel.port2],
      );
      void dataClient.connectRender(channel.port1, sessionId);
      return;
    }
    this.send(
      { type: RenderMessageType.Init, canvas: offscreen },
      [offscreen],
    );
  }

  private startStateAdapters(): void {
    this.browserAdapters = [
      createBrowserReducedMotionAdapter(
        (value) => this.globeState.dispatch({
          kind: RenderGlobeCommandKind.SetReducedMotion,
          reducedMotion: value,
        }),
      ),
      createBrowserRenderThemeAdapter(
        (theme) => this.globeState.dispatch({
          kind: RenderGlobeCommandKind.SetRenderTheme,
          theme,
        }),
      ),
      createBrowserAircraftFilterUrlAdapter(this.globeState),
    ];
    for (const adapter of this.browserAdapters) adapter.start();
  }
}

export function createRenderSurfaceSession(
  dependencies: RenderSurfaceSessionDependencies = {},
): RenderSurfaceSession {
  return new RenderSurfaceSession(dependencies);
}
