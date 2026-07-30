import {
  RenderCycloneLayer,
  RenderGlobeCommandKind,
  RenderProjectionMode,
  type RenderAircraftFilter,
  type RenderCycloneFilter,
  type RenderGlobeCommand,
  type RenderGlobeStateSnapshot,
  type RenderLayerId,
  type SelectedIsolateMode,
} from "@/workers/render/protocol";
import {
  RenderGlobeStateController,
  restoreRenderGlobeStateCommands,
} from "@/workers/render/globeStateController";

type RenderGlobeStateListener = () => void;
type RenderGlobeCommandSender = (command: RenderGlobeCommand) => void;

export class RenderGlobeStateStore {
  private readonly controller = new RenderGlobeStateController();
  private readonly listeners = new Set<RenderGlobeStateListener>();
  private sender: RenderGlobeCommandSender | null = null;

  read(): RenderGlobeStateSnapshot {
    return this.controller.snapshot();
  }

  subscribe(listener: RenderGlobeStateListener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  connect(send: RenderGlobeCommandSender): () => void {
    this.sender = send;
    for (const command of restoreRenderGlobeStateCommands(this.read())) {
      send(command);
    }
    return () => {
      if (this.sender === send) this.sender = null;
    };
  }

  dispatch(command: RenderGlobeCommand): void {
    if (this.sender) {
      this.sender(command);
      return;
    }
    const snapshot = this.controller.apply(command);
    if (snapshot) this.emit();
  }

  accept(snapshot: unknown): boolean {
    const accepted = this.controller.replace(snapshot);
    if (!accepted) return false;
    this.emit();
    return true;
  }

  private emit(): void {
    for (const listener of this.listeners) listener();
  }
}

export const renderGlobeStateStore = new RenderGlobeStateStore();

export function readRenderGlobeState(): RenderGlobeStateSnapshot {
  return renderGlobeStateStore.read();
}

export function subscribeRenderGlobeState(
  listener: RenderGlobeStateListener,
): () => void {
  return renderGlobeStateStore.subscribe(listener);
}

export function setRenderProjection(projection: RenderProjectionMode): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.SetProjection,
    projection,
  });
}

export function setRenderRotationEnabled(enabled: boolean): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.SetRotationEnabled,
    enabled,
  });
}

export function toggleRenderRotation(): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.ToggleRotation,
  });
}

export function setRenderRotationSpeed(speed: number): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.SetRotationSpeed,
    speed,
  });
}

export function toggleRenderLayer(layer: RenderLayerId): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.ToggleLayer,
    layer,
  });
}

export function setRenderAircraftFilter(
  filter: RenderAircraftFilter,
): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.SetAircraftFilter,
    filter,
  });
}

export function setRenderEarthquakeFilter(
  minimumMagnitude: number,
): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.SetEarthquakeFilter,
    minimumMagnitude,
  });
}

export function setRenderFireFilter(
  minimumConfidence: number,
): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.SetFireFilter,
    minimumConfidence,
  });
}

export function setRenderCycloneFilter(
  filter: RenderCycloneFilter,
): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.SetCycloneFilter,
    filter,
  });
}

export function toggleRenderCycloneLayer(
  layer: RenderCycloneLayer,
): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.ToggleCycloneLayer,
    layer,
  });
}

export function toggleRenderCycloneModel(model: string): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.ToggleCycloneModel,
    model,
  });
}

export function toggleAllRenderCycloneModels(
  models: readonly string[],
): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.ToggleAllCycloneModels,
    models,
  });
}

export function setRenderIsolation(mode: SelectedIsolateMode): void {
  renderGlobeStateStore.dispatch({
    kind: RenderGlobeCommandKind.SetIsolation,
    mode,
  });
}
