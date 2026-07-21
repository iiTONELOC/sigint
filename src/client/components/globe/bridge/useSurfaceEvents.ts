import { useEffect, useRef, useState } from "react";
import type { GlobeVisualizationProps } from "@/components/globe/types";
import type { RenderInteractionPayload } from "@/workers/render/protocol";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import { warningToDataPoint } from "@/features/environmental/cyclones/data/warningPoint";
import {
  RENDER_SURFACE_INTERACTION_EVENT,
  RENDER_SURFACE_MIDDLE_CLICK_EVENT,
  readRenderInteraction,
} from "@/render-surface/events";

export type TrailTooltipState = Extract<
  RenderInteractionPayload,
  { kind: "trailTooltip" }
>;

type SurfaceEventOptions = Readonly<{
  host: HTMLElement | null;
  props: Readonly<GlobeVisualizationProps>;
}>;

function workerSource(
  pointType: string | null,
): "earthquake" | "fire" | null {
  if (pointType === "quakes") return "earthquake";
  if (pointType === "fires") return "fire";
  return null;
}

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

      if (interaction.kind === "selection") {
        selectionRequest.current += 1;
        const request = selectionRequest.current;
        const warning = current.cycloneWarnings?.find(
          (candidate) => candidate.id === interaction.id,
        );
        if (warning) {
          current.onSelect(warningToDataPoint(warning));
          return;
        }
        if (!interaction.id) {
          current.onSelect(null);
          return;
        }
        const local = current.data.find(
          (candidate) => candidate.id === interaction.id,
        );
        const source = workerSource(interaction.pointType);
        const dataClient = getDataWorkerClient();
        if (!source || !dataClient) {
          current.onSelect(local ?? null);
          return;
        }
        void dataClient.getSourceEntity(source, interaction.id).then(
          (response) => {
            if (request !== selectionRequest.current) return;
            propsRef.current.onSelect(response.value ?? local ?? null);
          },
          () => {
            if (request !== selectionRequest.current) return;
            propsRef.current.onSelect(local ?? null);
          },
        );
        return;
      }

      if (interaction.kind === "rawCanvasClick") {
        current.onRawCanvasClick?.();
        return;
      }
      if (interaction.kind === "selectedSide") {
        current.onSelectedSide?.(interaction.side);
        return;
      }
      if (interaction.kind === "trailTooltip") {
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
