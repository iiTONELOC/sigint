import {
  getInterpolatedPosition,
  getTrail,
  getTrailsRev,
  type TrailPoint,
} from "@/lib/trailService";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import type {
  GlobeVisualizationProps,
  CamState,
  CamTarget,
  DragState,
  ProjFn,
} from "./types";
import { getFlatMetrics, projGlobe, projFlat } from "./projection";
import { updateCamera } from "./cameraSystem";
import {
  createInputHandlers,
  attachInputHandlers,
  detachInputHandlers,
} from "./inputHandlers";
import { getSelectedRoute } from "@/lib/layoutSignals";
import type { DataPoint } from "@/features/base/dataPoints";

// ── Shared render worker (survives globe remounts) ──────────────────
// The PaneManager re-parents the globe leaf when a pane (e.g. the dossier)
// splits in, which unmounts + remounts this component. Terminating the worker
// on every remount meant re-fetching land, re-sending all data, and a blank
// first frame = a visible flash. Instead the worker lives at module scope and
// is reused: it keeps its land polygons, `_data`, and trail state across the
// remount, so the new canvas gets a painted frame almost immediately. The new
// mount transfers a fresh OffscreenCanvas to it (a transferred canvas is
// one-shot per element), and the worker re-points at it via a new "init".
let sharedWorker: Worker | null = null;
function getSharedWorker(): Worker {
  sharedWorker ??= new Worker("/workers/pointWorker.js");
  return sharedWorker;
}

// High-count types ship only the fields the worker draws/filters with — the
// full enriched blob (acType, registration, route, …) would balloon the clone.
const SLIM_TYPES = new Set(["aircraft", "ships", "quakes", "fires", "events"]);
function slimPoint(item: DataPoint) {
  const dd = (item as any).data;
  return {
    id: item.id,
    type: item.type,
    lat: item.lat,
    lon: item.lon,
    timestamp: item.timestamp,
    data:
      SLIM_TYPES.has(item.type) && dd
        ? {
            military: dd.military,
            recon: dd.recon,
            squawkStatus: dd.squawkStatus,
            squawk: dd.squawk,
            onGround: dd.onGround,
            originCountry: dd.originCountry,
            heading: dd.heading,
            magnitude: dd.magnitude,
            severity: dd.severity,
            frp: dd.frp,
          }
        : dd,
  };
}

