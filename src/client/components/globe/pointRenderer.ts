import {
  getInterpolatedPosition,
  getTrail,
  type TrailPoint,
} from "@/lib/trailService";
import { matchesAircraftFilter } from "@/features/aircraft";
import type { AircraftFilter } from "@/features/aircraft";
import type { DataPoint } from "@/features/base/dataPoints";
import type { ThemeColors } from "@/config/theme";
import type { Projected, ProjFn, TrailHitTarget } from "./types";

export function drawPoints(
  ctx: CanvasRenderingContext2D,
  data: DataPoint[],
  layers: Record<string, boolean>,
  aircraftFilter: AircraftFilter,
  selected: DataPoint | null,
  isolatedId: string | null,
  isolateMode: null | "solo" | "focus",
  projFn: ProjFn,
  t: number,
  colors: ThemeColors,
  searchMatchIds: Set<string> | null | undefined,
) {
  const colorMap: Record<string, string> = {
    ships: colors.ships,
    aircraft: colors.aircraft,
    events: colors.events,
    quakes: colors.quakes,
  };

  const isolatedItem = isolatedId
    ? data.find((d) => d.id === isolatedId)
    : null;
  const isolatedType = isolatedItem?.type ?? null;

  const pts: Array<Projected & { item: DataPoint }> = [];
  data.forEach((item) => {
    if (searchMatchIds && !searchMatchIds.has(item.id)) return;

    if (isolateMode === "solo") {
      if (item.id !== isolatedId) return;
    } else if (isolateMode === "focus") {
      if (isolatedType && item.type !== isolatedType) return;
    }

    if (item.type === "aircraft") {
      if (!matchesAircraftFilter(item, aircraftFilter)) return;
    } else {
      if (layers[item.type] === false) return;
    }

    let lat = item.lat;
    let lon = item.lon;
    if (item.type === "aircraft" || item.type === "ships") {
      const interp = getInterpolatedPosition(item.id);
      if (interp) {
        lat = interp.lat;
        lon = interp.lon;
      }
    }

    const p = projFn(lat, lon);
    if (p.z > 0) pts.push({ ...p, item });
  });
  pts.sort((a, b) => a.z - b.z);

  // ── Draw trail for selected item (behind points) ─────────────────
  if (selected) {
    const trail = getTrail(selected.id);
    if (trail.length >= 1) {
      const trailCoords = trail.map((tp) => ({
        lat: tp.lat,
        lon: tp.lon,
        point: tp,
      }));
      const interp = getInterpolatedPosition(selected.id);
      if (interp) {
        trailCoords.push({
          lat: interp.lat,
          lon: interp.lon,
          point: { lat: interp.lat, lon: interp.lon, ts: Date.now() },
        });
      }

      if (trailCoords.length >= 2) {
        const projectedTrail = trailCoords
          .map((tp) => ({ ...projFn(tp.lat, tp.lon), point: tp.point }))
          .filter((p) => p.z > 0);

        if (projectedTrail.length >= 2) {
          ctx.save();
          ctx.lineJoin = "round";
          ctx.lineCap = "round";

          // Glow pass
          ctx.lineWidth = 6;
          for (let i = 1; i < projectedTrail.length; i++) {
            const prev = projectedTrail[i - 1]!;
            const curr = projectedTrail[i]!;
            const age = i / projectedTrail.length;
            ctx.globalAlpha = 0.05 + age * 0.15;
            ctx.strokeStyle = colors.accent;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
          }

          // Main line
          ctx.lineWidth = 2.5;
          for (let i = 1; i < projectedTrail.length; i++) {
            const prev = projectedTrail[i - 1]!;
            const curr = projectedTrail[i]!;
            const age = i / projectedTrail.length;
            ctx.globalAlpha = 0.3 + age * 0.7;
            ctx.strokeStyle = colors.accent;
            ctx.beginPath();
            ctx.moveTo(prev.x, prev.y);
            ctx.lineTo(curr.x, curr.y);
            ctx.stroke();
          }

          // Dots at each recorded waypoint (excluding interpolated last point)
          const hitTargets: TrailHitTarget[] = [];
          for (let i = 0; i < projectedTrail.length - 1; i++) {
            const p = projectedTrail[i]!;
            const age = i / projectedTrail.length;
            ctx.globalAlpha = 0.4 + age * 0.6;
            ctx.fillStyle = "#ffffff";
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
            ctx.fill();
            hitTargets.push({ x: p.x, y: p.y, point: p.point });
          }
          (ctx.canvas as any).__trailHitTargets = hitTargets;

          ctx.restore();
        }
      } else {
        (ctx.canvas as any).__trailHitTargets = [];
      }
    } else {
      (ctx.canvas as any).__trailHitTargets = [];
    }
  } else {
    (ctx.canvas as any).__trailHitTargets = [];
  }
  ctx.globalAlpha = 1;

  pts.forEach(({ x, y, z, item }) => {
    const color = colorMap[item.type] ?? colors.accent;
    const alpha = 0.4 + z * 0.6;
    let s =
      item.type === "quakes"
        ? 2.5 + parseFloat((item as any).data?.magnitude || "0") * 1.1
        : item.type === "events"
          ? 3.5 + ((item as any).data?.severity || 0) * 0.8
          : item.type === "aircraft"
            ? 4
            : 3;
    const isSel = selected?.id === item.id;
    if (isSel) s *= 1.8;

    if (
      item.type === "events" ||
      (item.type === "quakes" &&
        parseFloat((item as any).data?.magnitude || "0") > 3)
    ) {
      const pulse =
        1 + Math.sin(t + (parseInt(item.id.slice(1)) || 0) * 0.7) * 0.35;
      const gr = s * 4 * pulse;
      const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
      g.addColorStop(0, color + "40");
      g.addColorStop(1, color + "00");
      ctx.fillStyle = g;
      ctx.globalAlpha = alpha * 0.6;
      ctx.beginPath();
      ctx.arc(x, y, gr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.globalAlpha = alpha;
    if (item.type === "aircraft") {
      const status = (item as any).data?.squawkStatus;
      ctx.fillStyle =
        status === "emergency"
          ? "#ff3333"
          : status === "radio_failure"
            ? "#ff8800"
            : status === "hijack"
              ? "#cc44ff"
              : color;
    } else {
      ctx.fillStyle = color;
    }
    if (item.type === "aircraft") {
      const a = (((item as any).data?.heading || 0) * Math.PI) / 180;
      ctx.beginPath();
      ctx.moveTo(x + Math.sin(a) * s * 1.6, y - Math.cos(a) * s * 1.6);
      ctx.lineTo(x + Math.sin(a + 2.4) * s, y - Math.cos(a + 2.4) * s);
      ctx.lineTo(x + Math.sin(a - 2.4) * s, y - Math.cos(a - 2.4) * s);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();
    }

    if (isSel) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
}
