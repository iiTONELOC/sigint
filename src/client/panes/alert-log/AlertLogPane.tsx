import { useState, useMemo, useCallback, useRef, useEffect } from "react";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import { getColorMap } from "@/config/theme";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  Bell,
  Locate,
  Plane,
  Anchor,
  Zap,
  Activity,
  Flame,
  CloudAlert,
} from "lucide-react";

// ── Constants ───────────────────────────────────────────────────────

const ROW_HEIGHT = 56;
const OVERSCAN = 6;

// ── Alert types ──────────────────────────────────────────────────────

type AlertItem = {
  item: DataPoint;
  alertLabel: string;
  priority: number;
};

// ── Detect notable items ─────────────────────────────────────────────

function extractAlerts(allData: DataPoint[]): AlertItem[] {
  const alerts: AlertItem[] = [];

  for (const item of allData) {
    const d = item.data as Record<string, unknown>;

    if (item.type === "aircraft") {
      const sq = (d.squawk as string) ?? "";
      if (sq === "7700") {
        alerts.push({ item, alertLabel: "SQUAWK 7700 — EMERGENCY", priority: 10 });
      } else if (sq === "7600") {
        alerts.push({ item, alertLabel: "SQUAWK 7600 — RADIO FAILURE", priority: 9 });
      } else if (sq === "7500") {
        alerts.push({ item, alertLabel: "SQUAWK 7500 — HIJACK", priority: 10 });
      }
      continue;
    }

    if (item.type === "events") {
      const sev = (d.severity as number) ?? 0;
      if (sev >= 4) {
        alerts.push({
          item,
          alertLabel: sev >= 5 ? "CRISIS EVENT" : "CONFLICT EVENT",
          priority: sev >= 5 ? 8 : 6,
        });
      }
      continue;
    }

    if (item.type === "quakes") {
      const mag = (d.magnitude as number) ?? 0;
      if (mag >= 4.5) {
        const tsunami = d.tsunami === true;
        alerts.push({
          item,
          alertLabel: `M${mag.toFixed(1)} EARTHQUAKE${tsunami ? " — TSUNAMI" : ""}`,
          priority: mag >= 6 ? 9 : mag >= 5 ? 7 : 5,
        });
      }
      continue;
    }

    if (item.type === "fires") {
      const frp = (d.frp as number) ?? 0;
      if (frp >= 50) {
        alerts.push({
          item,
          alertLabel: `HIGH-INTENSITY FIRE — FRP ${frp.toFixed(0)} MW`,
          priority: frp >= 100 ? 7 : 5,
        });
      }
      continue;
    }

    if (item.type === "weather") {
      const sev = (d.severity as string) ?? "";
      if (sev === "Extreme" || sev === "Severe") {
        alerts.push({
          item,
          alertLabel: `${sev.toUpperCase()} — ${(d.event as string) || "WEATHER ALERT"}`,
          priority: sev === "Extreme" ? 8 : 6,
        });
      }
      continue;
    }
  }

  // Filter to last 24h only
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const recent = alerts.filter((a) => {
    if (!a.item.timestamp) return true; // no timestamp = treat as current
    return new Date(a.item.timestamp).getTime() > cutoff;
  });

  // Sort by timestamp descending (newest first)
  recent.sort((a, b) => {
    const ta = a.item.timestamp ? new Date(a.item.timestamp).getTime() : Date.now();
    const tb = b.item.timestamp ? new Date(b.item.timestamp).getTime() : Date.now();
    return tb - ta;
  });

  return recent;
}

// ── Helpers ──────────────────────────────────────────────────────────

