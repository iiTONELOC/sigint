import { getInterpolatedPosition } from "@/lib/trailService";
import type { DataPoint } from "@/features/base/dataPoints";
import type { CamState, CamTarget } from "./types";
import { clampFlatPan } from "./projection";

/**
 * Update camera state for one frame. Handles lock-on follow,
 * lerp toward target, auto-rotate, and velocity decay.
 * Mutates cam and camTarget in place.
 */
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
  // If locked onto a selected item, update target to follow it
  if (camTarget.lockedId && selected && selected.id === camTarget.lockedId) {
    const interp = getInterpolatedPosition(selected.id);
    const tLat = interp ? interp.lat : selected.lat;
    const tLon = interp ? interp.lon : selected.lon;

    if (isFlat) {
      const targetZoom = camTarget.zoom > 0 ? camTarget.zoom : cam.zoomFlat;
      const mW = viewportW * 0.92 * targetZoom;
      const mH = viewportH * 0.84 * targetZoom;
      camTarget.panX = -(tLon / 180) * (mW / 2);
      camTarget.panY = (tLat / 90) * (mH / 2);
      camTarget.active = true;
    } else {
      const phi = ((90 - tLat) * Math.PI) / 180;
      const theta = ((tLon + 180) * Math.PI) / 180;
      camTarget.rotY = Math.PI / 2 - theta;
      camTarget.rotX = -(phi - Math.PI / 2);
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

  // Auto-rotate (globe only, when idle)
  if (!isFlat && !drag.active && shouldRotate && !camTarget.active)
    cam.rotY += 0.002 * rotSpeed;

  // Velocity decay
  cam.rotY += cam.vy;
  cam.vy *= 0.95;
}
