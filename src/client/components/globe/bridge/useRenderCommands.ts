import { useEffect } from "react";
import type { GlobeVisualizationProps } from "@/components/globe/types";
import { canonicalEntityId } from "@/features/base/dataPoints";
import { sendRenderSurfaceCommand } from "@/render-surface/element";
import {
  RenderFocusKind,
  RenderMessageType,
} from "@/workers/render/protocol";
import { sourceForPointType } from "@shared/domain/pointSource";

type RenderCommandOptions = Readonly<{
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

export function useRenderCommands({
  host,
  props,
}: RenderCommandOptions): void {
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
