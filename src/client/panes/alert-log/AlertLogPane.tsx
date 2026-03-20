import { useState, useMemo, useCallback, useEffect } from "react";
import { useData } from "@/context/DataContext";
import { useTheme } from "@/context/ThemeContext";
import { useVirtualScroll } from "@/hooks/useVirtualScroll";
import { cacheGet, cacheSet } from "@/lib/storageService";
import { CACHE_KEYS } from "@/lib/cacheKeys";
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
  XCircle,
  Trash2,
  Clock,
} from "lucide-react";
import { relativeAge } from "@/lib/timeFormat";

// ── Constants ───────────────────────────────────────────────────────

const ROW_HEIGHT = 72;
const OVERSCAN = 6;

// ── Dismissed alerts persistence ────────────────────────────────────

function loadDismissed(): Set<string> {
  const arr = cacheGet<string[]>(CACHE_KEYS.dismissedAlerts);
  return new Set(Array.isArray(arr) ? arr : []);
}

function persistDismissed(ids: Set<string>): void {
  cacheSet(CACHE_KEYS.dismissedAlerts, Array.from(ids));
}

// ── Helpers ─────────────────────────────────────────────────────────

const TYPE_ICONS: Record<string, typeof Plane> = {
  aircraft: Plane,
  ships: Anchor,
  events: Zap,
  quakes: Activity,
  fires: Flame,
  weather: CloudAlert,
};

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

function scoreBorderClass(score: number): string {
  if (score >= 8) return "border-l-sig-danger";
  if (score >= 5) return "border-l-[var(--sigint-warn)]";
  return "border-l-sig-accent";
}

function scoreTextClass(score: number): string {
  if (score >= 8) return "text-sig-danger";
  if (score >= 5) return "text-[var(--sigint-warn)]";
  return "text-sig-accent";
}

function scoreBadgeClass(score: number): string {
  if (score >= 8) return "text-red-400 bg-red-400/10 border-red-400/30";
  if (score >= 5)
    return "text-orange-400 bg-orange-400/10 border-orange-400/30";
  return "text-yellow-400 bg-yellow-400/10 border-yellow-400/30";
}

// ── Component ───────────────────────────────────────────────────────

