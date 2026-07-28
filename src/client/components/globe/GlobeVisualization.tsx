import { useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import type { GlobeVisualizationProps } from "@/components/globe/types";
import { RenderSurfaceHost } from "@/render-surface/RenderSurfaceHost";
import { useColorCommands } from "@/components/globe/bridge/useColorCommands";
import { usePresentationCommands } from "@/components/globe/bridge/usePresentationCommands";
import { useSurfaceEvents } from "@/components/globe/bridge/useSurfaceEvents";
import { TrailTooltip } from "@/components/globe/TrailTooltip";

export function GlobeVisualization(
  props: Readonly<GlobeVisualizationProps>,
) {
  const [host, setHost] = useState<HTMLElement | null>(null);
  const { theme } = useTheme();
  const tooltip = useSurfaceEvents({ host, props });

  useColorCommands(host, theme.colors);
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
