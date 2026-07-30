import { useEffect, useRef, useState } from "react";
import type { GlobeVisualizationProps } from "@/components/globe/types";
import {
  RenderInteractionKind,
  type RenderInteractionPayload,
} from "@/workers/render/protocol";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import { sourceForPointType } from "@/workers/data/sources/registry";
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
        if (!interaction.id) {
          current.onSelect(null);
          return;
        }
        const source = sourceForPointType(interaction.pointType);
        const dataClient = getDataWorkerClient();
        if (!source || !dataClient) return;
        void dataClient.getSourceEntity(source, interaction.id).then(
          (response) => {
            if (request !== selectionRequest.current) return;
            propsRef.current.onSelect(response.value ?? null);
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
    setTooltip(null);
  }, [props.selected?.id]);

  return tooltip;
}
