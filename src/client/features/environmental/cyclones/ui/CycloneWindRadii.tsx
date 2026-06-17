import type { WindRadii } from "../types";
import { formatKtMph } from "@/lib/units";

// One band's per-quadrant radii (ATCF order [NE, SE, SW, NW]) laid out as a
// compass 2×2 so it reads spatially and never clips in a narrow panel. The
// threshold drives the label, formatted through the user's unit preference.
function Band({ kt, q }: { readonly kt: number; readonly q: number[] }) {
  return (
    <div>
      <div className="text-sig-accent text-xs mb-0.5">
        {formatKtMph(kt)}
      </div>
      <div className="grid grid-cols-2 gap-x-3 font-mono text-sig-bright text-xs">
        <span>NW {q[3]}</span>
        <span className="text-right">NE {q[0]}</span>
        <span>SW {q[2]}</span>
        <span className="text-right">SE {q[1]}</span>
      </div>
    </div>
  );
}

/** Shared wind-radii readout (dossier + detail pane). Renders only the bands
 *  NHC reported; the caller supplies the section chrome. The three ATCF wind
 *  thresholds are the WindRadii schema itself (kt34/kt50/kt64). */
export function CycloneWindRadii({ radii }: { readonly radii: WindRadii }) {
  const bands: ReadonlyArray<readonly [number, number[] | null]> = [
    [34, radii.kt34],
    [50, radii.kt50],
    [64, radii.kt64],
  ];
  const present = bands.filter(
    (b): b is readonly [number, number[]] => b[1] != null,
  );
  if (present.length === 0) return null;
  return (
    <div className="space-y-1.5">
      {present.map(([kt, q]) => (
        <Band key={kt} kt={kt} q={q} />
      ))}
    </div>
  );
}
