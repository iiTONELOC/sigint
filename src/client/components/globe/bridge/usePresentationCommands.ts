import { useEffect, useSyncExternalStore } from "react";
import type { GlobeVisualizationProps } from "@/components/globe/types";
import {
  getTrail,
  getTrackMotion,
  subscribeWatchedTrail,
  watchedTrailRevision,
} from "@/lib/geo/trailService";
import {
  getSelectedRoute,
  selectedRouteRevision,
  subscribeSelectedRoute,
} from "@/lib/runtime/layoutSignals";
import { sendRenderSurfaceCommand } from "@/render-surface/element";
import {
  recordLatitude,
  recordLongitude,
} from "@/workers/data/source-model/position";
import {
  RenderFocusKind,
  RenderMessageType,
  type SelectedRenderItem,
} from "@/workers/render/protocol";
import { MilFilter } from "@shared/domain/aircraft";

type PresentationCommandOptions = Readonly<{
  host: HTMLElement | null;
  props: Readonly<GlobeVisualizationProps>;
}>;

function findTarget(id: string, props: Readonly<GlobeVisualizationProps>) {
  return props.selected?.id === id ? props.selected : null;
}

export function usePresentationCommands({
  host,
  props,
}: PresentationCommandOptions): void {
  const {
    aircraftFilter,
    autoRotate = true,
    cycloneFilter,
    earthquakeFilter,
    fireFilter,
    flat = false,
    isolatedId,
    isolateMode,
    layers,
    rotationSpeed = 1,
    searchMatchIds,
    selected,
    zoomToId,
    revealId,
  } = props;

  const trailRevision = useSyncExternalStore(
    subscribeWatchedTrail,
    watchedTrailRevision,
    watchedTrailRevision,
  );
  const routeRevision = useSyncExternalStore(
    subscribeSelectedRoute,
    selectedRouteRevision,
    selectedRouteRevision,
  );

  useEffect(() => {
    if (!host) return;
    const cyclone = cycloneFilter;
    const selectedItem: SelectedRenderItem | null = selected
      ? {
          id: selected.id,
          type: selected.type,
          lat: recordLatitude(selected),
          lon: recordLongitude(selected),
          trail: getTrail(selected.id),
          route: getSelectedRoute(selected.id),
          motion: getTrackMotion(selected.id),
        }
      : null;
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    sendRenderSurfaceCommand(host, {
      type: RenderMessageType.Presentation,
      payload: {
        flat,
        autoRotate,
        rotationSpeed,
        selectedId: selected?.id ?? null,
        isolatedId,
        isolateMode,
        layers,
        aircraftFilter: {
          enabled: aircraftFilter.enabled,
          showAirborne: aircraftFilter.showAirborne,
          showGround: aircraftFilter.showGround,
          squawks: Array.from(aircraftFilter.squawks),
          countries: Array.from(aircraftFilter.countries),
          milFilter: aircraftFilter.milFilter ?? MilFilter.All,
        },
        earthquakeMinMagnitude: earthquakeFilter.minMagnitude,
        fireMinConfidence: fireFilter.minConfidence,
        searchMatchIds: searchMatchIds
          ? Array.from(searchMatchIds)
          : null,
        selectedItem,
        cyclonesShowForecast: cyclone?.showForecast ?? true,
        cyclonesShowCone: cyclone?.showCone ?? true,
        cyclonesShowWindField: cyclone?.showWindField ?? false,
        cyclonesShowWarnings: cyclone?.showWarnings ?? true,
        cyclonesShowModels: cyclone?.showModels ?? false,
        cyclonesHiddenModels: cyclone?.hiddenModels ?? [],
        prefersReducedMotion,
      },
    });
  }, [
    aircraftFilter,
    autoRotate,
    cycloneFilter,
    earthquakeFilter,
    fireFilter,
    flat,
    host,
    isolatedId,
    isolateMode,
    layers,
    rotationSpeed,
    searchMatchIds,
    selected,
    trailRevision,
    routeRevision,
  ]);

  useEffect(() => {
    if (!host || !zoomToId) return;
    const item = findTarget(zoomToId, props);
    if (!item) return;
    sendRenderSurfaceCommand(host, {
      type: RenderMessageType.Focus,
      payload: {
        id: item.id,
        latitude: recordLatitude(item),
        longitude: recordLongitude(item),
        kind: RenderFocusKind.Focus,
      },
    });
  }, [host, props, zoomToId]);

  useEffect(() => {
    if (!host || !revealId) return;
    const item = findTarget(revealId, props);
    if (!item) return;
    sendRenderSurfaceCommand(host, {
      type: RenderMessageType.Focus,
      payload: {
        id: item.id,
        latitude: recordLatitude(item),
        longitude: recordLongitude(item),
        kind: RenderFocusKind.Reveal,
      },
    });
  }, [host, props, revealId]);
}
