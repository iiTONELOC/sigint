import type { Projected, CamState } from "./types";

export function getFlatMetrics(
  W: number,
  H: number,
  zoom: number,
  panX: number = 0,
  panY: number = 0,
) {
  const mW = W * 0.92 * zoom;
  const mH = H * 0.84 * zoom;
  const mx = (W - mW) / 2 + panX;
  const my = (H - mH) / 2 + panY;
  const cx = W / 2 + panX;
  const cy = H / 2 + panY;
  return { mW, mH, mx, my, cx, cy };
}

export function clampFlatPan(
  cam: { zoomFlat: number; panX: number; panY: number },
  W: number,
  H: number,
) {
  const mW = W * 0.92 * cam.zoomFlat;
  const mH = H * 0.84 * cam.zoomFlat;
  const maxX = Math.max(0, (mW - W) / 2);
  const maxY = Math.max(0, (mH - H) / 2);
  cam.panX = Math.max(-maxX, Math.min(maxX, cam.panX));
  cam.panY = Math.max(-maxY, Math.min(maxY, cam.panY));
}

export function projGlobe(
  lat: number,
  lon: number,
  cx: number,
  cy: number,
  r: number,
  ry: number,
  rx: number,
): Projected {
  const phi = ((90 - lat) * Math.PI) / 180;
  const theta = ((lon + 180) * Math.PI) / 180 + ry;
  const x = -Math.sin(phi) * Math.cos(theta);
  const y = Math.cos(phi);
  const z = Math.sin(phi) * Math.sin(theta);
  const cX = Math.cos(rx),
    sX = Math.sin(rx);
  const y2 = y * cX - z * sX;
  const z2 = y * sX + z * cX;
  return { x: cx + x * r, y: cy - y2 * r, z: z2 };
}

export function projFlat(
  lat: number,
  lon: number,
  cx: number,
  cy: number,
  w: number,
  h: number,
): Projected {
  return { x: cx + (lon / 180) * (w / 2), y: cy - (lat / 90) * (h / 2), z: 1 };
}
