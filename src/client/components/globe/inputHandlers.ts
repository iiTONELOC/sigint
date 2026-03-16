import { getInterpolatedPosition, type TrailPoint } from "@/lib/trailService";
import { matchesAircraftFilter } from "@/features/tracking/aircraft";
import type { DataPoint } from "@/features/base/dataPoints";
import type {
  CamState,
  CamTarget,
  DragState,
  GlobeVisualizationProps,
  TrailHitTarget,
} from "./types";
import {
  getFlatMetrics,
  clampFlatPan,
  projGlobe,
  projFlat,
} from "./projection";

export type InputRefs = {
  canvas: HTMLCanvasElement;
  camRef: { current: CamState };
  camTargetRef: { current: CamTarget };
  dragRef: { current: DragState };
  sizeRef: { current: { w: number; h: number } };
  propsRef: {
    current: Readonly<GlobeVisualizationProps> & {
      onSelect: (item: DataPoint | null) => void;
    };
  };
  setTrailTooltip: (point: TrailPoint | null) => void;
};

export type InputHandlers = {
  onDown: (e: MouseEvent | TouchEvent) => void;
  onMove: (e: MouseEvent | TouchEvent) => void;
  onUp: () => void;
  onHover: (e: MouseEvent) => void;
  onWheel: (e: WheelEvent) => void;
  onTouchMove: (e: TouchEvent) => void;
  onContextMenu: () => void;
  onKeyDown: (e: KeyboardEvent) => void;
};

