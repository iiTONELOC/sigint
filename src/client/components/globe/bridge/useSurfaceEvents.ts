import { useEffect, useRef, useState } from "react";
import type { GlobeVisualizationProps } from "@/components/globe/types";
import {
  RenderInteractionKind,
  type RenderInteractionPayload,
} from "@/workers/render/protocol";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import {
  RENDER_SURFACE_INTERACTION_EVENT,
  RENDER_SURFACE_MIDDLE_CLICK_EVENT,
  readRenderInteraction,
} from "@/render-surface/events";

export type TrailTooltipState = Extract<
  RenderInteractionPayload,
  { kind: RenderInteractionKind.TrailTooltip }
>;

type SurfaceEventOptions = Readonly<{
  host: HTMLElement | null;
  props: Readonly<GlobeVisualizationProps>;
}>;

export function useSurfaceEvents({
  host,
  props,
}: SurfaceEventOptions): TrailTooltipState | null {
  const propsRef = useRef(props);
  const selectionRequest = useRef(0);
  const [tooltip, setTooltip] = useState<TrailTooltipState | null>(null);
  propsRef.current = props;

  useEffect(() => {
    if (!host) return;

    const handleInteraction = (event: Event): void => {
      const interaction = readRenderInteraction(event);
      if (!interaction) return;
      const current = propsRef.current;

      if (interaction.kind === RenderInteractionKind.Selection) {
        selectionRequest.current += 1;
        const request = selectionRequest.current;
        const identity = interaction.selection.identity;
        if (!identity) {
          current.onSelect(null);
          return;
        }
        const dataClient = getDataWorkerClient();
        if (!dataClient) return;
        void dataClient.getSourceEntity(
          identity.source,
          identity.interactionId,
        ).then(
          (response) => {
            if (request !== selectionRequest.current) return;
            const value = response.value;
            propsRef.current.onSelect(value ?? null);
          },
          (error_: unknown) => undefined,
        );
        return;
      }

      if (interaction.kind === RenderInteractionKind.RawCanvasClick) {
        current.onRawCanvasClick?.();
        return;
      }
      if (interaction.kind === RenderInteractionKind.SelectedSide) {
        current.onSelectedSide?.(interaction.side);
        return;
      }
      if (interaction.kind === RenderInteractionKind.TrailTooltip) {
        setTooltip(interaction.visible && interaction.point
          ? interaction
          : null);
      }
    };

    const handleMiddleClick = (): void => {
      propsRef.current.onMiddleClick?.();
    };

    host.addEventListener(
      RENDER_SURFACE_INTERACTION_EVENT,
      handleInteraction,
    );
    host.addEventListener(
      RENDER_SURFACE_MIDDLE_CLICK_EVENT,
      handleMiddleClick,
    );
    return () => {
      host.removeEventListener(
        RENDER_SURFACE_INTERACTION_EVENT,
        handleInteraction,
      );
      host.removeEventListener(
        RENDER_SURFACE_MIDDLE_CLICK_EVENT,
        handleMiddleClick,
      );
    };
  }, [host]);

  useEffect(() => {
    selectionRequest.current += 1;
    setTooltip(null);
  }, [props.selected?.id]);

  return tooltip;
}
