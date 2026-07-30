import { useState } from "react";
import type { GlobeVisualizationProps } from "@/components/globe/types";
import { RenderSurfaceHost } from "@/render-surface/RenderSurfaceHost";
import { usePresentationCommands } from "@/components/globe/bridge/usePresentationCommands";
import { useSurfaceEvents } from "@/components/globe/bridge/useSurfaceEvents";
import { TrailTooltip } from "@/components/globe/TrailTooltip";

export function GlobeVisualization(
  props: Readonly<GlobeVisualizationProps>,
) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const tooltip = useSurfaceEvents({ host, props });

  usePresentationCommands({ host, props });
  return (
    <div className="relative w-full h-full">
      <RenderSurfaceHost
        ref={setHost}
        className="block w-full h-full"
      />
      <TrailTooltip state={tooltip} />
    </div>
  );
}