export function GlobeVisualization({
  flat = false,
  autoRotate = true,
  rotationSpeed = 1,
  data,
  layers,
  aircraftFilter,
  cycloneFilter,
  selected,
  isolatedId,
  isolateMode,
  onSelect,
  onRawCanvasClick,
  onMiddleClick,
  onSelectedSide,
  zoomToId,
  revealId,
  searchMatchIds,
  spatialGrid,
  filteredIds,
  cycloneWarnings,
}: Readonly<GlobeVisualizationProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<CamState>({
    rotY: 0,
    rotX: 0.3,
    vy: 0,
    zoomGlobe: 1,
    zoomFlat: 1,
    panX: 0,
    panY: 0,
  });
  const camTargetRef = useRef<CamTarget>({
    rotY: 0,
    rotX: 0,
    zoom: 1,
    panX: 0,
    panY: 0,
    active: false,
    lockedId: null,
  });
  const dragRef = useRef<DragState>({
    active: false,
    interactive: false,
    lx: 0,
    ly: 0,
    dist: 0,
    sx: 0,
    sy: 0,
    pinching: false,
    pinchDist: 0,
    lastClickTime: 0,
    lastClickId: null,
  });
  const sizeRef = useRef({ w: 800, h: 600 });
  const pendingResizeRef = useRef<{
    cw: number;
    ch: number;
    dpr: number;
  } | null>(null);
  const [trailTooltip, setTrailTooltip] = useState<TrailPoint | null>(null);
  const trailTooltipPointRef = useRef<TrailPoint | null>(null);
  const trailTooltipElRef = useRef<HTMLDivElement>(null);
  const lastSideRef = useRef<"left" | "right">("right");
  const propsRef = useRef({
    data,
    layers,
    aircraftFilter,
    cycloneFilter,
    flat,
    autoRotate,
    rotationSpeed,
    selected,
    isolatedId,
    isolateMode,
    onSelect,
    onRawCanvasClick,
    onMiddleClick,
    onSelectedSide,
    zoomToId,
    searchMatchIds,
    spatialGrid,
    filteredIds,
    cycloneWarnings,
  });
  propsRef.current = {
    data,
    layers,
    aircraftFilter,
    cycloneFilter,
    flat,
    autoRotate,
    rotationSpeed,
    selected,
    isolatedId,
    isolateMode,
    onSelect,
    onRawCanvasClick,
    onMiddleClick,
    onSelectedSide,
    zoomToId,
    searchMatchIds,
    spatialGrid,
    filteredIds,
    cycloneWarnings,
  };

  const { theme, mode: themeMode } = useTheme();
  const colorsRef = useRef(theme.colors);
  colorsRef.current = theme.colors;
  const themeRef = useRef(theme);
  themeRef.current = theme;

  // ── Point rendering worker ──────────────────────────────────────
  const workerRef = useRef<Worker | null>(null);
  const workerCanvasRef = useRef<OffscreenCanvas | null>(null);
  const latestBitmapRef = useRef<ImageBitmap | null>(null);
  const trailSyncRef = useRef(30);
  const lastTrailRevRef = useRef(-1);

  // Track what was last sent to worker — skip re-sending heavy data.
  // Updated by the off-path data pump once it has serialized + sent.
  const lastSentDataRef = useRef<DataPoint[] | null>(null);
  const lastSentThemeRef = useRef<typeof theme | null>(null);
  // Per-type item arrays last sent to the worker. A poll only mutates one
  // source, so only that type's array gets a new reference — we re-send just
  // that type and the worker replaces its bucket (stale points drop out).
  const lastSentByTypeRef = useRef<Map<string, DataPoint[]>>(new Map());
  // The render loop sets this when data/theme changed; the data pump (a
  // separate scheduled task, OFF the paint frame) does the heavy serialize +
  // postMessage. The progressive reveal ramp now lives in the worker.
  const dataDirtyRef = useRef(false);
  const dataPumpScheduledRef = useRef(false);
  // Changed layers waiting to stream to the worker, drained a chunk per frame
  // so a big layer (13k ships) never clones in one blocking go.
  const pumpQueueRef = useRef<
    Array<{ source: string; items: DataPoint[]; offset: number }>
  >([]);
  // Warning polygons (region geometry) are sent to the worker as their own
  // "warnings" message when the array OR the theme changes — small + rare.
  const lastSentWarningsRef = useRef<unknown>(null);

  // ── External zoom-to trigger (from search) ──────────────────────────
  const lastZoomToIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!zoomToId) {
      lastZoomToIdRef.current = null;
      return;
    }
    if (zoomToId === lastZoomToIdRef.current) return;
    lastZoomToIdRef.current = zoomToId;

    const item = data.find((d) => d.id === zoomToId);
    if (!item) return;

    const camTarget = camTargetRef.current;
    const cam = camRef.current;
    const isFlat = flat;

    const interp = getInterpolatedPosition(item.id);
    const tLat = interp ? interp.lat : item.lat;
    const tLon = interp ? interp.lon : item.lon;

    if (isFlat) {
      const { w: fw, h: fh } = sizeRef.current;
      const targetZoom = Math.max(cam.zoomFlat, 40);
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
      camTarget.zoom = Math.max(cam.zoomGlobe, 35);
    }
    camTarget.active = true;
    camTarget.lockedId = zoomToId;
  }, [zoomToId, data, flat]);

  // ── Reveal effect — gentle pan, ISS zoom, no lock-on ─────────────
  const lastRevealIdRef = useRef<string | null>(null);
  useEffect(() => {
    // Allow re-reveal of same ID by resetting when cleared
    if (!revealId) {
      lastRevealIdRef.current = null;
      return;
    }
    if (revealId === lastRevealIdRef.current) return;
    lastRevealIdRef.current = revealId;

    const item = data.find((d) => d.id === revealId);
    if (!item) return;

    const camTarget = camTargetRef.current;
    const cam = camRef.current;
    const isFlat = flat;

    const interp = getInterpolatedPosition(item.id);
    const tLat = interp ? interp.lat : item.lat;
    const tLon = interp ? interp.lon : item.lon;

    if (isFlat) {
      const { w: fw, h: fh } = sizeRef.current;
      const targetZoom = Math.max(cam.zoomFlat, 2);
      const mW = fw * 0.92 * targetZoom;
      const mH = fh * 0.84 * targetZoom;
      camTarget.panX = -(tLon / 180) * (mW / 2);
      const basePanY = (tLat / 90) * (mH / 2);
      camTarget.panY = fw < 768 ? basePanY - fh * 0.23 : basePanY;
      camTarget.zoom = targetZoom;
    } else {
      // Always rotate to show the point — no visibility guessing
      const phi = ((90 - tLat) * Math.PI) / 180;
      const theta = ((tLon + 180) * Math.PI) / 180;
      camTarget.rotY = Math.PI / 2 - theta;
      const baseRotX = -(phi - Math.PI / 2);
      const { w: rw, h: rh } = sizeRef.current;
      const targetZoom = Math.max(cam.zoomGlobe, 2.5);
      if (rw < 768) {
        const r = Math.min(rw, rh) * 0.4 * targetZoom;
        camTarget.rotX = baseRotX - Math.asin(Math.min(0.95, (rh * 0.19) / r));
      } else {
        camTarget.rotX = baseRotX;
      }
      // ISS-level zoom — keep current if already zoomed in, otherwise mild
      camTarget.zoom = targetZoom;
    }
    camTarget.active = true;
    camTarget.lockedId = null;
  }, [revealId, data, flat]);

  // ── Render loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let running = true;

    // ── Initialize point rendering worker ────────────────────────
    // Reuse the module-level worker across remounts (see getSharedWorker).
    // This mount's <canvas> is new, so always transfer a fresh OffscreenCanvas
    // and (re)bind onmessage — the worker keeps its land/data/trail state and
    // simply re-points at the new draw target, so it repaints immediately.
    {
      const worker = getSharedWorker();
      workerRef.current = worker;

      const osc = new OffscreenCanvas(
        canvas.width || 800,
        canvas.height || 600,
      );
      workerCanvasRef.current = osc;
      worker.postMessage({ type: "init", canvas: osc }, [osc]);

      worker.onmessage = (e: MessageEvent) => {
        if (e.data.type === "frame") {
          // Dispose previous bitmap
          if (latestBitmapRef.current) {
            latestBitmapRef.current.close();
          }
          latestBitmapRef.current = e.data.bitmap;

          // Store trail hit targets for click detection
          if (e.data.hitTargets && canvasRef.current) {
            (canvasRef.current as any).__trailHitTargets = e.data.hitTargets;
          }

          // Composite — single bitmap from worker has everything
          const mainCanvas = canvasRef.current;
          if (mainCanvas && latestBitmapRef.current) {
            const bmp = latestBitmapRef.current;
            const pr = pendingResizeRef.current;

            // Only apply deferred resize when the bitmap matches the
            // target dimensions — prevents a flash frame where the canvas
            // is cleared at the new size but drawn with an old-size bitmap.
            if (pr && bmp.width === pr.cw && bmp.height === pr.ch) {
              pendingResizeRef.current = null;
              mainCanvas.width = pr.cw;
              mainCanvas.height = pr.ch;
              mainCanvas
                .getContext("2d")
                ?.setTransform(pr.dpr, 0, 0, pr.dpr, 0, 0);
            }

            const mainCtx = mainCanvas.getContext("2d");
            if (mainCtx) {
              mainCtx.setTransform(1, 0, 0, 1, 0, 0);
              mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
              mainCtx.drawImage(bmp, 0, 0, mainCanvas.width, mainCanvas.height);
            }
          }
        }
      };
    }

    // ── Data pump — OFF the paint frame ───────────────────────────
    // Serializing every point + structuredClone across the worker boundary is
    // the cost that froze the globe on each poll. A poll only mutates one
    // source, so we partition by type and re-send ONLY the types whose item
    // arrays changed — the worker replaces that type's bucket (so departed
    // points drop out). The 35k static fires aren't re-cloned on a 15s
    // aircraft poll. Runs on its own rAF, off the paint frame.
    // Queue the layers that changed this poll (whole-bucket replace, so
    // departed points drop out). Cheap: partition + reference compare, no clone.
    const queuePumpJobs = () => {
      const d = propsRef.current.data;
      // Theme change recolors every layer — force all buckets to re-send.
      if (themeRef.current !== lastSentThemeRef.current) {
        lastSentByTypeRef.current = new Map();
      }

      const byType = new Map<string, DataPoint[]>();
      for (const item of d) {
        const arr = byType.get(item.type);
        if (arr) arr.push(item);
        else byType.set(item.type, [item]);
      }

      const last = lastSentByTypeRef.current;
      const unchanged = (a: DataPoint[] | undefined, b: DataPoint[]) => {
        if (!a || a.length !== b.length) return false;
        for (let i = 0; i < b.length; i++) if (a[i] !== b[i]) return false;
        return true;
      };
      const queue = pumpQueueRef.current;
      const enqueue = (source: string, items: DataPoint[]) => {
        const i = queue.findIndex((j) => j.source === source);
        if (i >= 0) queue.splice(i, 1); // supersede any in-flight job
        queue.push({ source, items, offset: 0 });
      };

      for (const [type, items] of byType) {
        if (unchanged(last.get(type), items)) continue;
        last.set(type, items);
        enqueue(type, items);
      }
      // A source that emptied out this poll — clear its bucket in the worker.
      for (const type of last.keys()) {
        if (byType.has(type) || last.get(type)!.length === 0) continue;
        last.set(type, []);
        enqueue(type, []);
      }

      lastSentDataRef.current = d;
      lastSentThemeRef.current = themeRef.current;
    };

    // Drain one chunk per frame. The worker accumulates chunks into a pending
    // bucket and swaps it in on `done`, so a 13k-point layer streams over a few
    // frames instead of cloning in one blocking postMessage.
    const PUMP_CHUNK = 4000;
    const pumpData = () => {
      dataPumpScheduledRef.current = false;
      const worker = workerRef.current;
      if (!worker || !running) return;

      if (dataDirtyRef.current) {
        dataDirtyRef.current = false;
        queuePumpJobs();
      }

      const queue = pumpQueueRef.current;
      if (queue.length === 0) return;

      const C = colorsRef.current;
      const job = queue[0]!;
      const end = Math.min(job.offset + PUMP_CHUNK, job.items.length);
      const chunk: ReturnType<typeof slimPoint>[] = [];
      for (let i = job.offset; i < end; i++) chunk.push(slimPoint(job.items[i]!));
      const reset = job.offset === 0;
      job.offset = end;
      const done = job.offset >= job.items.length;
      worker.postMessage({
        type: "data",
        payload: { source: job.source, data: chunk, colors: C, reset, done },
      });
      if (done) queue.shift();

      if (queue.length > 0) {
        dataPumpScheduledRef.current = true;
        requestAnimationFrame(pumpData);
      }
    };
    const scheduleDataPump = () => {
      if (dataPumpScheduledRef.current) return;
      dataPumpScheduledRef.current = true;
      requestAnimationFrame(pumpData);
    };

    const render = () => {
      if (!running) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const { w: W, h: H } = sizeRef.current;
      const cx = W / 2,
        cy = H / 2;
      const cam = camRef.current;
      const drag = dragRef.current;
      const {
        data: d,
        layers: ly,
        aircraftFilter: af,
        cycloneFilter: cyc,
        flat: isFlat,
        autoRotate: shouldRotate,
        rotationSpeed: rotSpeed,
        selected: sel,
        isolatedId: iso,
        isolateMode: isoMode,
        searchMatchIds: sMatch,
      } = propsRef.current;
      const t = Date.now() * 0.003;

      // Camera update
      updateCamera(
        cam,
        camTargetRef.current,
        drag,
        sel,
        isFlat,
        shouldRotate,
        rotSpeed,
        W,
        H,
      );

      // Report which side of the screen the selected item is on
      // Hysteresis: only flip when point crosses 35%/65% of viewport
      if (sel && propsRef.current.onSelectedSide) {
        const selInterp = getInterpolatedPosition(sel.id);
        const sLat = selInterp ? selInterp.lat : sel.lat;
        const sLon = selInterp ? selInterp.lon : sel.lon;
        const sp = isFlat
          ? (() => {
              const fm = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
              return projFlat(sLat, sLon, fm.cx, fm.cy, fm.mW, fm.mH);
            })()
          : projGlobe(
              sLat,
              sLon,
              cx,
              cy,
              Math.min(W, H) * 0.4 * cam.zoomGlobe,
              cam.rotY,
              cam.rotX,
            );
        if (sp.z > 0) {
          const ratio = sp.x / W;
          const prev = lastSideRef.current;
          // Only flip if point clearly crossed to the other side
          if (prev === "right" && ratio > 0.65) {
            lastSideRef.current = "left";
          } else if (prev === "left" && ratio < 0.35) {
            lastSideRef.current = "right";
          }
          propsRef.current.onSelectedSide(lastSideRef.current);
        }
      }

      // ── Flag data/theme changes for the OFF-PATH data pump ────────
      // The render loop must stay cheap so dragging/zooming never hitch.
      // Serializing the full point array (d.map + structuredClone of ~60k)
      // is heavy, so it does NOT happen here — it's flagged and done on a
      // separate scheduled task (pumpData). The worker owns the progressive
      // reveal ramp itself, so no renderLimit bump on the paint path either.
      if (d !== lastSentDataRef.current || themeRef.current !== lastSentThemeRef.current) {
        dataDirtyRef.current = true;
        scheduleDataPump();
      }

      // ── Send render job to worker ─────────────────────────────
      const worker = workerRef.current;
      if (worker) {
        // Warning polygons: send on change (array ref or theme). Small + rare
        // (~5 min cadence), so a direct postMessage here is cheap; the worker
        // stores them and draws each frame under the showWarnings toggle.
        const warnings = propsRef.current.cycloneWarnings ?? [];
        if (
          warnings !== lastSentWarningsRef.current ||
          themeRef.current !== lastSentThemeRef.current
        ) {
          lastSentWarningsRef.current = warnings;
          worker.postMessage({
            type: "warnings",
            payload: {
              features: warnings,
              warnColor: colorsRef.current.cycWarning,
              watchColor: colorsRef.current.cycWatch,
            },
          });
        }

        // Sync trail state to the worker only when positions actually changed
        // (a poll bumped the rev). Between polls the data is identical, so this
        // skips re-cloning every track in the paint loop every ~0.5s.
        trailSyncRef.current++;
        if (trailSyncRef.current >= 30 && getTrailsRev() !== lastTrailRevRef.current) {
          trailSyncRef.current = 0;
          lastTrailRevRef.current = getTrailsRev();
          // Pack into transferable buffers so the worker boundary doesn't
          // structuredClone ~20k objects in the paint loop. Numerics ride
          // Float32/Float64 buffers (transferred zero-copy); only the flat id
          // list is cloned. ts needs Float64 (ms epoch loses precision in f32).
          const ids: string[] = [];
          const vals: number[] = [];
          const tss: number[] = [];
          for (const item of d) {
            if (item.type === "aircraft" || item.type === "ships") {
              const trail = getTrail(item.id);
              if (trail.length > 0) {
                const last = trail[trail.length - 1]!;
                const dd = (item as any).data;
                ids.push(item.id);
                vals.push(last.lat, last.lon, dd?.heading ?? 0, dd?.speedMps ?? 0);
                tss.push(last.ts);
              }
            }
          }
          const valBuf = new Float32Array(vals);
          const tsBuf = new Float64Array(tss);
          worker.postMessage(
            { type: "trails", ids, vals: valBuf, tss: tsBuf },
            [valBuf.buffer, tsBuf.buffer],
          );
        }

        const selId = sel?.id ?? null;

        // ── Light message — camera + interaction state every frame ──
        const dpr = canvas.width / W || 1;

        // Build selected item with trail + planned route for worker
        let selectedItem = null;
        if (sel) {
          const trail = getTrail(sel.id);
          selectedItem = {
            id: sel.id,
            type: sel.type,
            lat: sel.lat,
            lon: sel.lon,
            _trail: trail,
            _route: getSelectedRoute(sel.id),
          };
        }

        const searchIds = sMatch ? Array.from(sMatch) : null;

        // WCAG 2.2 AA — Hard Rule 15. Read prefers-reduced-motion at frame
        // time so a system-level toggle takes effect without a reload. The
        // worker has no access to matchMedia.
        const prefersReducedMotion =
          typeof window !== "undefined" &&
          typeof window.matchMedia === "function"
            ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
            : false;

        worker.postMessage({
          type: "frame",
          payload: {
            isFlat,
            cam: {
              rotY: cam.rotY,
              rotX: cam.rotX,
              zoomGlobe: cam.zoomGlobe,
              zoomFlat: cam.zoomFlat,
              panX: cam.panX,
              panY: cam.panY,
            },
            W,
            H,
            dpr,
            t,
            selectedId: sel?.id ?? null,
            isolatedId: iso,
            isolateMode: isoMode,
            layers: ly,
            aircraftFilter: {
              enabled: af.enabled,
              showAirborne: af.showAirborne,
              showGround: af.showGround,
              squawks: Array.from(af.squawks),
              countries: Array.from(af.countries),
              milFilter: af.milFilter ?? "all",
            },
            cyclonesShowForecast: cyc?.showForecast ?? true,
            cyclonesShowCone: cyc?.showCone ?? true,
            cyclonesShowWindField: cyc?.showWindField ?? false,
            cyclonesShowWarnings: cyc?.showWarnings ?? true,
            prefersReducedMotion,
            searchMatchIds: searchIds,
            selectedItem,
          },
        });
      }

      // Update trail tooltip position if active
      const ttEl = trailTooltipElRef.current;
      const ttPoint = trailTooltipPointRef.current;
      if (ttEl && ttPoint) {
        const isF = isFlat;
        const proj: ProjFn = isF
          ? (lat, lon) => {
              const fm = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
              return projFlat(lat, lon, fm.cx, fm.cy, fm.mW, fm.mH);
            }
          : (lat, lon) =>
              projGlobe(
                lat,
                lon,
                cx,
                cy,
                Math.min(W, H) * 0.4 * cam.zoomGlobe,
                cam.rotY,
                cam.rotX,
              );
        const p = proj(ttPoint.lat, ttPoint.lon);
        if (p.z > 0) {
          const ttW = ttEl.offsetWidth || 200;
          const ttH = ttEl.offsetHeight || 80;

          // Project selected item's current position to avoid overlap
          let selScreenX = -999;
          let selScreenY = -999;
          if (sel) {
            const selInterp = getInterpolatedPosition(sel.id);
            const sLat = selInterp ? selInterp.lat : sel.lat;
            const sLon = selInterp ? selInterp.lon : sel.lon;
            const sp = proj(sLat, sLon);
            if (sp.z > 0) {
              selScreenX = sp.x;
              selScreenY = sp.y;
            }
          }

          // Default to left of dot
          let showRight = p.x - ttW - 16 < 0;

          // Check if default position would overlap selected item
          const xLeft = p.x - ttW - 14;
          const xRight = p.x + 14;
          const yTop = Math.max(4, Math.min(H - ttH - 4, p.y - ttH / 2));
          const yBot = yTop + ttH;

          // If tooltip on left overlaps selected item, try right
          if (
            !showRight &&
            selScreenX > xLeft &&
            selScreenX < xLeft + ttW &&
            selScreenY > yTop &&
            selScreenY < yBot
          ) {
            showRight = true;
          }
          // If tooltip on right overlaps selected item, try left
          if (
            showRight &&
            selScreenX > xRight &&
            selScreenX < xRight + ttW &&
            selScreenY > yTop &&
            selScreenY < yBot
          ) {
            showRight = false;
          }

          const xPos = showRight ? xRight : xLeft;
          const yPos = yTop;

          // Clamp to viewport — never go off screen
          const clampedX = Math.max(4, Math.min(W - ttW - 4, xPos));
          const clampedY = Math.max(4, Math.min(H - ttH - 4, yPos));
          ttEl.style.left = `${clampedX}px`;
          ttEl.style.top = `${clampedY}px`;
          ttEl.style.display = "";
        } else {
          ttEl.style.display = "none";
        }
      }

      // Always schedule next frame for camera updates + static layer.
      // The actual composite to screen happens only in worker onmessage.
      if (running) requestAnimationFrame(render);
    };
    requestAnimationFrame(render);
    return () => {
      running = false;
      // Keep the shared worker alive across remounts (don't terminate); just
      // detach this mount's stale onmessage so it stops compositing into a
      // canvas that's going away. The next mount rebinds onmessage + inits a
      // fresh OffscreenCanvas. Worker state (land/data/trails) is preserved.
      const w = workerRef.current;
      if (w && w.onmessage) w.onmessage = null;
      workerRef.current = null;
      if (latestBitmapRef.current) {
        latestBitmapRef.current.close();
        latestBitmapRef.current = null;
      }
    };
  }, []);

  // ── E2E projection bridge ───────────────────────────────────────
  // Exposes window.__projectLatLon for Playwright tests (cyclones-
  // forecast-click etc.) to compute click coordinates against the
  // currently rendered camera/projection state. The function reads
  // live refs, so it tracks camera changes after initial mount.
  // Always exposed — purely a math helper, no app state mutation.
  useEffect(() => {
    const fn = (lat: number, lon: number) => {
      const { w: W, h: H } = sizeRef.current;
      const cam = camRef.current;
      if (propsRef.current.flat) {
        const fm = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
        return projFlat(lat, lon, fm.cx, fm.cy, fm.mW, fm.mH);
      }
      const r = Math.min(W, H) * 0.4 * cam.zoomGlobe;
      return projGlobe(lat, lon, W / 2, H / 2, r, cam.rotY, cam.rotX);
    };
    (globalThis as unknown as Record<string, unknown>).__projectLatLon = fn;
    return () => {
      delete (globalThis as unknown as Record<string, unknown>).__projectLatLon;
    };
  }, []);

  // ── Resize observer ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const par = canvas.parentElement;
    if (!par) return;
    // ResizeObserver fires synchronously during layout. Writing
    // canvas.style.width/height inside the callback re-invalidates
    // layout and triggers the "ResizeObserver loop completed with
    // undelivered notifications" warning. Defer the writes to the next
    // animation frame so layout settles before we touch it.
    let rafPending = 0;
    const resize = () => {
      if (rafPending) return;
      rafPending = requestAnimationFrame(() => {
        rafPending = 0;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = par.clientWidth,
          h = par.clientHeight;
        if (w === 0 || h === 0) return;
        const cw = Math.round(w * dpr);
        const ch = Math.round(h * dpr);
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        // Defer buffer resize — applied right before next composite
        // This prevents the canvas from going blank between resize and next frame
        if (canvas.width !== cw || canvas.height !== ch) {
          pendingResizeRef.current = { cw, ch, dpr };
        }
        const prevMin = Math.min(sizeRef.current.w, sizeRef.current.h);
        const nextMin = Math.min(w, h);
        if (prevMin > 0 && nextMin > 0 && prevMin !== nextMin) {
          const cam = camRef.current;
          const target = camTargetRef.current;
          const k = prevMin / nextMin;
          cam.zoomGlobe *= k;
          if (target.zoom > 0) target.zoom *= k;
        }
        sizeRef.current = { w, h };
      });
    };
    // Initial sizing — apply immediately since canvas is empty anyway
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = par.clientWidth,
      h = par.clientHeight;
    if (w > 0 && h > 0) {
      const cw = Math.round(w * dpr);
      const ch = Math.round(h * dpr);
      canvas.width = cw;
      canvas.height = ch;
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      sizeRef.current = { w, h };
    }
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    ro.observe(par);
    return () => {
      if (rafPending) cancelAnimationFrame(rafPending);
      window.removeEventListener("resize", resize);
      ro.disconnect();
    };
  }, []);

  // ── Input handlers ──────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handlers = createInputHandlers({
      canvas,
      camRef,
      camTargetRef,
      dragRef,
      sizeRef,
      propsRef,
      setTrailTooltip,
    });

    attachInputHandlers(canvas, handlers);
    return () => detachInputHandlers(canvas, handlers);
  }, []);

  // Sync tooltip point ref for render loop reprojection
  useEffect(() => {
    trailTooltipPointRef.current = trailTooltip;
  }, [trailTooltip]);

  // Clear tooltip and reset panel side when selection changes
  useEffect(() => {
    setTrailTooltip(null);
    lastSideRef.current = "right";
  }, [selected?.id]);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="w-full h-full"
        style={{
          cursor: "default",
          display: "block",
          touchAction:
            typeof window !== "undefined" && window.innerWidth < 768
              ? "pan-y"
              : "none",
        }}
      />
      {trailTooltip && (
        <div
          ref={trailTooltipElRef}
          className="absolute pointer-events-none z-30 rounded px-2.5 py-1.5 bg-sig-panel/95 border border-sig-accent/40 backdrop-blur-sm text-(length:--sig-text-sm)"
          style={{ maxWidth: 200 }}
        >
          <div className="text-sig-accent tracking-wider mb-0.5">
            {new Date(trailTooltip.ts).toLocaleTimeString("en-US", {
              hour12: false,
            })}
            <span className="text-sig-dim ml-1.5">
              {(() => {
                const ago = Math.round((Date.now() - trailTooltip.ts) / 60000);
                if (ago < 1) return "now";
                if (ago < 60) return `${ago}m ago`;
                return `${Math.floor(ago / 60)}h ${ago % 60}m ago`;
              })()}
            </span>
          </div>
          {trailTooltip.altitude != null && (
            <div className="text-sig-bright">
              ALT{" "}
              <span className="text-sig-text">{trailTooltip.altitude} ft</span>
            </div>
          )}
          {trailTooltip.speed != null && (
            <div className="text-sig-bright">
              SPD <span className="text-sig-text">{trailTooltip.speed} kn</span>
            </div>
          )}
          {trailTooltip.heading != null && (
            <div className="text-sig-bright">
              HDG <span className="text-sig-text">{trailTooltip.heading}°</span>
            </div>
          )}
          {trailTooltip.altitude == null &&
            trailTooltip.speed == null &&
            trailTooltip.heading == null && (
              <div className="text-sig-dim">No snapshot data</div>
            )}
          <div className="text-sig-dim mt-0.5">
            {Math.abs(trailTooltip.lat).toFixed(3)}°
            {trailTooltip.lat >= 0 ? "N" : "S"},{" "}
            {Math.abs(trailTooltip.lon).toFixed(3)}°
            {trailTooltip.lon >= 0 ? "E" : "W"}
          </div>
        </div>
      )}
    </div>
  );
}
