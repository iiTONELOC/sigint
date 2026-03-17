import {
  getInterpolatedPosition,
  getTrail,
  type TrailPoint,
} from "@/lib/trailService";
import { matchesAircraftFilter } from "@/features/tracking/aircraft";
import type { AircraftFilter } from "@/features/tracking/aircraft";
import type { DataPoint } from "@/features/base/dataPoints";
import type { ThemeColors } from "@/config/theme";
import type { Projected, ProjFn, TrailHitTarget } from "./types";

// ── Quake age helpers ─────────────────────────────────────────────────

const HOUR_MS = 3_600_000;
const DAY_MS = 86_400_000;

function getQuakeAgeFactor(timestamp?: string): number {
  if (!timestamp) return 0.5;
  const age = Date.now() - new Date(timestamp).getTime();
  if (age < HOUR_MS) return 1.0;
  if (age < 6 * HOUR_MS) return 0.9;
  if (age < DAY_MS) return 0.8;
  if (age < 3 * DAY_MS) return 0.65;
  return 0.5;
}

function getQuakeColor(ageFactor: number, baseColor: string): string {
  if (ageFactor >= 0.9) return baseColor;
  if (ageFactor >= 0.8) return "#44dd33";
  if (ageFactor >= 0.65) return "#33aa33";
  return "#2d8835";
}

function getQuakeSize(magnitude: number): number {
  if (magnitude < 1) return 2;
  if (magnitude < 2) return 2.5;
  if (magnitude < 3) return 3.5;
  if (magnitude < 4) return 5;
  if (magnitude < 5) return 7;
  if (magnitude < 6) return 9.5;
  if (magnitude < 7) return 12;
  return 15;
}

// ── Event age helpers ────────────────────────────────────────────────

function getEventAgeFactor(timestamp?: string): number {
  if (!timestamp) return 0.5;
  const age = Date.now() - new Date(timestamp).getTime();
  if (age < HOUR_MS) return 1.0;
  if (age < 6 * HOUR_MS) return 0.9;
  if (age < DAY_MS) return 0.75;
  if (age < 3 * DAY_MS) return 0.6;
  return 0.45;
}

function getEventColor(ageFactor: number, baseColor: string): string {
  // Fade from base event color toward a muted version with age
  if (ageFactor >= 0.9) return baseColor;
  if (ageFactor >= 0.75) return "#bb3399";
  if (ageFactor >= 0.6) return "#993377";
  return "#772860";
}

function getEventSize(severity: number): number {
  // Severity 1-5 maps to dot size, similar scale to quake magnitudes
  if (severity <= 1) return 2.5;
  if (severity <= 2) return 3.5;
  if (severity <= 3) return 5;
  if (severity <= 4) return 7;
  return 9.5;
}

// ── Fire age helpers ─────────────────────────────────────────────────

function getFireAgeFactor(timestamp?: string): number {
  if (!timestamp) return 0.5;
  const age = Date.now() - new Date(timestamp).getTime();
  if (age < HOUR_MS) return 1.0;
  if (age < 3 * HOUR_MS) return 0.9;
  if (age < 6 * HOUR_MS) return 0.8;
  if (age < 12 * HOUR_MS) return 0.65;
  return 0.5;
}

function getFireColor(ageFactor: number, baseColor: string): string {
  if (ageFactor >= 0.9) return baseColor;
  if (ageFactor >= 0.8) return "#dd6622";
  if (ageFactor >= 0.65) return "#aa4420";
  return "#883318";
}

function getFireSize(frp: number): number {
  if (frp < 1) return 2;
  if (frp < 5) return 2.5;
  if (frp < 10) return 3.5;
  if (frp < 25) return 5;
  if (frp < 50) return 7;
  if (frp < 100) return 9.5;
  return 12;
}

