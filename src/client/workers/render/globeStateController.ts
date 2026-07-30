import {
  RenderGlobeCommandKind,
  RenderProjectionMode,
  RenderRotationSpeedPolicy,
  isRenderGlobeCommand,
  isRenderGlobeStateSnapshot,
  type RenderGlobeCommand,
  type RenderGlobeStateSnapshot,
} from "@/workers/render/protocol";

export function createDefaultRenderGlobeState(): RenderGlobeStateSnapshot {
  return {
    projection: RenderProjectionMode.Globe,
    rotationEnabled: false,
    rotationSpeed: RenderRotationSpeedPolicy.Default,
  };
}

export function restoreRenderGlobeStateCommands(
  state: RenderGlobeStateSnapshot,
): readonly RenderGlobeCommand[] {
  return [
    {
      kind: RenderGlobeCommandKind.SetProjection,
      projection: state.projection,
    },
    {
      kind: RenderGlobeCommandKind.SetRotationEnabled,
      enabled: state.rotationEnabled,
    },
    {
      kind: RenderGlobeCommandKind.SetRotationSpeed,
      speed: state.rotationSpeed,
    },
  ];
}

function renderGlobeStatesEqual(
  left: RenderGlobeStateSnapshot,
  right: RenderGlobeStateSnapshot,
): boolean {
  return (
    left.projection === right.projection &&
    left.rotationEnabled === right.rotationEnabled &&
    left.rotationSpeed === right.rotationSpeed
  );
}

export class RenderGlobeStateController {
  private state = createDefaultRenderGlobeState();

  snapshot(): RenderGlobeStateSnapshot {
    return this.state;
  }

  apply(command: unknown): RenderGlobeStateSnapshot | null {
    if (!isRenderGlobeCommand(command)) return null;
    switch (command.kind) {
      case RenderGlobeCommandKind.SetProjection:
        return this.commit({
          ...this.state,
          projection: command.projection,
        });
      case RenderGlobeCommandKind.SetRotationEnabled:
        return this.commit({
          ...this.state,
          rotationEnabled: command.enabled,
        });
      case RenderGlobeCommandKind.ToggleRotation:
        return this.commit({
          ...this.state,
          rotationEnabled: !this.state.rotationEnabled,
        });
      case RenderGlobeCommandKind.SetRotationSpeed:
        return this.commit({
          ...this.state,
          rotationSpeed: command.speed,
        });
    }
  }

  replace(snapshot: unknown): RenderGlobeStateSnapshot | null {
    if (!isRenderGlobeStateSnapshot(snapshot)) return null;
    return this.commit({ ...snapshot });
  }

  private commit(
    state: RenderGlobeStateSnapshot,
  ): RenderGlobeStateSnapshot | null {
    if (renderGlobeStatesEqual(this.state, state)) return null;
    this.state = state;
    return this.state;
  }
}
