import {
  DEFAULT_AIRCRAFT_FILTER_VALUES,
  type AircraftFilterValues,
} from "@shared/domain/aircraftFilter";
import {
  SaffirSimpson,
} from "@shared/domain/cyclones";
import { Domain } from "@shared/domain/identity";
import {
  RENDER_THEME_COLOR_KEYS,
  type RenderWorkerColors,
} from "@shared/domain/theme";
import {
  getPointSourceDefinition,
} from "@shared/domain/pointSource";
import type {
  RenderSourceId,
} from "@shared/source";
import {
  DEFAULT_RENDER_CYCLONE_OVERLAY,
  RenderGlobeCommandKind,
  RenderProjectionMode,
  RenderRotationSpeedPolicy,
  isRenderGlobeCommand,
  isRenderGlobeStateSnapshot,
  type RenderCycloneFilter,
  type RenderCycloneOverlay,
  type RenderGlobeCommand,
  type RenderGlobeStateSnapshot,
} from "@/workers/render/protocol";
import {
  isRenderLayerId,
  registeredRenderLayerIds,
  REGISTERED_RENDER_LAYER_DEFAULTS,
} from "@/workers/render/policy";

function copyAircraftFilter(
  filter: AircraftFilterValues,
): AircraftFilterValues {
  return {
    ...filter,
    squawks: [...filter.squawks],
    countries: [...filter.countries],
  };
}

function copyCycloneFilter(
  filter: RenderCycloneFilter,
): RenderCycloneFilter {
  return structuredClone(filter);
}

function copyRenderTheme(
  theme: RenderWorkerColors,
): RenderWorkerColors {
  return { ...theme };
}

function copyRenderGlobeState(
  state: RenderGlobeStateSnapshot,
): RenderGlobeStateSnapshot {
  return {
    ...state,
    layers: { ...state.layers },
    aircraftFilter: copyAircraftFilter(state.aircraftFilter),
    cycloneFilter: copyCycloneFilter(state.cycloneFilter),
    renderTheme: state.renderTheme
      ? copyRenderTheme(state.renderTheme)
      : null,
  };
}

export function createDefaultRenderGlobeState(): RenderGlobeStateSnapshot {
  return {
    projection: RenderProjectionMode.Globe,
    rotationEnabled: false,
    rotationSpeed: RenderRotationSpeedPolicy.Default,
    layers: { ...REGISTERED_RENDER_LAYER_DEFAULTS },
    aircraftFilter: copyAircraftFilter(
      DEFAULT_AIRCRAFT_FILTER_VALUES,
    ),
    cycloneFilter: {
      minimumCategory: SaffirSimpson.None,
      showWarnings: true,
      overlays: {},
    },
    isolateMode: null,
    reducedMotion: false,
    renderTheme: null,
  };
}

export function restoreRenderGlobeStateCommands(
  state: RenderGlobeStateSnapshot,
): readonly RenderGlobeCommand[] {
  const layerCommands: RenderGlobeCommand[] = registeredRenderLayerIds().map(
    (layer) => ({
      kind: RenderGlobeCommandKind.SetLayerVisibility,
      layer,
      visible: state.layers[layer],
    }),
  );
  const commands: RenderGlobeCommand[] = [
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
    ...layerCommands,
    {
      kind: RenderGlobeCommandKind.SetAircraftFilter,
      filter: copyAircraftFilter(state.aircraftFilter),
    },
    {
      kind: RenderGlobeCommandKind.SetCycloneFilter,
      filter: copyCycloneFilter(state.cycloneFilter),
    },
    {
      kind: RenderGlobeCommandKind.SetIsolation,
      mode: state.isolateMode,
    },
    {
      kind: RenderGlobeCommandKind.SetReducedMotion,
      reducedMotion: state.reducedMotion,
    },
  ];
  if (state.renderTheme) {
    commands.push({
      kind: RenderGlobeCommandKind.SetRenderTheme,
      theme: copyRenderTheme(state.renderTheme),
    });
  }
  return commands;
}

function arraysEqual(
  left: readonly unknown[],
  right: readonly unknown[],
): boolean {
  return (
    left.length === right.length &&
    left.every((value, index) => value === right[index])
  );
}

function aircraftFiltersEqual(
  left: AircraftFilterValues,
  right: AircraftFilterValues,
): boolean {
  return (
    left.enabled === right.enabled &&
    left.showAirborne === right.showAirborne &&
    left.showGround === right.showGround &&
    left.milFilter === right.milFilter &&
    arraysEqual(left.squawks, right.squawks) &&
    arraysEqual(left.countries, right.countries)
  );
}

function cycloneFiltersEqual(
  left: RenderCycloneFilter,
  right: RenderCycloneFilter,
): boolean {
  const entityIds = Object.keys(left.overlays);
  return (
    left.minimumCategory === right.minimumCategory &&
    left.showWarnings === right.showWarnings &&
    entityIds.length === Object.keys(right.overlays).length &&
    entityIds.every((entityId) => {
      const leftOverlay = left.overlays[entityId];
      const rightOverlay = right.overlays[entityId];
      if (leftOverlay === undefined || rightOverlay === undefined) return false;
      return (
        leftOverlay.showForecast === rightOverlay.showForecast &&
        leftOverlay.showCone === rightOverlay.showCone &&
        leftOverlay.showWindField === rightOverlay.showWindField &&
        leftOverlay.showModels === rightOverlay.showModels &&
        arraysEqual(leftOverlay.hiddenModels, rightOverlay.hiddenModels)
      );
    })
  );
}

