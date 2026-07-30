import {
  DEFAULT_AIRCRAFT_FILTER_VALUES,
} from "@shared/domain/aircraftFilter";
import {
  SaffirSimpson,
} from "@shared/domain/cycloneClassification";
import { Domain } from "@shared/domain/identity";
import {
  pointTypeForSource,
} from "@/workers/data/sources/registry";
import type {
  RenderSourceId,
} from "@/workers/data/sourceIds";
import {
  RENDER_LAYER_IDS,
  RenderColorKey,
  RenderFilterBoundary,
  RenderGlobeCommandKind,
  RenderProjectionMode,
  RenderRotationSpeedPolicy,
  isRenderGlobeCommand,
  isRenderGlobeStateSnapshot,
  isRenderLayerId,
  type RenderAircraftFilter,
  type RenderCycloneFilter,
  type RenderGlobeCommand,
  type RenderGlobeStateSnapshot,
  type RenderLayerVisibility,
  type RenderWorkerColors,
} from "@/workers/render/protocol";

function createDefaultLayerVisibility(): RenderLayerVisibility {
  return {
    [Domain.Ships]: true,
    [Domain.Events]: true,
    [Domain.Quakes]: true,
    [Domain.Fires]: true,
    [Domain.Weather]: true,
    [Domain.Cyclones]: true,
  };
}

function copyAircraftFilter(
  filter: RenderAircraftFilter,
): RenderAircraftFilter {
  return {
    ...filter,
    squawks: [...filter.squawks],
    countries: [...filter.countries],
  };
}

function copyCycloneFilter(
  filter: RenderCycloneFilter,
): RenderCycloneFilter {
  return {
    ...filter,
    hiddenModels: [...filter.hiddenModels],
  };
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
    layers: createDefaultLayerVisibility(),
    aircraftFilter: copyAircraftFilter(
      DEFAULT_AIRCRAFT_FILTER_VALUES,
    ),
    earthquakeMinimumMagnitude: RenderFilterBoundary.Minimum,
    fireMinimumConfidence: RenderFilterBoundary.Minimum,
    cycloneFilter: {
      minimumCategory: SaffirSimpson.None,
      showForecast: true,
      showCone: true,
      showWindField: false,
      showModels: false,
      showWarnings: true,
      hiddenModels: [],
    },
    isolateMode: null,
    reducedMotion: false,
    renderTheme: null,
  };
}

export function restoreRenderGlobeStateCommands(
  state: RenderGlobeStateSnapshot,
): readonly RenderGlobeCommand[] {
  const layerCommands: RenderGlobeCommand[] = RENDER_LAYER_IDS.map(
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
      kind: RenderGlobeCommandKind.SetEarthquakeFilter,
      minimumMagnitude: state.earthquakeMinimumMagnitude,
    },
    {
      kind: RenderGlobeCommandKind.SetFireFilter,
      minimumConfidence: state.fireMinimumConfidence,
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
  left: RenderAircraftFilter,
  right: RenderAircraftFilter,
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
  return (
    left.minimumCategory === right.minimumCategory &&
    left.showForecast === right.showForecast &&
    left.showCone === right.showCone &&
    left.showWindField === right.showWindField &&
    left.showModels === right.showModels &&
    left.showWarnings === right.showWarnings &&
    arraysEqual(left.hiddenModels, right.hiddenModels)
  );
}

function renderThemesEqual(
  left: RenderWorkerColors | null,
  right: RenderWorkerColors | null,
): boolean {
  if (left === right) return true;
  if (!left || !right) return false;
  return Object.values(RenderColorKey).every(
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
    RENDER_LAYER_IDS.every(
      (layer) => left.layers[layer] === right.layers[layer],
    ) &&
    aircraftFiltersEqual(
      left.aircraftFilter,
      right.aircraftFilter,
    ) &&
    left.earthquakeMinimumMagnitude ===
      right.earthquakeMinimumMagnitude &&
    left.fireMinimumConfidence === right.fireMinimumConfidence &&
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
    const layer = pointTypeForSource(source);
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
      case RenderGlobeCommandKind.SetEarthquakeFilter:
        return this.commit({
          ...this.state,
          earthquakeMinimumMagnitude: command.minimumMagnitude,
        });
      case RenderGlobeCommandKind.SetFireFilter:
        return this.commit({
          ...this.state,
          fireMinimumConfidence: command.minimumConfidence,
        });
      case RenderGlobeCommandKind.SetCycloneFilter:
        return this.commit({
          ...this.state,
          cycloneFilter: command.filter,
        });
      case RenderGlobeCommandKind.ToggleCycloneLayer:
        return this.commit({
          ...this.state,
          cycloneFilter: {
            ...this.state.cycloneFilter,
            [command.layer]:
              !this.state.cycloneFilter[command.layer],
          },
        });
      case RenderGlobeCommandKind.ToggleCycloneModel:
        return this.commit({
          ...this.state,
          cycloneFilter: {
            ...this.state.cycloneFilter,
            hiddenModels: toggledModelCodes(
              this.state.cycloneFilter.hiddenModels,
              command.model,
            ),
          },
        });
      case RenderGlobeCommandKind.ToggleAllCycloneModels:
        return this.commit({
          ...this.state,
          cycloneFilter: {
            ...this.state.cycloneFilter,
            hiddenModels: toggledAllModelCodes(
              this.state.cycloneFilter.hiddenModels,
              command.models,
            ),
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
}
