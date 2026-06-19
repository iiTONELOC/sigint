import type { DataPoint } from "@/features/base/dataPoints";
import { useAssetsInCone } from "../hooks/useAssetsInCone";
import { useLandfallEta, landfallText } from "../hooks/useLandfallEta";
import { CycloneWindRadii } from "./CycloneWindRadii";

// Surfaces the high-value dossier-only data (landfall ETA + wind radii + assets
// in the cone) in the compact detail pane, so users who never open the dossier
// don't lose it.
export function CycloneDetailExtras({
  item,
}: {
  readonly item: DataPoint & { type: "cyclones" };
}) {
  const d = item.data;
  const assets = useAssetsInCone(d.officialCone, d.advisoryNumber);
  const hasAssets =
    !!assets && (assets.ships.length > 0 || assets.aircraft.length > 0);
  const landfall = useLandfallEta(d.forecast, item.lat, item.lon, d.advisoryNumber);
  const lf = landfall ? landfallText(landfall) : null;

  return (
    <>
      {lf && (
        <div className="mt-1.5 pt-1.5 border-t border-sig-border">
          <div
            className="text-sm font-semibold font-mono tracking-widest mb-1"
            style={{ color: "var(--dossier-accent)" }}
          >
            LANDFALL
          </div>
          <div
            className="font-mono text-xs text-sig-dim"
            style={lf.urgent ? { color: "var(--sigint-warn)" } : undefined}
          >
            {lf.text}
          </div>
        </div>
      )}
      {d.windRadii &&
        (d.windRadii.kt34 || d.windRadii.kt50 || d.windRadii.kt64) && (
          <div className="mt-1.5 pt-1.5 border-t border-sig-border">
            <div
              className="text-sm font-semibold font-mono tracking-widest mb-1"
              style={{ color: "var(--dossier-accent)" }}
            >
              WIND RADII (nm)
            </div>
            <CycloneWindRadii radii={d.windRadii} />
          </div>
        )}
      {hasAssets && (
        <div className="mt-1.5 pt-1.5 border-t border-sig-border">
          <div
            className="text-sm font-semibold font-mono tracking-widest mb-1"
            style={{ color: "var(--dossier-accent)" }}
          >
            ASSETS IN CONE
          </div>
          <div className="flex justify-between text-sig-bright text-xs">
            <span>SHIPS {assets.ships.length}</span>
            <span>AIRCRAFT {assets.aircraft.length}</span>
          </div>
        </div>
      )}
    </>
  );
}
