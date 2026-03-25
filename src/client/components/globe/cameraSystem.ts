import { getInterpolatedPosition } from "@/lib/trailService";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CamState, CamTarget } from "./types";
import { clampFlatPan } from "./projection";

/**
 * Update camera state for one frame. Handles lock-on follow,
 * lerp toward target, auto-rotate, and velocity decay.
 * Mutates cam and camTarget in place.
 */

// Track whether we released the lock due to rotation being re-enabled.
// This prevents re-releasing a NEW lock set by a click before React
// has had a chance to flip shouldRotate back to false.
let _rotationReleasedLock = false;

export function updateCamera(
  cam: CamState,
  camTarget: CamTarget,
  drag: { active: boolean },
  selected: DataPoint | null,
  isFlat: boolean,
  shouldRotate: boolean,
  rotSpeed: number,
  viewportW: number,
  viewportH: number,
) {
  // When rotation is turned off (by selecting a point or clicking ROT again),
  // reset the released flag so the next ROT click can release again.
  if (!shouldRotate) {
    _rotationReleasedLock = false;
  }

  // If user re-enabled rotation while locked on, release the lock ONCE.
  // The flag prevents re-releasing a new lock set by a subsequent click
  // during the 1-frame gap before React flips shouldRotate to false.
  if (shouldRotate && !isFlat && camTarget.lockedId && !_rotationReleasedLock) {
    camTarget.lockedId = null;
    camTarget.active = false;
    _rotationReleasedLock = true;
  }

  // If locked onto a selected item, update target to follow it
  if (camTarget.lockedId && selected && selected.id === camTarget.lockedId) {
    const interp = getInterpolatedPosition(selected.id);
    const tLat = interp ? interp.lat : selected.lat;
    const tLon = interp ? interp.lon : selected.lon;

    // On mobile, the bottom sheet covers ~38% of viewport height.
    // Shift the target point UP so it lands in the center of the visible
    // area above the sheet (~19% of viewport height above center).
    const isMobile = viewportW < 768;

    if (isFlat) {
      const targetZoom = camTarget.zoom > 0 ? camTarget.zoom : cam.zoomFlat;
      const mW = viewportW * 0.92 * targetZoom;
      const mH = viewportH * 0.84 * targetZoom;
      camTarget.panX = -(tLon / 180) * (mW / 2);
      const basePanY = (tLat / 90) * (mH / 2);
      // panY is screen-space offset — shift up by 19% of viewport height
      camTarget.panY = isMobile ? basePanY - viewportH * 0.23 : basePanY;
      camTarget.active = true;
    } else {
      const phi = ((90 - tLat) * Math.PI) / 180;
      const theta = ((tLon + 180) * Math.PI) / 180;
      camTarget.rotY = Math.PI / 2 - theta;
      const baseRotX = -(phi - Math.PI / 2);
      if (isMobile) {
        // Negative rotX shifts points UP on screen (projection: y = cy - y2*r)
        const currentZoom = camTarget.zoom > 0 ? camTarget.zoom : cam.zoomGlobe;
        const r = Math.min(viewportW, viewportH) * 0.4 * currentZoom;
        const pxShift = viewportH * 0.19;
        camTarget.rotX = baseRotX - Math.asin(Math.min(0.95, pxShift / r));
      } else {
        camTarget.rotX = baseRotX;
      }
      camTarget.active = true;
    }
  }

  // Clear lock if selection changed
  if (camTarget.lockedId && (!selected || selected.id !== camTarget.lockedId)) {
    camTarget.lockedId = null;
    camTarget.active = false;
  }

  // Lerp camera toward target
  if (camTarget.active) {
    const lerpSpeed = 0.08;
    if (isFlat) {
      cam.panX += (camTarget.panX - cam.panX) * lerpSpeed;
      cam.panY += (camTarget.panY - cam.panY) * lerpSpeed;
      cam.zoomFlat += (camTarget.zoom - cam.zoomFlat) * lerpSpeed;
      clampFlatPan(cam, viewportW, viewportH);
    } else {
      // Shortest-path rotation: normalize rotY difference to [-π, π]
      let dRotY = camTarget.rotY - cam.rotY;
      const TWO_PI = Math.PI * 2;
      dRotY = ((((dRotY + Math.PI) % TWO_PI) + TWO_PI) % TWO_PI) - Math.PI;
      cam.rotY += dRotY * lerpSpeed;

      cam.rotX += (camTarget.rotX - cam.rotX) * lerpSpeed;
      cam.zoomGlobe += (camTarget.zoom - cam.zoomGlobe) * lerpSpeed;
      cam.vy = 0;
    }

    // Stop animating once close enough (unless locked on)
    if (!camTarget.lockedId) {
      const dZoom = Math.abs(
        isFlat ? cam.zoomFlat - camTarget.zoom : cam.zoomGlobe - camTarget.zoom,
      );
      const dRot = isFlat
        ? Math.abs(cam.panX - camTarget.panX) +
          Math.abs(cam.panY - camTarget.panY)
        : Math.abs(cam.rotY - camTarget.rotY) +
          Math.abs(cam.rotX - camTarget.rotX);
      if (dZoom < 0.01 && dRot < 0.001) {
        camTarget.active = false;
      }
    }
  }

  // Auto-rotate (globe only, not dragging)
  if (!isFlat && !drag.active && shouldRotate) cam.rotY += 0.002 * rotSpeed;

  // Velocity decay
  cam.rotY += cam.vy;
  cam.vy *= 0.95;

  // Keep rotY in [0, 2π] — prevents floating point precision loss
  // in sin/cos at large values, which causes land polygon jitter
  var TWO_PI_WRAP = Math.PI * 2;
  cam.rotY = ((cam.rotY % TWO_PI_WRAP) + TWO_PI_WRAP) % TWO_PI_WRAP;
}
