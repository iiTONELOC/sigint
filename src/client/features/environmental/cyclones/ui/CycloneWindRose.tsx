import type { WindRadii } from "../types";
import { windRadiiBandColor } from "../classification";
import { ktToMph } from "@/lib/format/units";

// Round quadrant plot of the 34/50/64-kt wind footprint. Each band is four
// per-quadrant wedges (ATCF order [NE, SE, SW, NW]) scaled to the largest
// radius across all bands, banded with SS colors. SVG scales by viewBox +
// w-full — no fixed px. Pairs with the numeric values beside it.

const VB = 150;
const C = VB / 2;
const R = VB / 2 - 16; // outer ring radius
const LABEL_R = R + 9; // compass labels sit just outside the ring
const QUADRANT_DEG = [0, 90, 180, 270]; // NE/SE/SW/NW start bearings (0=N cw)

/** Flat polar→cartesian; bearing 0° = N (up), clockwise. */
function pt(bearingDeg: number, radius: number): [number, number] {
  const a = ((bearingDeg - 90) * Math.PI) / 180;
  return [C + Math.cos(a) * radius, C + Math.sin(a) * radius];
}

/** Flat top-down 90° quadrant pie wedge of `nm` radius. */
function wedgePath(startDeg: number, nm: number, pxPerNm: number): string {
  if (nm <= 0) return "";
  const r = nm * pxPerNm;
  const [x0, y0] = pt(startDeg, r);
  const [x1, y1] = pt(startDeg + 90, r);
  return `M${C},${C} L${x0.toFixed(1)},${y0.toFixed(1)} A${r.toFixed(1)},${r.toFixed(1)} 0 0 1 ${x1.toFixed(1)},${y1.toFixed(1)} Z`;
}

const QUAD_LABEL = ["NE", "SE", "SW", "NW"] as const;

export function CycloneWindRose({ radii }: { readonly radii: WindRadii }) {
  const bands: ReadonlyArray<readonly [number, number[] | null]> = [
    [64, radii.kt64],
    [50, radii.kt50],
    [34, radii.kt34],
  ];
  const present = bands.filter(
    (b): b is readonly [number, number[]] => b[1] != null,
  );
  if (present.length === 0) return null;

  const maxNm = Math.max(...present.flatMap(([, q]) => q));
  // Largest petal sits just inside the outer ring.
  const pxPerNm = maxNm > 0 ? (R * 0.92) / maxNm : 0;

  const rotDeg = radii.lon;

  return (
    <div className="@container/rose bg-sig-panel border border-sig-border rounded-[12px] p-3 h-full flex items-center">
      <div className="flex flex-col @min-[18rem]/rose:flex-row items-center justify-center gap-4 w-full min-w-0">
      <svg
        viewBox={`0 0 ${VB} ${VB}`}
        className="w-28 aspect-square shrink-0"
        role="img"
        aria-label="Wind radii quadrant plot"
      >
        <circle cx={C} cy={C} r={R} className="fill-none stroke-sig-border" />
        <circle cx={C} cy={C} r={R * 0.6} className="fill-none stroke-sig-grid/50" />
        <circle cx={C} cy={C} r={R * 0.3} className="fill-none stroke-sig-grid/50" />
        <g transform={`rotate(${rotDeg.toFixed(2)} ${C} ${C})`}>
          <line x1={C} y1={C - R} x2={C} y2={C + R} className="stroke-sig-grid/40" />
          <line x1={C - R} y1={C} x2={C + R} y2={C} className="stroke-sig-grid/40" />
          {present
            .slice()
            .reverse()
            .map(([kt, q]) =>
              QUADRANT_DEG.map((start, i) => {
                const d = wedgePath(start, q[i] ?? 0, pxPerNm);
                if (!d) return null;
                return (
                  <path
                    key={`${kt}-${i}`}
                    d={d}
                    fill={windRadiiBandColor(kt)}
                    fillOpacity={0.18}
                    stroke={windRadiiBandColor(kt)}
                    strokeOpacity={0.95}
                    strokeWidth={1.75}
                    strokeLinejoin="round"
                  />
                );
              }),
            )}
          <text transform={`rotate(${(-rotDeg).toFixed(2)} ${C} ${C - LABEL_R})`} x={C} y={C - LABEL_R} textAnchor="middle" dominantBaseline="middle" className="fill-sig-dim font-mono" fontSize={12}>N</text>
          <text transform={`rotate(${(-rotDeg).toFixed(2)} ${C} ${C + LABEL_R})`} x={C} y={C + LABEL_R} textAnchor="middle" dominantBaseline="middle" className="fill-sig-dim font-mono" fontSize={12}>S</text>
          <text transform={`rotate(${(-rotDeg).toFixed(2)} ${C + LABEL_R} ${C})`} x={C + LABEL_R} y={C} textAnchor="middle" dominantBaseline="middle" className="fill-sig-dim font-mono" fontSize={12}>E</text>
          <text transform={`rotate(${(-rotDeg).toFixed(2)} ${C - LABEL_R} ${C})`} x={C - LABEL_R} y={C} textAnchor="middle" dominantBaseline="middle" className="fill-sig-dim font-mono" fontSize={12}>W</text>
        </g>
        <circle cx={C} cy={C} r={3} className="fill-sig-bright" />
      </svg>
      <div className="min-w-0 space-y-2">
        {present.map(([kt, q]) => (
          <div key={kt} className="min-w-0">
            <div className="flex items-center gap-2 text-(length:--sig-text-xs)">
              <span
                className="w-2.5 h-2.5 rounded-[3px] shrink-0"
                style={{ backgroundColor: windRadiiBandColor(kt) }}
              />
              <span className="text-sig-bright font-semibold">
                {kt}kt <span className="text-sig-dim font-normal">· {ktToMph(kt)}mph</span>
              </span>
            </div>
            <div className="flex items-center gap-2 text-(length:--sig-text-xs) text-sig-text font-mono">
              <span className="w-2.5 shrink-0" aria-hidden="true" />
              {q.join(" · ")} <span className="text-sig-dim">nm</span>
            </div>
          </div>
        ))}
        <div className="flex items-center gap-2 text-(length:--sig-text-xs) tracking-wider text-sig-dim">
          <span className="w-2.5 shrink-0" aria-hidden="true" />
          {QUAD_LABEL.join(" · ")}
        </div>
      </div>
      </div>
    </div>
  );
}
