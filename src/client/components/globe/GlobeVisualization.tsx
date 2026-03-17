import { enrichLand } from "@/lib/landService";
import {
  getInterpolatedPosition,
  getTrail,
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
import { drawLand } from "./landRenderer";
import { drawGrid } from "./gridRenderer";
import { updateCamera } from "./cameraSystem";
import {
  createInputHandlers,
  attachInputHandlers,
  detachInputHandlers,
} from "./inputHandlers";
import type { DataPoint } from "@/features/base/dataPoints";

export function GlobeVisualization({
  flat = false,
  autoRotate = true,
  rotationSpeed = 1,
  data,
  layers,
  aircraftFilter,
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
  const [trailTooltip, setTrailTooltip] = useState<TrailPoint | null>(null);
  const trailTooltipPointRef = useRef<TrailPoint | null>(null);
  const trailTooltipElRef = useRef<HTMLDivElement>(null);
  const lastSideRef = useRef<"left" | "right">("right");
  const propsRef = useRef({
    data,
    layers,
    aircraftFilter,
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
  });
  propsRef.current = {
    data,
    layers,
    aircraftFilter,
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
  };

  const { theme } = useTheme();
  const colorsRef = useRef(theme.colors);
  colorsRef.current = theme.colors;

  // ── Offscreen canvas for static layer (land/ocean/grid) ─────────
  const offscreenRef = useRef<HTMLCanvasElement | null>(null);
  const lastStaticFpRef = useRef("");

  // ── Point rendering worker ──────────────────────────────────────
  const workerRef = useRef<Worker | null>(null);
  const workerCanvasRef = useRef<OffscreenCanvas | null>(null);
  const latestBitmapRef = useRef<ImageBitmap | null>(null);
  const workerBusyRef = useRef(false);
  const trailSyncRef = useRef(0);

  // Track what was last sent to worker — skip re-sending heavy data
  const lastSentDataRef = useRef<DataPoint[] | null>(null);
  const lastSentSelRef = useRef<string | null>(null);
  const lastSentIsoRef = useRef<string | null>(null);
  const lastSentSearchRef = useRef<Set<string> | null>(null);
  const lastSentLayersRef = useRef<string>("");
  const lastSentFilterRef = useRef<string>("");

  // ── Progressive render limit ────────────────────────────────────
  const prevDataRef = useRef<DataPoint[] | null>(null);
  const renderLimitRef = useRef(0);
  const RENDER_CHUNK = 3000;

  // ── External zoom-to trigger (from search) ──────────────────────────
  const lastZoomToIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!zoomToId || zoomToId === lastZoomToIdRef.current) return;
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

  // ── Render loop ─────────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let running = true;

    // ── Initialize point rendering worker ────────────────────────
    if (!workerRef.current) {
      const worker = new Worker("/workers/pointWorker.js");
      workerRef.current = worker;

      // Create OffscreenCanvas for the worker
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
          workerBusyRef.current = false;

          // Store trail hit targets for click detection
          if (e.data.hitTargets && canvasRef.current) {
            (canvasRef.current as any).__trailHitTargets = e.data.hitTargets;
          }

          // Composite both layers on the same frame
          const mainCanvas = canvasRef.current;
          const staticCanvas = offscreenRef.current;
          if (mainCanvas && staticCanvas && latestBitmapRef.current) {
            const mainCtx = mainCanvas.getContext("2d");
            if (mainCtx) {
              // Clear at physical pixel size (canvas.width/height includes DPR)
              mainCtx.setTransform(1, 0, 0, 1, 0, 0);
              mainCtx.clearRect(0, 0, mainCanvas.width, mainCanvas.height);
              // Both static layer and worker bitmap are at physical pixel size
              mainCtx.drawImage(staticCanvas, 0, 0);
              mainCtx.drawImage(latestBitmapRef.current, 0, 0);
            }
          }
        }
      };
    }

    enrichLand(() => {
      // Land loaded — invalidate offscreen cache
      lastStaticFpRef.current = "";
    });

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
        flat: isFlat,
        autoRotate: shouldRotate,
        rotationSpeed: rotSpeed,
        selected: sel,
        isolatedId: iso,
        isolateMode: isoMode,
        searchMatchIds: sMatch,
      } = propsRef.current;
      const C = colorsRef.current;
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

      // ── Progressive render limit ────────────────────────────────
      if (d !== prevDataRef.current) {
        prevDataRef.current = d;
        renderLimitRef.current = RENDER_CHUNK;
      } else if (renderLimitRef.current < d.length) {
        renderLimitRef.current = Math.min(
          renderLimitRef.current + RENDER_CHUNK,
          d.length,
        );
      }
      const renderData =
        renderLimitRef.current < d.length
          ? d.slice(0, renderLimitRef.current)
          : d;

      // ── Static layer fingerprint ────────────────────────────────
      // Quantized to .001 so during auto-rotate the static layer
      // redraws ~15fps (land/grid) while data points stay at 60fps.
      const fp = isFlat
        ? `F|${W}|${H}|${cam.zoomFlat.toFixed(2)}|${cam.panX.toFixed(0)}|${cam.panY.toFixed(0)}`
        : `G|${W}|${H}|${cam.rotY.toFixed(3)}|${cam.rotX.toFixed(3)}|${cam.zoomGlobe.toFixed(2)}`;

      const staticDirty = fp !== lastStaticFpRef.current;

      // Ensure offscreen canvas exists and is sized
      if (!offscreenRef.current) {
        offscreenRef.current = document.createElement("canvas");
      }
      const osc = offscreenRef.current;
      if (osc.width !== canvas.width || osc.height !== canvas.height) {
        osc.width = canvas.width;
        osc.height = canvas.height;
        lastStaticFpRef.current = ""; // force redraw on resize
      }

      // ── Draw static layer (land/ocean/grid) to offscreen ────────
      if (staticDirty || lastStaticFpRef.current === "") {
        const octx = osc.getContext("2d");
        if (octx) {
          const dpr = canvas.width / W || 1;
          octx.setTransform(dpr, 0, 0, dpr, 0, 0);
          octx.clearRect(0, 0, W, H);

          if (!isFlat) {
            const r = Math.min(W, H) * 0.4 * cam.zoomGlobe;
            const proj: ProjFn = (lat, lon) =>
              projGlobe(lat, lon, cx, cy, r, cam.rotY, cam.rotX);

            // Glow
            const glow = octx.createRadialGradient(
              cx,
              cy,
              r * 0.8,
              cx,
              cy,
              r * 1.4,
            );
            glow.addColorStop(0, C.accent + "0d");
            glow.addColorStop(1, "rgba(0,0,0,0)");
            octx.fillStyle = glow;
            octx.fillRect(0, 0, W, H);

            // Solid ocean
            const bg = octx.createRadialGradient(
              cx - r * 0.2,
              cy - r * 0.2,
              0,
              cx,
              cy,
              r,
            );
            bg.addColorStop(0, "#0e1825");
            bg.addColorStop(1, "#060c16");
            octx.beginPath();
            octx.arc(cx, cy, r, 0, Math.PI * 2);
            octx.fillStyle = bg;
            octx.fill();

            // Clip to globe
            octx.save();
            octx.beginPath();
            octx.arc(cx, cy, r - 0.5, 0, Math.PI * 2);
            octx.clip();

            drawLand(octx, proj, C, false, cx, cy, r - 0.5);
            drawGrid(octx, proj, { isFlat: false, accentColor: C.accent });

            octx.restore();

            // Rim
            octx.beginPath();
            octx.arc(cx, cy, r, 0, Math.PI * 2);
            octx.strokeStyle = C.accent + "1f";
            octx.lineWidth = 1.5;
            octx.stroke();
          } else {
            const {
              mW,
              mH,
              mx,
              my,
              cx: flatCx,
              cy: flatCy,
            } = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
            const proj: ProjFn = (lat, lon) =>
              projFlat(lat, lon, flatCx, flatCy, mW, mH);

            octx.fillStyle = "#081018";
            octx.fillRect(mx, my, mW, mH);

            octx.save();
            octx.beginPath();
            octx.rect(mx, my, mW, mH);
            octx.clip();

            drawLand(octx, proj, C, true, 0, 0, 0);
            drawGrid(octx, proj, {
              isFlat: true,
              cx,
              cy,
              mW,
              mH,
              mx,
              my,
              accentColor: C.accent,
            });

            octx.restore();

            octx.strokeStyle = C.accent + "1a";
            octx.lineWidth = 1;
            octx.strokeRect(mx, my, mW, mH);

            octx.globalAlpha = 1;
            octx.fillStyle = C.dim;
            const baseFontSize = Math.max(8, Math.min(W, H) * 0.015);
            octx.font = `${baseFontSize}px 'JetBrains Mono', monospace`;
            octx.textAlign = "center";
            for (let lon = -120; lon <= 120; lon += 60) {
              octx.fillText(
                `${Math.abs(lon)}\u00B0${lon >= 0 ? "E" : "W"}`,
                flatCx + (lon / 180) * (mW / 2),
                my + mH + 13,
              );
            }
            octx.textAlign = "right";
            for (let lat = -60; lat <= 60; lat += 30) {
              octx.fillText(
                `${Math.abs(lat)}\u00B0${lat >= 0 ? "N" : "S"}`,
                mx - 5,
                flatCy - (lat / 90) * (mH / 2) + 3,
              );
            }
          }

          lastStaticFpRef.current = fp;
        }
      }

      // ── Draw static layer to offscreen (camera update already done) ──
      // The actual composite to screen happens in the worker onmessage
      // callback so both layers paint on the same frame.

      // ── Send render job to worker ─────────────────────────────
      const worker = workerRef.current;
      if (worker && !workerBusyRef.current) {
        workerBusyRef.current = true;

        // Sync trail data periodically (~every 30 frames)
        trailSyncRef.current++;
        if (trailSyncRef.current >= 30) {
          trailSyncRef.current = 0;
          const trailEntries: Array<[string, any]> = [];
          for (const item of renderData) {
            if (item.type === "aircraft" || item.type === "ships") {
              const trail = getTrail(item.id);
              if (trail.length > 0) {
                const last = trail[trail.length - 1]!;
                trailEntries.push([
                  item.id,
                  {
                    lat: last.lat,
                    lon: last.lon,
                    ts: last.ts,
                    heading: (item as any).data?.heading ?? 0,
                    speedMps: (item as any).data?.speedMps ?? 0,
                  },
                ]);
              }
            }
          }
          worker.postMessage({ type: "trails", entries: trailEntries });
        }

        // ── Detect data changes — only re-send heavy payload when needed ──
        const selId = sel?.id ?? null;
        const layersFp = JSON.stringify(ly);
        const filterFp = `${af.enabled}|${af.showAirborne}|${af.showGround}|${af.squawks.size}|${af.countries.size}`;
        const dataChanged =
          renderData !== lastSentDataRef.current ||
          selId !== lastSentSelRef.current ||
          iso !== lastSentIsoRef.current ||
          sMatch !== lastSentSearchRef.current ||
          layersFp !== lastSentLayersRef.current ||
          filterFp !== lastSentFilterRef.current;

        if (dataChanged) {
          // Heavy message — full data + filters + selection
          const plainData = renderData.map((item) => ({
            id: item.id,
            type: item.type,
            lat: item.lat,
            lon: item.lon,
            timestamp: item.timestamp,
            data: (item as any).data,
          }));

          let selectedItem = null;
          if (sel) {
            const trail = getTrail(sel.id);
            selectedItem = {
              id: sel.id,
              type: sel.type,
              lat: sel.lat,
              lon: sel.lon,
              _trail: trail,
            };
          }

          const searchIds = sMatch ? Array.from(sMatch) : null;

          worker.postMessage({
            type: "data",
            payload: {
              data: plainData,
              layers: ly,
              aircraftFilter: {
                enabled: af.enabled,
                showAirborne: af.showAirborne,
                showGround: af.showGround,
                squawks: Array.from(af.squawks),
                countries: Array.from(af.countries),
              },
              selectedId: selId,
              isolatedId: iso,
              isolateMode: isoMode,
              searchMatchIds: searchIds,
              selectedItem,
              colors: C,
            },
          });

          lastSentDataRef.current = renderData;
          lastSentSelRef.current = selId;
          lastSentIsoRef.current = iso;
          lastSentSearchRef.current = sMatch ?? null;
          lastSentLayersRef.current = layersFp;
          lastSentFilterRef.current = filterFp;
        }

        // ── Light message — camera + timing only (~50 bytes) ──
        const dpr = canvas.width / W || 1;

        let clip: any = null;
        if (!isFlat) {
          const r = Math.min(W, H) * 0.4 * cam.zoomGlobe;
          clip = { type: "globe", cx: W / 2, cy: H / 2, r: r - 0.5 };
        } else {
          const fm = getFlatMetrics(W, H, cam.zoomFlat, cam.panX, cam.panY);
          clip = { type: "flat", mx: fm.mx, my: fm.my, mW: fm.mW, mH: fm.mH };
        }

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
            clip,
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
          // Default to left of dot (away from detail panel on right)
          // Flip to right only if too close to left edge
          const showRight = p.x - ttW - 16 < 0;
          const xPos = showRight ? p.x + 14 : p.x - ttW - 14;
          // Vertically center on the dot, clamp to viewport
          const yPos = Math.max(4, Math.min(H - ttH - 4, p.y - ttH / 2));
          ttEl.style.left = `${xPos}px`;
          ttEl.style.top = `${yPos}px`;
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
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
      if (latestBitmapRef.current) {
        latestBitmapRef.current.close();
        latestBitmapRef.current = null;
      }
    };
  }, []);

  // ── Resize observer ─────────────────────────────────────────────────
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const par = canvas.parentElement;
    if (!par) return;
    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const w = par.clientWidth,
        h = par.clientHeight;
      if (w === 0 || h === 0) return;
      const cw = Math.round(w * dpr);
      const ch = Math.round(h * dpr);
      if (canvas.width !== cw || canvas.height !== ch) {
        canvas.width = cw;
        canvas.height = ch;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        canvas.getContext("2d")?.setTransform(dpr, 0, 0, dpr, 0, 0);
      }
      sizeRef.current = { w, h };
    };
    resize();
    window.addEventListener("resize", resize);
    const ro = new ResizeObserver(resize);
    ro.observe(par);
    return () => {
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
        style={{ cursor: "default", display: "block", touchAction: "none" }}
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
