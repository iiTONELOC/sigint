import { useEffect } from "react";
import type { GlobeVisualizationProps } from "@/components/globe/types";
import { sendRenderSurfaceCommand } from "@/render-surface/element";

type OverlayCommandOptions = Readonly<{
  host: HTMLElement | null;
  warnings: GlobeVisualizationProps["cycloneWarnings"];
  warningColor: string;
  watchColor: string;
}>;

/**
 * Tropical watch and warning polygons, which are fetched on their own rather
 * than riding a point source. NWS alert areas are derived inside the renderer
 * from the weather points the DataWorker already sends it.
 */
export function useOverlayCommands({
  host,
  warnings,
  warningColor,
  watchColor,
}: OverlayCommandOptions): void {
  useEffect(() => {
    if (!host) return;
    sendRenderSurfaceCommand(host, {
      type: "warnings",
      payload: {
        features: warnings ?? [],
        warningColor,
        watchColor,
      },
    });
  }, [host, warningColor, warnings, watchColor]);
}