// ── Main draw function ────────────────────────────────────────────────

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
    fires: colors.fires ?? "#ff6600",
  };

  // O(1) — selected is already the isolated item when isolateMode is active
  const isolatedType =
    isolatedId && selected && selected.id === isolatedId ? selected.type : null;

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
  // Skip sort in flat mode — projFlat always returns z=1
  if (pts.length > 1 && pts[0]!.z !== 1) {
    pts.sort((a, b) => a.z - b.z);
  }

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
    const baseColor = colorMap[item.type] ?? colors.accent;
    const depthAlpha = 0.4 + z * 0.6;
    const isSel = selected?.id === item.id;

    // ── Quake-specific rendering ──────────────────────────────────
    if (item.type === "quakes") {
      const mag = (item as any).data?.magnitude ?? 0;
      const ageFactor = getQuakeAgeFactor(item.timestamp);
      const quakeColor = getQuakeColor(ageFactor, baseColor);
      let s = getQuakeSize(mag);
      if (isSel) s *= 1.8;

      // Pulse glow — scales with magnitude, fades with age
      if (mag > 2.5) {
        const pulseIntensity = Math.min(1, (mag - 2.5) / 4.5);
        const pulse =
          1 +
          Math.sin(t + (parseInt(item.id.slice(1), 36) || 0) * 0.7) *
            (0.15 + pulseIntensity * 0.35);
        const gr = s * (3 + pulseIntensity * 2) * pulse;
        const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, quakeColor + "50");
        g.addColorStop(1, quakeColor + "00");
        ctx.fillStyle = g;
        ctx.globalAlpha = depthAlpha * ageFactor * 0.7;
        ctx.beginPath();
        ctx.arc(x, y, gr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core dot
      ctx.globalAlpha = depthAlpha * ageFactor;
      ctx.fillStyle = quakeColor;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();

      // Selection ring
      if (isSel) {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = quakeColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      return;
    }

    // ── Event-specific rendering (age + severity based) ───────────
    if (item.type === "events") {
      const severity = (item as any).data?.severity ?? 1;
      const ageFactor = getEventAgeFactor(item.timestamp);
      const eventColor = getEventColor(ageFactor, baseColor);
      let s = getEventSize(severity);
      if (isSel) s *= 1.8;

      // Pulse glow for high-severity events
      if (severity >= 3) {
        const pulseIntensity = Math.min(1, (severity - 2) / 3);
        const pulse =
          1 +
          Math.sin(t + (parseInt(item.id.slice(2), 36) || 0) * 0.5) *
            (0.15 + pulseIntensity * 0.3);
        const gr = s * (3 + pulseIntensity * 1.5) * pulse;
        const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, eventColor + "40");
        g.addColorStop(1, eventColor + "00");
        ctx.fillStyle = g;
        ctx.globalAlpha = depthAlpha * ageFactor * 0.6;
        ctx.beginPath();
        ctx.arc(x, y, gr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core dot
      ctx.globalAlpha = depthAlpha * ageFactor;
      ctx.fillStyle = eventColor;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();

      // Selection ring
      if (isSel) {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = eventColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      return;
    }

    // ── Fire rendering (FRP-scaled, age-based orange/red) ────────────
    if (item.type === "fires") {
      const frp = (item as any).data?.frp ?? 0;
      const ageFactor = getFireAgeFactor(item.timestamp);
      const fireColor = getFireColor(ageFactor, baseColor);
      let s = getFireSize(frp);
      if (isSel) s *= 1.8;

      // Pulse glow for high-FRP fires
      if (frp > 10) {
        const pulseIntensity = Math.min(1, (frp - 10) / 90);
        const pulse =
          1 +
          Math.sin(t + (parseInt(item.id.slice(2), 36) || 0) * 0.6) *
            (0.15 + pulseIntensity * 0.35);
        const gr = s * (3 + pulseIntensity * 2) * pulse;
        const g = ctx.createRadialGradient(x, y, 0, x, y, gr);
        g.addColorStop(0, fireColor + "50");
        g.addColorStop(1, fireColor + "00");
        ctx.fillStyle = g;
        ctx.globalAlpha = depthAlpha * ageFactor * 0.7;
        ctx.beginPath();
        ctx.arc(x, y, gr, 0, Math.PI * 2);
        ctx.fill();
      }

      // Core dot
      ctx.globalAlpha = depthAlpha * ageFactor;
      ctx.fillStyle = fireColor;
      ctx.beginPath();
      ctx.arc(x, y, s, 0, Math.PI * 2);
      ctx.fill();

      // Selection ring
      if (isSel) {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = fireColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      return;
    }

    // ── Ship rendering (heading-rotated diamond) ───────────────────
    if (item.type === "ships") {
      let s = 3.5;
      if (isSel) s *= 1.8;

      ctx.globalAlpha = depthAlpha;
      ctx.fillStyle = baseColor;

      const a = (((item as any).data?.heading || 0) * Math.PI) / 180;
      const hw = s * 0.7; // half-width
      ctx.beginPath();
      // Nose (forward)
      ctx.moveTo(x + Math.sin(a) * s * 1.4, y - Math.cos(a) * s * 1.4);
      // Starboard
      ctx.lineTo(
        x + Math.sin(a + Math.PI / 2) * hw,
        y - Math.cos(a + Math.PI / 2) * hw,
      );
      // Stern
      ctx.lineTo(
        x + Math.sin(a + Math.PI) * s * 0.8,
        y - Math.cos(a + Math.PI) * s * 0.8,
      );
      // Port
      ctx.lineTo(
        x + Math.sin(a - Math.PI / 2) * hw,
        y - Math.cos(a - Math.PI / 2) * hw,
      );
      ctx.closePath();
      ctx.fill();

      if (isSel) {
        ctx.globalAlpha = 0.85;
        ctx.strokeStyle = baseColor;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
        ctx.stroke();
      }

      ctx.globalAlpha = 1;
      return;
    }

    // ── Aircraft rendering (heading-rotated triangle) ────────────
    let s = 4;
    if (isSel) s *= 1.8;

    ctx.globalAlpha = depthAlpha;
    const status = (item as any).data?.squawkStatus;
    ctx.fillStyle =
      status === "emergency"
        ? "#ff3333"
        : status === "radio_failure"
          ? "#ff8800"
          : status === "hijack"
            ? "#cc44ff"
            : baseColor;

    const a = (((item as any).data?.heading || 0) * Math.PI) / 180;
    ctx.beginPath();
    ctx.moveTo(x + Math.sin(a) * s * 1.6, y - Math.cos(a) * s * 1.6);
    ctx.lineTo(x + Math.sin(a + 2.4) * s, y - Math.cos(a + 2.4) * s);
    ctx.lineTo(x + Math.sin(a - 2.4) * s, y - Math.cos(a - 2.4) * s);
    ctx.closePath();
    ctx.fill();

    if (isSel) {
      ctx.globalAlpha = 0.85;
      ctx.strokeStyle = baseColor;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, s * 2.5 + Math.sin(t * 2) * 2, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
  ctx.globalAlpha = 1;
}
