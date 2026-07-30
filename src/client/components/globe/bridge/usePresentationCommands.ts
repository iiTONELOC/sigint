import { useEffect } from "react";
import type { GlobeVisualizationProps } from "@/components/globe/types";
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
import {
  canonicalEntityId,
  sourceForPointType,
} from "@/workers/data/sources/registry";
import { MilFilter } from "@shared/domain/aircraft";
import { SaffirSimpson } from "@/features/environmental/cyclones/types";

type PresentationCommandOptions = Readonly<{
  host: HTMLElement | null;
  props: Readonly<GlobeVisualizationProps>;
}>;

type FocusCommandOptions = Readonly<{
  host: HTMLElement | null;
  kind: RenderFocusKind.Focus | RenderFocusKind.Reveal;
  selected: GlobeVisualizationProps["selected"];
  targetId: string | null | undefined;
}>;

function useFocusCommand({
  host,
  kind,
  selected,
  targetId,
}: FocusCommandOptions): void {
  useEffect(() => {
    if (!host || !targetId || selected?.id !== targetId) return;
    const source = sourceForPointType(selected.type);
    if (!source) return;
    sendRenderSurfaceCommand(host, {
      type: RenderMessageType.Focus,
      payload: {
        source,
        entityId: canonicalEntityId(selected),
        kind,
      },
    });
  }, [host, kind, selected, targetId]);
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
    searchText,
    selected,
    zoomToId,
    revealId,
  } = props;

  useEffect(() => {
    if (!host) return;
    const source = selected
      ? sourceForPointType(selected.type)
      : null;
    sendRenderSurfaceCommand(host, {
      type: RenderMessageType.Selection,
      payload: selected && source
        ? {
            source,
            entityId: canonicalEntityId(selected),
            interactionId: selected.id,
            pointType: selected.type,
          }
        : null,
    });
  }, [host, selected]);

  useEffect(() => {
    if (!host) return;
    sendRenderSurfaceCommand(host, {
      type: RenderMessageType.Search,
      payload: searchText,
    });
  }, [host, searchText]);

  useEffect(() => {
    if (!host) return;
    const cyclone = cycloneFilter;
    const selectedItem: SelectedRenderItem | null = selected
      ? {
          id: selected.id,
          type: selected.type,
          lat: recordLatitude(selected),
          lon: recordLongitude(selected),
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
        selectedItem,
        cyclonesMinCategory:
          cyclone?.minCategory ?? SaffirSimpson.None,
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
    selected,
  ]);

  useFocusCommand({
    host,
    kind: RenderFocusKind.Focus,
    selected,
    targetId: zoomToId,
  });
  useFocusCommand({
    host,
    kind: RenderFocusKind.Reveal,
    selected,
    targetId: revealId,
  });
}