function renderThemesEqual(
  left: RenderWorkerColors | null,
  right: RenderWorkerColors | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return RENDER_THEME_COLOR_KEYS.every(
    (key) => left[key] === right[key],
  );
}

function renderGlobeStatesEqual(
  left: RenderGlobeStateSnapshot,
  right: RenderGlobeStateSnapshot,
): boolean {
  return (
    left.projection === right.projection &&
    left.rotationEnabled === right.rotationEnabled &&
    left.rotationSpeed === right.rotationSpeed &&
    registeredRenderLayerIds().every(
      (layer) => left.layers[layer] === right.layers[layer],
    ) &&
    aircraftFiltersEqual(
      left.aircraftFilter,
      right.aircraftFilter,
    ) &&
    cycloneFiltersEqual(left.cycloneFilter, right.cycloneFilter) &&
    left.isolateMode === right.isolateMode &&
    left.reducedMotion === right.reducedMotion &&
    renderThemesEqual(left.renderTheme, right.renderTheme)
  );
}

function toggledModelCodes(
  hiddenModels: readonly string[],
  model: string,
): readonly string[] {
  const next = new Set(hiddenModels);
  if (next.has(model)) next.delete(model);
  else next.add(model);
  return [...next];
}

function toggledAllModelCodes(
  hiddenModels: readonly string[],
  models: readonly string[],
): readonly string[] {
  const hidden = new Set(hiddenModels);
  const anyVisible = models.some((model) => !hidden.has(model));
  return anyVisible ? [...models] : [];
}

export class RenderGlobeStateController {
  private state = createDefaultRenderGlobeState();

  snapshot(): RenderGlobeStateSnapshot {
    return this.state;
  }

  sourceIsVisible(source: RenderSourceId): boolean {
    if (source === Domain.Aircraft) {
      return this.state.aircraftFilter.enabled;
    }
    if (source === Domain.CycloneWarnings) {
      return this.state.cycloneFilter.showWarnings;
    }
    const layer = getPointSourceDefinition(source).pointType;
    return isRenderLayerId(layer) && this.state.layers[layer];
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
      case RenderGlobeCommandKind.SetLayerVisibility:
        return this.commit({
          ...this.state,
          layers: {
            ...this.state.layers,
            [command.layer]: command.visible,
          },
        });
      case RenderGlobeCommandKind.ToggleLayer:
        return this.commit({
          ...this.state,
          layers: {
            ...this.state.layers,
            [command.layer]: !this.state.layers[command.layer],
          },
        });
      case RenderGlobeCommandKind.SetAircraftFilter:
        return this.commit({
          ...this.state,
          aircraftFilter: command.filter,
        });
      case RenderGlobeCommandKind.SetCycloneFilter:
        return this.commit({
          ...this.state,
          cycloneFilter: command.filter,
        });
      case RenderGlobeCommandKind.ToggleCycloneLayer:
        return this.commitCycloneOverlay(
          command.entityId,
          (overlay) => ({
            ...overlay,
            [command.layer]:
              !overlay[command.layer],
          }),
        );
      case RenderGlobeCommandKind.ToggleCycloneModel:
        return this.commitCycloneOverlay(
          command.entityId,
          (overlay) => ({
            ...overlay,
            hiddenModels: toggledModelCodes(
              overlay.hiddenModels,
              command.model,
            ),
          }),
        );
      case RenderGlobeCommandKind.ToggleAllCycloneModels:
        return this.commitCycloneOverlay(
          command.entityId,
          (overlay) => ({
            ...overlay,
            hiddenModels: toggledAllModelCodes(
              overlay.hiddenModels,
              command.models,
            ),
          }),
        );
      case RenderGlobeCommandKind.ToggleCycloneWarnings:
        return this.commit({
          ...this.state,
          cycloneFilter: {
            ...this.state.cycloneFilter,
            showWarnings: !this.state.cycloneFilter.showWarnings,
          },
        });
      case RenderGlobeCommandKind.SetIsolation:
        return this.commit({
          ...this.state,
          isolateMode: command.mode,
        });
      case RenderGlobeCommandKind.SetReducedMotion:
        return this.commit({
          ...this.state,
          reducedMotion: command.reducedMotion,
        });
      case RenderGlobeCommandKind.SetRenderTheme:
        return this.commit({
          ...this.state,
          renderTheme: command.theme,
        });
    }
  }

  replace(snapshot: unknown): RenderGlobeStateSnapshot | null {
    if (!isRenderGlobeStateSnapshot(snapshot)) return null;
    return this.commit(snapshot);
  }

  private commit(
    state: RenderGlobeStateSnapshot,
  ): RenderGlobeStateSnapshot | null {
    if (renderGlobeStatesEqual(this.state, state)) return null;
    this.state = copyRenderGlobeState(state);
    return this.state;
  }

  private commitCycloneOverlay(
    entityId: string,
    update: (overlay: RenderCycloneOverlay) => RenderCycloneOverlay,
  ): RenderGlobeStateSnapshot | null {
    const filter = this.state.cycloneFilter;
    const overlay = filter.overlays[entityId] ??
      DEFAULT_RENDER_CYCLONE_OVERLAY;
    return this.commit({
      ...this.state,
      cycloneFilter: {
        ...filter,
        overlays: {
          ...filter.overlays,
          [entityId]: update(overlay),
        },
      },
    });
  }
}
