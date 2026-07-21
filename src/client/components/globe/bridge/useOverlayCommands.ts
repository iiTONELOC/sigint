import { useEffect } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import type { GlobeVisualizationProps } from "@/components/globe/types";
import { getTrail } from "@/lib/geo/trailService";
import { severityMeta, weatherSeverityRank } from "@/features/environmental/weather/severity";
import { RENDER_POLICY } from "@/workers/render/policy";
import { sendRenderSurfaceCommand } from "@/render-surface/element";
import type { RenderWorkerColors } from "@/workers/render/protocol";

type OverlayCommandOptions = Readonly<{
  host: HTMLElement | null;
  data: readonly DataPoint[];
  dataVersion: number;
  warnings: GlobeVisualizationProps["cycloneWarnings"];
  colors: RenderWorkerColors;
  warningColor: string;
  watchColor: string;
}>;

type PackedOverlays = Readonly<{
  ids: readonly string[];
  values: Float32Array<ArrayBuffer>;
  timestamps: Float64Array<ArrayBuffer>;
  weatherFeatures: readonly Readonly<{
    id: string;
    kind: string;
    geometry: unknown;
  }>[];
}>;

function createPackedOverlays(
  ids: readonly string[],
  values: readonly number[],
  timestamps: readonly number[],
  weatherFeatures: PackedOverlays["weatherFeatures"],
): PackedOverlays {
  return {
    ids,
    values: new Float32Array(values),
    timestamps: new Float64Array(timestamps),
    weatherFeatures,
  };
}

export function useOverlayCommands({
  host,
  data,
  dataVersion,
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

  useEffect(() => {
    if (!host) return;
    let cancelled = false;
    let frame = 0;
    let offset = 0;
    const ids: string[] = [];
    const values: number[] = [];
    const timestamps: number[] = [];
    const weatherFeatures: {
      id: string;
      kind: string;
      geometry: unknown;
    }[] = [];

    const finish = (): void => {
      const packed = createPackedOverlays(
        ids,
        values,
        timestamps,
        weatherFeatures,
      );
      sendRenderSurfaceCommand(
        host,
        {
          type: "trails",
          ids: packed.ids,
          values: packed.values,
          timestamps: packed.timestamps,
        },
        [packed.values.buffer, packed.timestamps.buffer],
      );
      sendRenderSurfaceCommand(host, {
        type: "weatherAlerts",
        payload: {
          features: packed.weatherFeatures,
          warningColor: severityMeta("Extreme").ink,
          watchColor: severityMeta("Moderate").ink,
        },
      });
    };

    const scan = (): void => {
      if (cancelled) return;
      const end = Math.min(
        offset + RENDER_POLICY.dataChunkSize,
        data.length,
      );
      for (const item of data.slice(offset, end)) {
        if (item.type === "weather") {
          const weather = item.data;
          if ("geometry" in weather && weather.geometry) {
            weatherFeatures.push({
              id: item.id,
              kind:
                weatherSeverityRank(weather.severity) >= 3
                  ? "warning"
                  : "watch",
              geometry: weather.geometry,
            });
          }
        }
        if (item.type !== "aircraft" && item.type !== "ships") continue;
        const last = getTrail(item.id).at(-1);
        if (!last) continue;
        ids.push(item.id);
        const course =
          item.type === "ships"
            ? item.data.cog ?? item.data.heading ?? 0
            : item.data.heading ?? 0;
        values.push(
          last.lat,
          last.lon,
          course,
          item.data.speedMps ?? 0,
        );
        timestamps.push(last.ts);
      }
      offset = end;
      if (offset < data.length) {
        frame = requestAnimationFrame(scan);
        return;
      }
      finish();
    };

    frame = requestAnimationFrame(scan);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [data, dataVersion, host]);
}