export function createInputHandlers(refs: InputRefs): InputHandlers {
  const {
    canvas,
    camRef,
    camTargetRef,
    dragRef,
    sizeRef,
    propsRef,
    setTrailTooltip,
  } = refs;
  const cam = camRef.current;
  const drag = dragRef.current;

  const onDown = (e: MouseEvent | TouchEvent) => {
    if ("button" in e && e.button === 1) {
      e.preventDefault();
      propsRef.current.onMiddleClick?.();
      return;
    }
    if ("button" in e && e.button !== 0) return;

    if ("touches" in e && e.touches.length === 2) {
      const t0 = e.touches[0]!,
        t1 = e.touches[1]!;
      drag.pinching = true;
      drag.pinchDist = Math.hypot(
        t1.clientX - t0.clientX,
        t1.clientY - t0.clientY,
      );
      drag.active = false;
      return;
    }

    const p = "touches" in e ? e.touches[0] : e;
    if (!p) return;
    const rect = canvas.getBoundingClientRect();
    const mx = p.clientX - rect.left;
    const my = p.clientY - rect.top;
    const { w: W, h: H } = sizeRef.current;
    const isFlat = propsRef.current.flat;
    let interactive = false;
    if (isFlat) {
      const {
        mW,
        mH,
        mx: ox,
        my: oy,
      } = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
      interactive = mx >= ox && mx <= ox + mW && my >= oy && my <= oy + mH;
    } else {
      const r = Math.min(W, H) * 0.4 * cam.zoomGlobe;
      interactive = Math.hypot(mx - W / 2, my - H / 2) <= r;
    }
    drag.active = true;
    drag.interactive = interactive;
    drag.dist = 0;
    drag.lx = p.clientX;
    drag.ly = p.clientY;
    drag.sx = p.clientX;
    drag.sy = p.clientY;
  };

  const onMove = (e: MouseEvent | TouchEvent) => {
    if ("touches" in e && e.touches.length === 2 && drag.pinching) {
      const t0 = e.touches[0]!,
        t1 = e.touches[1]!;
      const newDist = Math.hypot(
        t1.clientX - t0.clientX,
        t1.clientY - t0.clientY,
      );
      if (drag.pinchDist > 0) {
        const factor = newDist / drag.pinchDist;
        if (propsRef.current.flat) {
          cam.zoomFlat = Math.max(0.85, Math.min(80.0, cam.zoomFlat * factor));
          const { w: W, h: H } = sizeRef.current;
          clampFlatPan(cam, W, H);
        } else {
          cam.zoomGlobe = Math.max(
            0.55,
            Math.min(50.0, cam.zoomGlobe * factor),
          );
        }
      }
      drag.pinchDist = newDist;
      return;
    }

    if (!drag.active) return;
    if (!drag.interactive) return;
    canvas.style.cursor = "grabbing";
    const p = "touches" in e ? e.touches[0] : e;
    if (!p) return;
    const dx = p.clientX - drag.lx,
      dy = p.clientY - drag.ly;
    drag.dist += Math.abs(dx) + Math.abs(dy);

    if (drag.dist > 6) {
      camTargetRef.current.lockedId = null;
      camTargetRef.current.active = false;
    }

    if (!propsRef.current.flat) {
      const zf = cam.zoomGlobe || 1;
      cam.rotY += (dx * 0.005) / zf;
      cam.rotX += (dy * 0.005) / zf;
      cam.rotX = Math.max(-1.2, Math.min(1.2, cam.rotX));
      cam.vy = (dx * 0.001) / zf;
    } else {
      const { w: W, h: H } = sizeRef.current;
      cam.panX += dx;
      cam.panY += dy;
      clampFlatPan(cam, W, H);
    }
    drag.lx = p.clientX;
    drag.ly = p.clientY;
  };

  const onUp = () => {
    if (drag.pinching) {
      drag.pinching = false;
      drag.pinchDist = 0;
      return;
    }
    if (!drag.active) return;
    if (drag.dist < 6) {
      canvas.style.cursor = "default";

      if (!drag.interactive) {
        propsRef.current.onRawCanvasClick?.();
        drag.active = false;
        drag.interactive = false;
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const mx = drag.sx - rect.left,
        my = drag.sy - rect.top;
      const { w: W, h: H } = sizeRef.current;
      const cxc = W / 2,
        cyc = H / 2;
      const {
        data: d,
        layers: ly,
        aircraftFilter: af,
        flat: isFlat,
        onSelect: sel,
      } = propsRef.current;

      // Check trail waypoints
      const hitTargets: TrailHitTarget[] =
        (canvas as any).__trailHitTargets ?? [];
      let closestTrail: TrailHitTarget | null = null;
      let ctd = 12;
      for (const t of hitTargets) {
        const dd = Math.hypot(t.x - mx, t.y - my);
        if (dd < ctd) {
          ctd = dd;
          closestTrail = t;
        }
      }

      // Check data points
      let closest: DataPoint | null = null;
      let cd = 14;
      d.forEach((item) => {
        if (item.type === "aircraft") {
          if (!matchesAircraftFilter(item, af)) return;
        } else if (!ly[item.type]) return;

        let lat = item.lat;
        let lon = item.lon;
        if (item.type === "aircraft" || item.type === "ships") {
          const interp = getInterpolatedPosition(item.id);
          if (interp) {
            lat = interp.lat;
            lon = interp.lon;
          }
        }

        const flatMetrics = getFlatMetrics(
          W,
          H,
          camRef.current.zoomFlat,
          camRef.current.panX,
          camRef.current.panY,
        );
        const p = isFlat
          ? projFlat(
              lat,
              lon,
              flatMetrics.cx,
              flatMetrics.cy,
              flatMetrics.mW,
              flatMetrics.mH,
            )
          : projGlobe(
              lat,
              lon,
              cxc,
              cyc,
              Math.min(W, H) * 0.4 * camRef.current.zoomGlobe,
              camRef.current.rotY,
              camRef.current.rotX,
            );
        if (p.z <= 0) return;
        const dd = Math.hypot(p.x - mx, p.y - my);
        if (dd < cd) {
          cd = dd;
          closest = item;
        }
      });

      // ── Click / double-click detection ────────────────────────────
      // Single click: select + lock camera (scroll stays centered)
      // Double click on already-selected: zoom in
      // The second click doesn't need to hit the same point — the camera
      // may have shifted it. If we're within the time window and have a
      // lastClickId, any click counts as a double-click on that item.
      const now = Date.now();
      const timeSinceLast = now - drag.lastClickTime;
      const isDoubleClick = timeSinceLast < 500 && drag.lastClickId !== null;

      if (isDoubleClick) {
        // Double-click: zoom in to the already-selected point
        setTrailTooltip(null);
        const selected = propsRef.current.selected;
        if (selected && selected.id === drag.lastClickId) {
          const camTarget = camTargetRef.current;
          //@ts-ignore
          const interp = getInterpolatedPosition(selected.id);
          //@ts-ignore
          const tLat = interp ? interp.lat : selected.lat;
          //@ts-ignore
          const tLon = interp ? interp.lon : selected.lon;

          if (isFlat) {
            const { w: fw, h: fh } = sizeRef.current;
            const targetZoom = Math.max(camRef.current.zoomFlat, 40);
            const mW = fw * 0.92 * targetZoom;
            const mH = fh * 0.84 * targetZoom;
            camTarget.panX = -(tLon / 180) * (mW / 2);
            camTarget.panY = (tLat / 90) * (mH / 2);
            camTarget.zoom = targetZoom;
          } else {
            const phi = ((90 - tLat) * Math.PI) / 180;
            const theta = ((tLon + 180) * Math.PI) / 180;
            camTarget.rotY = Math.PI / 2 - theta;
            camTarget.rotX = -(phi - Math.PI / 2);
            camTarget.zoom = Math.max(camRef.current.zoomGlobe, 35);
          }
          camTarget.active = true;
          //@ts-ignore
          camTarget.lockedId = selected.id;
        }

        // Reset so next click starts fresh
        drag.lastClickTime = 0;
        drag.lastClickId = null;
      } else if (closest && !closestTrail) {
        // Single click on data point
        const hit: DataPoint = closest;
        setTrailTooltip(null);
        sel(hit);

        // Lock camera — scroll-to-zoom stays centered on this point
        //@ts-ignore
        camTargetRef.current.lockedId = hit.id;

        // Record for potential double-click
        drag.lastClickTime = now;
        //@ts-ignore
        drag.lastClickId = hit.id;
      } else if (closestTrail) {
        // Single click on trail waypoint — show tooltip
        setTrailTooltip(closestTrail.point);
        drag.lastClickTime = 0;
        drag.lastClickId = null;
      } else {
        setTrailTooltip(null);
        drag.lastClickTime = 0;
        drag.lastClickId = null;
      }
    }
    drag.active = false;
    drag.interactive = false;
    canvas.style.cursor = "default";
  };

  const onHover = (e: MouseEvent) => {
    if (drag.active) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const { w: W, h: H } = sizeRef.current;
    const isFlat = propsRef.current.flat;
    let insideGlobe = false;
    if (isFlat) {
      const {
        mW,
        mH,
        mx: ox,
        my: oy,
      } = getFlatMetrics(
        W,
        H,
        camRef.current.zoomFlat,
        camRef.current.panX,
        camRef.current.panY,
      );
      insideGlobe = mx >= ox && mx <= ox + mW && my >= oy && my <= oy + mH;
    } else {
      insideGlobe =
        Math.hypot(mx - W / 2, my - H / 2) <=
        Math.min(W, H) * 0.4 * camRef.current.zoomGlobe;
    }
    if (!insideGlobe) {
      canvas.style.cursor = "default";
      return;
    }

    // Check trail waypoints first
    const trailTargets: Array<{ x: number; y: number }> =
      (canvas as any).__trailHitTargets ?? [];
    for (const t of trailTargets) {
      if (Math.hypot(t.x - mx, t.y - my) < 12) {
        canvas.style.cursor = "pointer";
        return;
      }
    }

    const { data: d, layers: ly, aircraftFilter: af } = propsRef.current;
    let hit = false;
    d.forEach((item) => {
      if (hit) return;
      if (item.type === "aircraft") {
        if (!matchesAircraftFilter(item, af)) return;
      } else if (!ly[item.type]) return;

      let lat = item.lat;
      let lon = item.lon;
      if (item.type === "aircraft" || item.type === "ships") {
        const interp = getInterpolatedPosition(item.id);
        if (interp) {
          lat = interp.lat;
          lon = interp.lon;
        }
      }

      const flatMetrics = getFlatMetrics(
        W,
        H,
        camRef.current.zoomFlat,
        camRef.current.panX,
        camRef.current.panY,
      );
      const p = isFlat
        ? projFlat(
            lat,
            lon,
            flatMetrics.cx,
            flatMetrics.cy,
            flatMetrics.mW,
            flatMetrics.mH,
          )
        : projGlobe(
            lat,
            lon,
            W / 2,
            H / 2,
            Math.min(W, H) * 0.4 * camRef.current.zoomGlobe,
            camRef.current.rotY,
            camRef.current.rotX,
          );
      if (p.z <= 0) return;
      if (Math.hypot(p.x - mx, p.y - my) < 14) hit = true;
    });
    canvas.style.cursor = hit ? "pointer" : "grab";
  };

  const onWheel = (e: WheelEvent) => {
    e.preventDefault();
    const camState = camRef.current;
    const camTarget = camTargetRef.current;
    const factor = Math.exp(-e.deltaY * 0.0015);

    if (camTarget.lockedId) {
      if (propsRef.current.flat) {
        camTarget.zoom = Math.max(
          0.85,
          Math.min(80.0, camTarget.zoom * factor),
        );
      } else {
        camTarget.zoom = Math.max(
          0.55,
          Math.min(50.0, camTarget.zoom * factor),
        );
      }
      camTarget.active = true;
    } else if (propsRef.current.flat) {
      const { w: W, h: H } = sizeRef.current;
      const rect = canvas.getBoundingClientRect();
      const mx = e.clientX - rect.left - W / 2;
      const my = e.clientY - rect.top - H / 2;
      const oldZoom = camState.zoomFlat;
      camState.zoomFlat = Math.max(0.85, Math.min(80.0, oldZoom * factor));
      const actualFactor = camState.zoomFlat / oldZoom;
      camState.panX = mx - actualFactor * (mx - camState.panX);
      camState.panY = my - actualFactor * (my - camState.panY);
      clampFlatPan(camState, W, H);
    } else {
      camState.zoomGlobe = Math.max(
        0.55,
        Math.min(50.0, camState.zoomGlobe * factor),
      );
    }
  };

  const onTouchMove = (e: TouchEvent) => {
    if (e.touches.length >= 2 || drag.active) e.preventDefault();
    (onMove as (e: TouchEvent) => void)(e);
  };

  const onContextMenu = () => {
    drag.active = false;
    drag.interactive = false;
    canvas.style.cursor = "default";
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const tag = (e.target as HTMLElement)?.tagName;
    if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return;

    const cam = camRef.current;
    switch (e.code) {
      case "Space":
        e.preventDefault();
        propsRef.current.onMiddleClick?.();
        break;
      case "ArrowLeft":
        e.preventDefault();
        cam.rotY -= 0.05;
        break;
      case "ArrowRight":
        e.preventDefault();
        cam.rotY += 0.05;
        break;
      case "ArrowUp":
        e.preventDefault();
        cam.rotX = Math.max(-1.2, cam.rotX - 0.05);
        break;
      case "ArrowDown":
        e.preventDefault();
        cam.rotX = Math.min(1.2, cam.rotX + 0.05);
        break;
      case "Equal":
      case "NumpadAdd":
        e.preventDefault();
        if (propsRef.current.flat) {
          cam.zoomFlat = Math.min(80.0, cam.zoomFlat * 1.1);
          const { w: W, h: H } = sizeRef.current;
          clampFlatPan(cam, W, H);
        } else {
          cam.zoomGlobe = Math.min(50.0, cam.zoomGlobe * 1.1);
        }
        break;
      case "Minus":
      case "NumpadSubtract":
        e.preventDefault();
        if (propsRef.current.flat) {
          cam.zoomFlat = Math.max(0.85, cam.zoomFlat / 1.1);
          const { w: W, h: H } = sizeRef.current;
          clampFlatPan(cam, W, H);
        } else {
          cam.zoomGlobe = Math.max(0.55, cam.zoomGlobe / 1.1);
        }
        break;
    }
  };

  return {
    onDown,
    onMove,
    onUp,
    onHover,
    onWheel,
    onTouchMove,
    onContextMenu,
    onKeyDown,
  };
}

export function attachInputHandlers(
  canvas: HTMLCanvasElement,
  handlers: InputHandlers,
) {
  canvas.addEventListener("mousedown", handlers.onDown);
  window.addEventListener("mousemove", handlers.onMove);
  window.addEventListener("mouseup", handlers.onUp);
  canvas.addEventListener("mousemove", handlers.onHover);
  canvas.addEventListener("wheel", handlers.onWheel, { passive: false });
  canvas.addEventListener("touchstart", handlers.onDown, { passive: false });
  canvas.addEventListener("touchmove", handlers.onTouchMove, {
    passive: false,
  });
  canvas.addEventListener("touchend", handlers.onUp);
  canvas.addEventListener("contextmenu", handlers.onContextMenu);
  window.addEventListener("keydown", handlers.onKeyDown);
}

export function detachInputHandlers(
  canvas: HTMLCanvasElement,
  handlers: InputHandlers,
) {
  canvas.removeEventListener("mousedown", handlers.onDown);
  window.removeEventListener("mousemove", handlers.onMove);
  window.removeEventListener("mouseup", handlers.onUp);
  canvas.removeEventListener("mousemove", handlers.onHover);
  canvas.removeEventListener("wheel", handlers.onWheel);
  canvas.removeEventListener("touchstart", handlers.onDown);
  canvas.removeEventListener("touchmove", handlers.onTouchMove);
  canvas.removeEventListener("touchend", handlers.onUp);
  canvas.removeEventListener("contextmenu", handlers.onContextMenu);
  window.removeEventListener("keydown", handlers.onKeyDown);
}
