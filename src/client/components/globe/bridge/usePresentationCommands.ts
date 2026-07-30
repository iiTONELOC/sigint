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
        selectedItem,
        prefersReducedMotion,
      },
    });
  }, [host, selected]);

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