function relativeAge(timestamp?: string): string {
  if (!timestamp) return "";
  const diff = Date.now() - new Date(timestamp).getTime();
  if (diff < 60_000) return "now";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h`;
  return `${Math.floor(hrs / 24)}d`;
}

function getDetail(item: DataPoint): string {
  const d = item.data as Record<string, unknown>;
  switch (item.type) {
    case "aircraft":
      return `${((d.callsign as string) ?? "").trim() || (d.icao24 as string) || ""} · ${(d.originCountry as string) || ""}`;
    case "events":
      return (d.headline as string) || "";
    case "quakes":
      return (d.location as string) || "";
    case "fires":
      return `${(d.satellite as string) || "VIIRS"} · ${(d.confidence as string) || ""}`;
    case "weather":
      return (d.areaDesc as string)?.split(";")[0]?.trim() || "";
    default:
      return "";
  }
}

const TYPE_ICONS: Record<string, typeof Plane> = {
  aircraft: Plane,
  ships: Anchor,
  events: Zap,
  quakes: Activity,
  fires: Flame,
  weather: CloudAlert,
};

function getPrioBorderClass(priority: number): string {
  if (priority >= 8) return "border-l-sig-danger";
  if (priority >= 5) return "border-l-yellow-400";
  return "border-l-sig-accent";
}

function getPrioTextClass(priority: number): string {
  if (priority >= 8) return "text-sig-danger";
  if (priority >= 5) return "text-yellow-400";
  return "text-sig-accent";
}

// ── Component ───────────────────────────────────────────────────────

export function AlertLogPane() {
  const { allData, selectedCurrent, setSelected, setZoomToId } = useData();
  const { theme } = useTheme();
  const colorMap = useMemo(() => getColorMap(theme), [theme]);

  const alerts = useMemo(() => extractAlerts(allData), [allData]);

  // ── Virtual scroll state ────────────────────────────────────────
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportH, setViewportH] = useState(0);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const obs = new ResizeObserver((entries) => {
      for (const entry of entries) setViewportH(entry.contentRect.height);
    });
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  const onScroll = useCallback(() => {
    if (scrollRef.current) setScrollTop(scrollRef.current.scrollTop);
  }, []);

  // ── Virtual window ──────────────────────────────────────────────

  const totalHeight = alerts.length * ROW_HEIGHT;
  const startIdx = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const endIdx = Math.min(
    alerts.length,
    Math.ceil((scrollTop + viewportH) / ROW_HEIGHT) + OVERSCAN,
  );
  const offsetY = startIdx * ROW_HEIGHT;
  const visibleAlerts = useMemo(
    () => alerts.slice(startIdx, endIdx),
    [alerts, startIdx, endIdx],
  );

  // ── Handlers ────────────────────────────────────────────────────

  const handleClick = useCallback(
    (item: DataPoint) => setSelected(item),
    [setSelected],
  );

  const handleZoom = useCallback(
    (item: DataPoint, e: React.MouseEvent) => {
      e.stopPropagation();
      setSelected(item);
      setZoomToId(item.id);
      setTimeout(() => setZoomToId(null), 100);
    },
    [setSelected, setZoomToId],
  );

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center gap-1.5 px-2 py-1 border-b border-sig-border/40">
        <Bell size={11} strokeWidth={2.5} className="text-sig-danger" />
        <span className="text-sig-danger text-(length:--sig-text-sm) tracking-wider font-semibold">
          ALERTS
        </span>
        <div className="flex-1" />
        <span className="text-sig-dim text-(length:--sig-text-sm)">
          {alerts.length} active
        </span>
      </div>

      {/* Virtual scrolling alert list */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto sigint-scroll"
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}>
            {visibleAlerts.map((alert, localIdx) => {
              const Icon = TYPE_ICONS[alert.item.type] ?? Activity;
              const color = colorMap[alert.item.type] ?? theme.colors.dim;
              const isSelected = selectedCurrent?.id === alert.item.id;
              const age = relativeAge(alert.item.timestamp);
              const detail = getDetail(alert.item);
              const borderCls = getPrioBorderClass(alert.priority);
              const textCls = getPrioTextClass(alert.priority);

              return (
                <div
                  key={`${alert.item.id}-${startIdx + localIdx}`}
                  onClick={() => handleClick(alert.item)}
                  className={`px-3 py-1.5 border-b border-sig-border/20 border-l-2 cursor-pointer transition-colors ${borderCls} ${
                    isSelected
                      ? "bg-sig-accent/10"
                      : "bg-transparent hover:bg-sig-panel/40"
                  }`}
                  style={{ height: ROW_HEIGHT }}
                >
                  <div className="flex items-center gap-2">
                    <Icon
                      size={12}
                      strokeWidth={2.5}
                      style={{ color }}
                      className="shrink-0"
                    />
                    <span className={`text-(length:--sig-text-sm) font-bold tracking-wider truncate ${textCls}`}>
                      {alert.alertLabel}
                    </span>
                    <span className="ml-auto text-(length:--sig-text-sm) text-sig-dim shrink-0">
                      {age}
                    </span>
                  </div>
                  <div className="text-sig-text text-(length:--sig-text-sm) mt-0.5 truncate ml-5">
                    {detail}
                  </div>
                  <div className="flex items-center mt-0.5 ml-5">
                    <div className="flex-1" />
                    <button
                      onClick={(e) => handleZoom(alert.item, e)}
                      className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
                      title="Zoom to"
                    >
                      <Locate size={11} strokeWidth={2.5} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {alerts.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-sig-dim">
            <Bell size={24} className="opacity-20 mb-2" />
            <span className="text-(length:--sig-text-md)">No active alerts</span>
            <span className="text-(length:--sig-text-sm) mt-1 text-center px-4">
              Monitoring for squawk codes, severe weather, large quakes, high-FRP fires, crisis events
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
