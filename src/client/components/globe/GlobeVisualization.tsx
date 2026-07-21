import { getTrail, type TrailPoint } from "@/lib/geo/trailService";
import { useEffect, useRef, useState } from "react";
import { useTheme } from "@/context/ThemeContext";
import type { GlobeVisualizationProps } from "./types";
import { getFlatMetrics, projGlobe, projFlat } from "./projection";
import {
  createInputHandlers,
  attachInputHandlers,
  detachInputHandlers,
} from "./inputHandlers";
import { getSelectedRoute } from "@/lib/runtime/layoutSignals";
import { isMobileWidth } from "@/config/breakpoints";
import type { DataPoint } from "@/features/base/dataPoints";
import { warningToDataPoint } from "@/features/environmental/cyclones/data/warningPoint";
import { weatherSeverityRank, severityMeta } from "@/features/environmental/weather/severity";
import { RENDER_POLICY } from "@/workers/render/policy";
import { getDataWorkerClient } from "@/lib/cache/dataWorkerClient";
import {
  RENDER_PROTOCOL_VERSION,
  createRenderCommand,
  type RenderCamera,
  type RenderWorkerCommandBody,
  type RenderWorkerEvent,
  type SelectedRenderItem,
} from "@/workers/render/protocol";
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

type RenderWorkerHotData = {
  renderWorker?: Worker;
};

function createRenderWorker(): Worker {
  return new Worker("/workers/pointWorker.js", { type: "module" });
}

function getSharedWorker(): Worker {
  if (import.meta.hot) {
    const hotData: RenderWorkerHotData = import.meta.hot.data;
    hotData.renderWorker ??= createRenderWorker();
    return hotData.renderWorker;
  }
  sharedWorker ??= createRenderWorker();
  return sharedWorker;
}

// High-count types ship only the fields the worker draws/filters with — the
// full enriched blob (acType, registration, route, …) would balloon the clone.
function slimPoint(item: DataPoint): DataPoint {
  if (item.type === "aircraft") {
    const details = item.data;
    return {
      ...item,
      data: {
        military: details.military,
        recon: details.recon,
        squawkStatus: details.squawkStatus,
        squawk: details.squawk,
        onGround: details.onGround,
        originCountry: details.originCountry,
        heading: details.heading,
      },
    };
  }
  if (item.type === "ships") {
    return { ...item, data: { heading: item.data.heading } };
  }
  if (item.type === "fires") {
    return { ...item, data: { frp: item.data.frp } };
  }
  if (item.type === "events") {
    return { ...item, data: { severity: item.data.severity } };
  }
  return item;
}