export function AlertLogPane() {
  const {
    selectedCurrent,
    setSelected,
    selectAndZoom,
    setRevealId,
    colorMap,
    correlation,
    watchActive,
    watchMode,
    watchProgress,
  } = useData();
  const { theme } = useTheme();

  const alerts = correlation.alerts;

  // ── Dismissed state ─────────────────────────────────────────────

  const [dismissed, setDismissed] = useState<Set<string>>(loadDismissed);

  const dismissAlert = useCallback((id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(id);
      persistDismissed(next);
      return next;
    });
  }, []);

  const clearAllDismissed = useCallback(() => {
    setDismissed(new Set());
    persistDismissed(new Set());
  }, []);

  // ── Filter / sort ───────────────────────────────────────────────

  const [filterType, setFilterType] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<"score" | "time">("score");

  const filteredAlerts = useMemo(() => {
    let list = alerts.filter((a) => !dismissed.has(a.item.id));
    if (filterType) list = list.filter((a) => a.item.type === filterType);
    if (sortBy === "time") {
      list = [...list].sort((a, b) => {
        const ta = a.item.timestamp
          ? new Date(a.item.timestamp).getTime()
          : Date.now();
        const tb = b.item.timestamp
          ? new Date(b.item.timestamp).getTime()
          : Date.now();
        return tb - ta;
      });
    }
    return list;
  }, [alerts, dismissed, filterType, sortBy]);

  const activeCount = alerts.filter((a) => !dismissed.has(a.item.id)).length;

  // ── Watch — read from shared context (no local WATCH button) ───

  const isWatchingAlerts =
    watchActive &&
    (watchMode.source === "alerts" || watchMode.source === "all");

  // Only highlight/scroll when the current watch item is actually from alerts
  const isAlertActive =
    isWatchingAlerts && watchMode.currentItemSource === "alerts";

  // ── Type counts ─────────────────────────────────────────────────

  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    const visible = alerts.filter((a) => !dismissed.has(a.item.id));
    for (const a of visible)
      counts[a.item.type] = (counts[a.item.type] ?? 0) + 1;
    return counts;
  }, [alerts, dismissed]);

  const filterTypes = useMemo(
    () =>
      Object.keys(typeCounts).sort(
        (a, b) => (typeCounts[b] ?? 0) - (typeCounts[a] ?? 0),
      ),
    [typeCounts],
  );

  // ── Virtual scroll ──────────────────────────────────────────────

  const {
    scrollRef,
    totalHeight,
    offsetY,
    startIdx,
    endIdx,
    onScroll,
    scrollToTop,
    scrollToIndex,
  } = useVirtualScroll({
    itemCount: filteredAlerts.length,
    rowHeight: ROW_HEIGHT,
    overscan: OVERSCAN,
  });

  useEffect(() => {
    scrollToTop();
  }, [filterType, sortBy, scrollToTop]);

  // Auto-scroll to watch target (only when current item is from alerts)
  useEffect(() => {
    if (!isAlertActive || !watchMode.currentId) return;
    const idx = filteredAlerts.findIndex(
      (a) => a.item.id === watchMode.currentId,
    );
    if (idx >= 0) scrollToIndex(idx);
  }, [isAlertActive, watchMode.currentId, filteredAlerts, scrollToIndex]);

  const visibleAlerts = useMemo(
    () => filteredAlerts.slice(startIdx, endIdx),
    [filteredAlerts, startIdx, endIdx],
  );

  // ── Handlers ────────────────────────────────────────────────────

  const handleClick = useCallback(
    (item: DataPoint) => {
      setSelected(item);
      setRevealId(item.id);
      setTimeout(() => setRevealId(null), 200);
    },
    [setSelected, setRevealId],
  );

  const handleZoom = useCallback(
    (item: DataPoint, e: React.MouseEvent) => {
      e.stopPropagation();
      selectAndZoom(item);
    },
    [selectAndZoom],
  );

  // ── Render ──────────────────────────────────────────────────────

  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      {/* ── Toolbar ─────────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-sig-border/40 flex-wrap">
        {/* Watch indicator (no button — controlled from globe) */}
        {isAlertActive && (
          <span className="text-[10px] text-sig-accent tracking-wider font-mono shrink-0 px-1.5 py-0.5 rounded bg-sig-accent/10 border border-sig-accent/30">
            WATCHING {watchMode.index + 1}/{watchMode.items.length}
          </span>
        )}

        <span className="text-sig-danger text-(length:--sig-text-sm) font-semibold shrink-0">
          {activeCount}
        </span>

        <button
          onClick={() => setFilterType(null)}
          className={`px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border ${
            filterType === null
              ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
              : "text-sig-dim bg-transparent border-sig-border/40"
          }`}
        >
          ALL
        </button>
        {filterTypes.map((t) => {
          const Icon = TYPE_ICONS[t] ?? Activity;
          const color = colorMap[t] ?? theme.colors.dim;
          return (
            <button
              key={t}
              onClick={() => setFilterType(filterType === t ? null : t)}
              className={`px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border flex items-center gap-1 ${
                filterType === t
                  ? "text-sig-accent bg-sig-accent/10 border-sig-accent/30"
                  : "text-sig-dim bg-transparent border-sig-border/40"
              }`}
            >
              <Icon size={9} strokeWidth={2.5} style={{ color }} />
              {typeCounts[t]}
            </button>
          );
        })}

        <div className="flex-1" />

        {dismissed.size > 0 && (
          <button
            onClick={clearAllDismissed}
            className="px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border text-sig-dim bg-transparent border-sig-border/40 hover:text-sig-bright"
            title={`Restore ${dismissed.size} dismissed alert${dismissed.size > 1 ? "s" : ""}`}
          >
            <Trash2 size={9} strokeWidth={2.5} className="inline mr-0.5" />
            {dismissed.size}
          </button>
        )}

        <button
          onClick={() => setSortBy((s) => (s === "score" ? "time" : "score"))}
          className="px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border text-sig-dim bg-transparent border-sig-border/40 hover:text-sig-bright flex items-center gap-1"
          title={
            sortBy === "score"
              ? "Sorted by score — click for time"
              : "Sorted by time — click for score"
          }
        >
          {sortBy === "score" ? (
            <>
              <Zap size={9} strokeWidth={2.5} /> SCORE
            </>
          ) : (
            <>
              <Clock size={9} strokeWidth={2.5} /> NEW
            </>
          )}
        </button>
      </div>

      {/* Watch progress bar */}
      {isAlertActive && (
        <div className="h-0.5 bg-sig-border/20 shrink-0">
          <div
            className="h-full bg-sig-accent transition-all duration-100"
            style={{ width: `${watchProgress * 100}%` }}
          />
        </div>
      )}

      {/* ── Alert list ──────────────────────────────────────────────── */}
      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto sigint-scroll"
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div
            style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}
          >
            {visibleAlerts.map((alert, localIdx) => {
              const Icon = TYPE_ICONS[alert.item.type] ?? Activity;
              const color = colorMap[alert.item.type] ?? theme.colors.dim;
              const isSelected = selectedCurrent?.id === alert.item.id;
              const isWatchTarget =
                isAlertActive && watchMode.currentId === alert.item.id;
              // During ALL watch, suppress selection glow when watch is currently on an intel item
              // During watch, suppress selection highlight when this isn't the active source
              const showSelected =
                isSelected && (!watchActive || isWatchTarget);
              const age = relativeAge(alert.item.timestamp);
              const detail = getDetail(alert.item);
              const borderCls = scoreBorderClass(alert.score);
              const textCls = scoreTextClass(alert.score);

              return (
                <div
                  key={`${alert.item.id}-${startIdx + localIdx}`}
                  onClick={() => handleClick(alert.item)}
                  className={`px-3 py-1.5 border-b border-sig-border/20 border-l-2 cursor-pointer transition-colors ${borderCls} ${
                    isWatchTarget
                      ? "bg-sig-accent/15"
                      : showSelected
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
                    <span
                      className={`text-(length:--sig-text-sm) font-bold tracking-wider truncate ${textCls}`}
                    >
                      {alert.label}
                    </span>
                    <span
                      className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-bold tracking-wider border shrink-0 ${scoreBadgeClass(alert.score)}`}
                    >
                      {alert.score}
                    </span>
                    <span className="ml-auto text-(length:--sig-text-sm) text-sig-dim shrink-0">
                      {age}
                    </span>
                  </div>
                  <div className="text-sig-text text-(length:--sig-text-sm) mt-0.5 truncate ml-5">
                    {detail}
                  </div>
                  <div className="flex items-center mt-0.5 ml-5 gap-1">
                    <span className="text-[9px] text-sig-dim truncate">
                      {alert.factors.join(" · ")}
                    </span>
                    <div className="ml-auto flex items-center shrink-0">
                      <button
                        onClick={(e) => dismissAlert(alert.item.id, e)}
                        className="min-h-11 min-w-11 flex items-center justify-center rounded text-sig-dim bg-transparent border-none hover:text-sig-danger transition-colors"
                        title="Dismiss alert"
                      >
                        <XCircle size={14} strokeWidth={2} />
                      </button>
                      <button
                        onClick={(e) => handleZoom(alert.item, e)}
                        className="min-h-11 min-w-11 flex items-center justify-center rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
                        title="Zoom to"
                      >
                        <Locate size={14} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {filteredAlerts.length === 0 && activeCount > 0 && (
          <div className="flex flex-col items-center justify-center h-full text-sig-dim">
            <Bell size={24} className="opacity-20 mb-2" />
            <span className="text-(length:--sig-text-md)">
              No alerts match filter
            </span>
          </div>
        )}
        {activeCount === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-sig-dim">
            <Bell size={24} className="opacity-20 mb-2" />
            <span className="text-(length:--sig-text-md)">
              {dismissed.size > 0 ? "All alerts dismissed" : "No active alerts"}
            </span>
            <span className="text-(length:--sig-text-sm) mt-1 text-center px-4">
              {dismissed.size > 0
                ? `${dismissed.size} dismissed — click restore button to see them`
                : "Context-scored monitoring for emergency squawks, severe events, large quakes, high-FRP fires, extreme weather"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
