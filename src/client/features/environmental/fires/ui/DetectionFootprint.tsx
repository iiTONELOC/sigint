import { formatPixelKm } from "@/lib/format/units";

// VIIRS aggregates 3→2→1 native pixels from nadir to swath edge, so scan/track
// grow off-nadir and localization gets coarser. Nominal nadir cell is 375 m.
const NOMINAL_KM = 0.375;
const PX_PER_KM = 90;
const MAX_BOX_PX = 76;

function box(km: number): number {
  return Math.min(MAX_BOX_PX, Math.max(8, km * PX_PER_KM));
}

function swathVerdict(scan: number): { zone: string; note: string } {
  if (scan < 0.45) return { zone: "near-nadir", note: "sharp fix" };
  if (scan < 0.62) return { zone: "mid-scan", note: "moderate" };
  return { zone: "swath edge", note: "coarse localization" };
}

export function DetectionFootprint({
  scan,
  track,
}: {
  readonly scan: number;
  readonly track: number;
}) {
  const w = box(scan);
  const h = box(track);
  const ref = NOMINAL_KM * PX_PER_KM;
  const verdict = swathVerdict(scan);

  return (
    <div className="flex items-center gap-4">
      <div
        className="relative shrink-0 flex items-center justify-center"
        style={{ width: MAX_BOX_PX, height: MAX_BOX_PX }}
      >
        <div
          className="absolute border border-dashed border-sig-dim/60 rounded-[2px]"
          style={{ width: ref, height: ref }}
        />
        <div
          className="absolute border-2 border-(--dossier-accent) bg-(--dossier-accent)/15 rounded-[2px]"
          style={{ width: w, height: h }}
        />
      </div>
      <div className="min-w-0 flex flex-col gap-1">
        <div className="font-mono text-(length:--sig-text-md) text-sig-bright">
          {formatPixelKm(scan, track)}
        </div>
        <div className="text-(length:--sig-text-xs) text-sig-dim">
          dashed = nominal 375 m at nadir
        </div>
        <div className="text-(length:--sig-text-xs)">
          <span className="text-sig-bright tracking-wide">{verdict.zone}</span>
          <span className="text-sig-dim"> · {verdict.note}</span>
        </div>
      </div>
    </div>
  );
}