export function GlobeVisualization({
  flat = false,
  autoRotate = true,
  rotationSpeed = 1,
  data,
  dataVersion,
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
  cycloneWarnings,
}: Readonly<GlobeVisualizationProps>) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const camRef = useRef<RenderCamera>({
    rotY: 0,
    rotX: 0.3,
    zoomGlobe: 1,
    zoomFlat: 1,
    panX: 0,
    panY: 0,
  });
  const sizeRef = useRef({ w: 800, h: 600 });
  const [trailTooltip, setTrailTooltip] = useState<TrailPoint | null>(null);
  const trailTooltipElRef = useRef<HTMLDivElement>(null);
  const propsRef = useRef({
    data,
    flat,
    onSelect,
    onRawCanvasClick,
    onMiddleClick,
    onSelectedSide,
    cycloneWarnings,
  });
  propsRef.current = {
    data,
    flat,
    onSelect,
    onRawCanvasClick,
    onMiddleClick,
    onSelectedSide,
    cycloneWarnings,
  };

  const { theme } = useTheme();
  const transferredCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderSessionIdRef = useRef<string | null>(null);
  const renderSequenceRef = useRef(0);
  const sendCommandRef = useRef<
    (body: RenderWorkerCommandBody, transfer?: Transferable[]) => void
  >(() => undefined);
  const lastSentThemeRef = useRef<typeof theme | null>(null);
  const lastSentByTypeRef = useRef<Map<string, DataPoint[]>>(new Map());
  const lastZoomToIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!zoomToId) {
      lastZoomToIdRef.current = null;
      return;
    }
    if (zoomToId === lastZoomToIdRef.current) return;
    const item = data.find((candidate) => candidate.id === zoomToId);
    if (!item) return;
    lastZoomToIdRef.current = zoomToId;
    sendCommandRef.current({
      type: "focus",
      payload: {
        id: item.id,
        latitude: item.lat,
        longitude: item.lon,
        kind: "focus",
      },
    });
  }, [zoomToId, data]);

  // ── Reveal effect — gentle pan, ISS zoom, no lock-on ─────────────
  const lastRevealIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!revealId) {
      lastRevealIdRef.current = null;
      return;
    }
    if (revealId === lastRevealIdRef.current) return;
    const item = data.find((candidate) => candidate.id === revealId);
    if (!item) return;
    lastRevealIdRef.current = revealId;
    sendCommandRef.current({
      type: "focus",
      payload: {
        id: item.id,
        latitude: item.lat,
        longitude: item.lon,
        kind: "reveal",
      },
    });
  }, [revealId, data]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const worker = getSharedWorker();
    const sessionId =
      renderSessionIdRef.current ?? globalThis.crypto.randomUUID();
    renderSessionIdRef.current = sessionId;

    const sendCommand = (
      body: RenderWorkerCommandBody,
      transfer: Transferable[] = [],
    ): void => {
      renderSequenceRef.current += 1;
      worker.postMessage(
        createRenderCommand(body, sessionId, renderSequenceRef.current),
        transfer,
      );
    };
    sendCommandRef.current = sendCommand;

    const parent = canvas.parentElement;
    const width = parent?.clientWidth || sizeRef.current.w;
    const height = parent?.clientHeight || sizeRef.current.h;
    const devicePixelRatio = Math.min(
      window.devicePixelRatio || 1,
      RENDER_POLICY.maxDevicePixelRatio,
    );
    sizeRef.current = { w: width, h: height };
    canvas.style.width = width + "px";
    canvas.style.height = height + "px";

    if (transferredCanvasRef.current !== canvas) {
      canvas.width = Math.round(width * devicePixelRatio);
      canvas.height = Math.round(height * devicePixelRatio);
      const offscreen = canvas.transferControlToOffscreen();
      transferredCanvasRef.current = canvas;
      const dataClient = getDataWorkerClient();
      if (
        dataClient &&
        typeof MessageChannel !== "undefined"
      ) {
        const channel = new MessageChannel();
        sendCommand(
          {
            type: "init",
            canvas: offscreen,
            dataPort: channel.port2,
          },
          [offscreen, channel.port2],
        );
        void dataClient
          .connectRender(channel.port1, sessionId)
          .catch(() => undefined);
      } else {
        sendCommand({ type: "init", canvas: offscreen }, [offscreen]);
      }
    }

    const sendPendingFocus = (): void => {
      const focusId = lastZoomToIdRef.current;
      const revealTargetId = lastRevealIdRef.current;
      const targetId = focusId ?? revealTargetId;
      if (!targetId) return;
      const item = propsRef.current.data.find(
        (candidate) => candidate.id === targetId,
      );
      if (!item) return;
      sendCommand({
        type: "focus",
        payload: {
          id: item.id,
          latitude: item.lat,
          longitude: item.lon,
          kind: focusId ? "focus" : "reveal",
        },
      });
    };

    let selectionRequest = 0;

    const handleMessage = (
      event: MessageEvent<RenderWorkerEvent>,
    ): void => {
      const message = event.data;
      if (
        message.protocolVersion !== RENDER_PROTOCOL_VERSION ||
        message.sessionId !== sessionId
      ) {
        return;
      }
      if (message.type === "ready") {
        canvas.dataset.renderWorkerReady = "true";
        sendPendingFocus();
        return;
      }
      if (message.type === "dataChannelReady") {
        canvas.dataset.renderDataChannelReady = "true";
        return;
      }
      if (message.type === "camera") {
        camRef.current = message.payload;
        return;
      }

      const interaction = message.payload;
      if (interaction.kind === "cursor") {
        canvas.style.cursor = interaction.cursor;
        return;
      }
      if (interaction.kind === "selection") {
        selectionRequest++;
        const request = selectionRequest;
        const current = propsRef.current;
        const item = current.data.find(
          (candidate) => candidate.id === interaction.id,
        );
        const warning = current.cycloneWarnings?.find(
          (candidate) => candidate.id === interaction.id,
        );
        if (warning) {
          current.onSelect(warningToDataPoint(warning));
          return;
        }
        if (!interaction.id || (item && item.type !== "quakes")) {
          current.onSelect(item ?? null);
          return;
        }
        const dataClient = getDataWorkerClient();
        if (!dataClient) {
          current.onSelect(item ?? null);
          return;
        }
        void dataClient
          .getSourceEntity("earthquake", interaction.id)
          .then(({ value }) => {
            if (request !== selectionRequest) return;
            propsRef.current.onSelect(value ?? item ?? null);
          })
          .catch(() => {
            if (request !== selectionRequest) return;
            propsRef.current.onSelect(item ?? null);
          });
        return;
      }
      if (interaction.kind === "rawCanvasClick") {
        propsRef.current.onRawCanvasClick?.();
        return;
      }
      if (interaction.kind === "selectedSide") {
        propsRef.current.onSelectedSide?.(interaction.side);
        return;
      }

      setTrailTooltip((previous) => {
        const point = interaction.point;
        if (!point) return null;
        return previous?.ts === point.ts &&
          previous.lat === point.lat &&
          previous.lon === point.lon
          ? previous
          : point;
      });
      requestAnimationFrame(() => {
        const element = trailTooltipElRef.current;
        if (!element || !interaction.visible) {
          if (element) element.style.display = "none";
          return;
        }
        const { w, h } = sizeRef.current;
        const tooltipWidth = element.offsetWidth || 200;
        const tooltipHeight = element.offsetHeight || 80;
        const showRight = interaction.x - tooltipWidth - 16 < 0;
        const x = showRight
          ? interaction.x + 14
          : interaction.x - tooltipWidth - 14;
        const y = interaction.y - tooltipHeight / 2;
        element.style.left =
          Math.max(4, Math.min(w - tooltipWidth - 4, x)) + "px";
        element.style.top =
          Math.max(4, Math.min(h - tooltipHeight - 4, y)) + "px";
        element.style.display = "";
      });
    };

    worker.onmessage = handleMessage;
    sendCommand({
      type: "viewport",
      payload: { width, height, devicePixelRatio },
    });

    return () => {
      if (worker.onmessage === handleMessage) worker.onmessage = null;
      sendCommandRef.current = () => undefined;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let timer = 0;
    let index = 0;
    const colors = theme.colors;
    const previousByType = lastSentByTypeRef.current;
    const forceAll = lastSentThemeRef.current !== theme;
    const changed = new Set<string>();
    const byType = new Map<string, DataPoint[]>();

    const schedule = (task: () => void): void => {
      timer = window.setTimeout(task, 0);
    };

    const sendJobs = (
      jobs: readonly {
        source: string;
        items: DataPoint[];
      }[],
      jobIndex = 0,
      offset = 0,
    ): void => {
      if (cancelled) return;
      const job = jobs[jobIndex];
      if (!job) {
        lastSentThemeRef.current = theme;
        return;
      }

      const end = Math.min(
        offset + RENDER_POLICY.dataChunkSize,
        job.items.length,
      );
      const chunk: DataPoint[] = [];
      for (let itemIndex = offset; itemIndex < end; itemIndex++) {
        const item = job.items[itemIndex];
        if (item) chunk.push(slimPoint(item));
      }
      sendCommandRef.current({
        type: "data",
        payload: {
          source: job.source,
          data: chunk,
          colors,
          reset: offset === 0,
          done: end >= job.items.length,
        },
      });

      if (end < job.items.length) {
        schedule(() => sendJobs(jobs, jobIndex, end));
        return;
      }
      lastSentByTypeRef.current.set(job.source, job.items);
      schedule(() => sendJobs(jobs, jobIndex + 1));
    };

    const finishScan = (): void => {
      if (forceAll) {
        byType.set("quakes", []);
        changed.add("quakes");
      }
      for (const [source, previous] of previousByType) {
        const current = byType.get(source);
        if (current) {
          if (current.length !== previous.length) changed.add(source);
          continue;
        }
        if (previous.length > 0 || forceAll) {
          byType.set(source, []);
          changed.add(source);
        }
      }

      const jobs: { source: string; items: DataPoint[] }[] = [];
      for (const source of changed) {
        jobs.push({ source, items: byType.get(source) ?? [] });
      }
      if (jobs.length === 0) {
        lastSentThemeRef.current = theme;
        return;
      }
      sendJobs(jobs);
    };

    const scan = (): void => {
      if (cancelled) return;
      const end = Math.min(
        index + RENDER_POLICY.dataChunkSize,
        data.length,
      );
      for (; index < end; index++) {
        const item = data[index];
        if (!item || item.type === "quakes") continue;
        let bucket = byType.get(item.type);
        if (!bucket) {
          bucket = [];
          byType.set(item.type, bucket);
        }
        const sourceIndex = bucket.length;
        bucket.push(item);
        if (
          forceAll ||
          previousByType.get(item.type)?.[sourceIndex] !== item
        ) {
          changed.add(item.type);
        }
      }
      if (index < data.length) {
        schedule(scan);
        return;
      }
      finishScan();
    };

    schedule(scan);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [data, dataVersion, theme]);
  useEffect(() => {
    const cyc = cycloneFilter;
    let selectedItem: SelectedRenderItem | null = null;
    if (selected) {
      selectedItem = {
        id: selected.id,
        type: selected.type,
        lat: selected.lat,
        lon: selected.lon,
        trail: getTrail(selected.id),
        route: getSelectedRoute(selected.id),
      };
    }
    const prefersReducedMotion =
      typeof window.matchMedia === "function" &&
      window.matchMedia(
        "(prefers-reduced-motion: reduce)",
      ).matches;
    sendCommandRef.current({
      type: "presentation",
      payload: {
        flat,
        autoRotate,
        rotationSpeed,
        selectedId: selected?.id ?? null,
        isolatedId,
        isolateMode,
        layers,
        aircraftFilter: {
          enabled: aircraftFilter.enabled,
          showAirborne: aircraftFilter.showAirborne,
          showGround: aircraftFilter.showGround,
          squawks: Array.from(aircraftFilter.squawks),
          countries: Array.from(aircraftFilter.countries),
          milFilter: aircraftFilter.milFilter ?? "all",
        },
        searchMatchIds: searchMatchIds
          ? Array.from(searchMatchIds)
          : null,
        selectedItem,
        cyclonesShowForecast: cyc?.showForecast ?? true,
        cyclonesShowCone: cyc?.showCone ?? true,
        cyclonesShowWindField: cyc?.showWindField ?? false,
        cyclonesShowWarnings: cyc?.showWarnings ?? true,
        cyclonesShowModels: cyc?.showModels ?? false,
        cyclonesHiddenModels: cyc?.hiddenModels ?? [],
        prefersReducedMotion,
      },
    });
  }, [
    aircraftFilter,
    autoRotate,
    cycloneFilter,
    data,
    flat,
    isolatedId,
    isolateMode,
    layers,
    rotationSpeed,
    searchMatchIds,
    selected,
  ]);


  useEffect(() => {
    sendCommandRef.current({
      type: "warnings",
      payload: {
        features: cycloneWarnings ?? [],
        warningColor: theme.colors.cycWarning,
        watchColor: theme.colors.cycWatch,
      },
    });
  }, [cycloneWarnings, theme]);

  useEffect(() => {
    let cancelled = false;
    let frame = 0;
    let offset = 0;
    const ids: string[] = [];
    const values: number[] = [];
    const timestamps: number[] = [];
    const weatherFeatures: {
      id: string;
      kind: string;
      geometry: unknown;
    }[] = [];

    const scan = (): void => {
      if (cancelled) return;
      const end = Math.min(
        offset + RENDER_POLICY.dataChunkSize,
        data.length,
      );
      for (; offset < end; offset++) {
        const item = data[offset];
        if (!item) continue;
        if (item.type === "weather") {
          const weather = item.data;
          if ("geometry" in weather && weather.geometry) {
            weatherFeatures.push({
              id: item.id,
              kind:
                weatherSeverityRank(weather.severity) >= 3
                  ? "warning"
                  : "watch",
              geometry: weather.geometry,
            });
          }
        }
        if (item.type !== "aircraft" && item.type !== "ships") {
          continue;
        }
        const last = getTrail(item.id).at(-1);
        if (!last) continue;
        ids.push(item.id);
        const course =
          item.type === "ships"
            ? item.data.cog ?? item.data.heading ?? 0
            : item.data.heading ?? 0;
        values.push(
          last.lat,
          last.lon,
          course,
          item.data.speedMps ?? 0,
        );
        timestamps.push(last.ts);
      }
      if (offset < data.length) {
        frame = requestAnimationFrame(scan);
        return;
      }
      const packedValues = new Float32Array(values);
      const packedTimestamps = new Float64Array(timestamps);
      sendCommandRef.current(
        {
          type: "trails",
          ids,
          values: packedValues,
          timestamps: packedTimestamps,
        },
        [packedValues.buffer, packedTimestamps.buffer],
      );
      sendCommandRef.current({
        type: "weatherAlerts",
        payload: {
          features: weatherFeatures,
          warningColor: severityMeta("Extreme").ink,
          watchColor: severityMeta("Moderate").ink,
        },
      });
    };

    frame = requestAnimationFrame(scan);
    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
    };
  }, [data, dataVersion, theme]);


  // Playwright reads the worker's sampled camera without owning it.
  useEffect(() => {
    const project = (lat: number, lon: number) => {
      const { w: width, h: height } = sizeRef.current;
      const cam = camRef.current;
      if (propsRef.current.flat) {
        const metrics = getFlatMetrics(
          width,
          height,
          cam.zoomFlat,
          cam.panX,
          cam.panY,
        );
        return projFlat(
          lat,
          lon,
          metrics.cx,
          metrics.cy,
          metrics.mW,
          metrics.mH,
        );
      }
      const radius = Math.min(width, height) * 0.4 * cam.zoomGlobe;
      return projGlobe(
        lat,
        lon,
        width / 2,
        height / 2,
        radius,
        cam.rotY,
        cam.rotX,
      );
    };
    Object.defineProperty(globalThis, "__projectLatLon", {
      configurable: true,
      value: project,
    });
    return () => {
      Reflect.deleteProperty(globalThis, "__projectLatLon");
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
        const dpr = Math.min(
          window.devicePixelRatio || 1,
          RENDER_POLICY.maxDevicePixelRatio,
        );
        const w = par.clientWidth,
          h = par.clientHeight;
        if (w === 0 || h === 0) return;
        canvas.style.width = w + "px";
        canvas.style.height = h + "px";
        sizeRef.current = { w, h };
        sendCommandRef.current({
          type: "viewport",
          payload: { width: w, height: h, devicePixelRatio: dpr },
        });
      });
    };
    const dpr = Math.min(
      window.devicePixelRatio || 1,
      RENDER_POLICY.maxDevicePixelRatio,
    );
    const w = par.clientWidth,
      h = par.clientHeight;
    if (w > 0 && h > 0) {
      canvas.style.width = w + "px";
      canvas.style.height = h + "px";
      sizeRef.current = { w, h };
      sendCommandRef.current({
        type: "viewport",
        payload: { width: w, height: h, devicePixelRatio: dpr },
      });
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
      sendInput: (payload) =>
        sendCommandRef.current({ type: "input", payload }),
      onMiddleClick: () => propsRef.current.onMiddleClick?.(),
    });

    attachInputHandlers(canvas, handlers);
    return () => detachInputHandlers(canvas, handlers);
  }, []);

  useEffect(() => {
    setTrailTooltip(null);
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
            typeof window !== "undefined" && isMobileWidth(window.innerWidth)
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
