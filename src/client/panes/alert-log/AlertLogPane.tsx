import { useState, useMemo, useCallback, useEffect } from "react";
import { useDataContext } from "@/context/DataContext";
import { useUI } from "@/context/UIContext";
import { useTheme } from "@/theme";
import { useVirtualScroll } from "@/virtual-scroll";
import { cacheGet, cacheSet } from "@/lib/cache";
import { CacheKey } from "@shared/domain/cache";
import type { PointType } from "@shared/domain/pointType";
import { useItemSelectHandlers } from "@/selection";
import type { DataPoint } from "@/features/base/dataPoints";
import { useWatch, WatchSource } from "@/context/WatchContext";
import { ButtonType } from "@/lib/ui/button";
import { EMPTY_TEXT } from "@shared/text";
import { featureRegistry } from "@/features/registry";
import {
  Bell,
  Locate,
  Activity,
  Zap,
  XCircle,
  Trash2,
  Clock,
} from "lucide-react";
import { relativeAge } from "@/time";

enum AlertLogVirtualization {
  Overscan = 6,
  RowHeightPx = 72,
}

enum AlertScoreThreshold {
  Danger = 8,
  Warning = 5,
}

enum AlertScoreTone {
  Danger = "danger",
  Notice = "notice",
  Warning = "warning",
}

type AlertScorePresentation = Readonly<{
  badgeClass: string;
  borderClass: string;
  textClass: string;
}>;

const ALERT_SCORE_PRESENTATION: Readonly<
  Record<AlertScoreTone, AlertScorePresentation>
> = {
  [AlertScoreTone.Danger]: {
    badgeClass: "text-red-400 bg-red-400/10 border-red-400/30",
    borderClass: "border-l-sig-danger",
    textClass: "text-sig-danger",
  },
  [AlertScoreTone.Notice]: {
    badgeClass: "text-yellow-400 bg-yellow-400/10 border-yellow-400/30",
    borderClass: "border-l-sig-accent",
    textClass: "text-sig-accent",
  },
  [AlertScoreTone.Warning]: {
    badgeClass: "text-orange-400 bg-orange-400/10 border-orange-400/30",
    borderClass: "border-l-[var(--sigint-warn)]",
    textClass: "text-[var(--sigint-warn)]",
  },
};

enum AlertSort {
  Score = "score",
  Time = "time",
}

enum AlertLogIconSize {
  Action = 14,
  Empty = 24,
  Filter = 9,
  Row = 12,
}

enum AlertLogIconStrokeWidth {
  Dismiss = 2,
  Standard = 2.5,
}

enum AlertLogProgress {
  Percent = 100,
}

enum AlertLogText {
  FactorSeparator = " · ",
}

enum AlertLogClassName {
  AlertRow = "relative px-3 py-1.5 border-b border-sig-border/20 border-l-2 cursor-pointer transition-colors",
  EmptyIcon = "opacity-20 mb-2",
  EmptyState = "flex flex-col items-center justify-center h-full text-sig-dim",
  EmptyTitle = "text-(length:--sig-text-md)",
  FilterActive = "text-sig-accent bg-sig-accent/10 border-sig-accent/30",
  FilterInactive = "text-sig-dim bg-transparent border-sig-border/40",
  RowSelected = "bg-sig-accent/10",
  RowStandard = "bg-transparent hover:bg-sig-panel/40",
  RowWatchTarget = "bg-sig-accent/15",
}

async function loadDismissed(): Promise<Set<string>> {
  const arr = await cacheGet<string[]>(CacheKey.DismissedAlerts);
  return new Set(Array.isArray(arr) ? arr : []);
}

function persistDismissed(ids: Set<string>): void {
  cacheSet(CacheKey.DismissedAlerts, Array.from(ids));
}

function getDetail(item: DataPoint): string {
  const detail =
    featureRegistry[item.type]?.alertDetail?.(item.data) ?? [];
  return detail.join(AlertLogText.FactorSeparator) || EMPTY_TEXT;
}

function alertScorePresentation(score: number): AlertScorePresentation {
  if (score >= AlertScoreThreshold.Danger) {
    return ALERT_SCORE_PRESENTATION[AlertScoreTone.Danger];
  }
  if (score >= AlertScoreThreshold.Warning) {
    return ALERT_SCORE_PRESENTATION[AlertScoreTone.Warning];
  }
  return ALERT_SCORE_PRESENTATION[AlertScoreTone.Notice];
}

function alertRowBackgroundClass(
  isWatchTarget: boolean,
  isSelected: boolean,
): AlertLogClassName {
  if (isWatchTarget) return AlertLogClassName.RowWatchTarget;
  return isSelected
    ? AlertLogClassName.RowSelected
    : AlertLogClassName.RowStandard;
}

export function AlertLogPane() {
  const { correlation } = useDataContext();
  const {
    selectedCurrent,
    setSelected,
    selectAndZoom,
    setRevealId,
    colorMap,
  } = useUI();
  const {
    watchActive,
    watchMode,
    watchProgress,
  } = useWatch();
  const { theme } = useTheme();

  const alerts = correlation.alerts;

  const [dismissed, setDismissed] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDismissed().then(setDismissed);
  }, []);

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

  const [filterType, setFilterType] = useState<PointType | null>(null);
  const [sortBy, setSortBy] = useState(AlertSort.Score);

  const filteredAlerts = useMemo(() => {
    let list = alerts.filter((a) => !dismissed.has(a.item.id));
    if (filterType) list = list.filter((a) => a.item.type === filterType);
    if (sortBy === AlertSort.Time) {
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

  const isWatchingAlerts =
    watchActive &&
    (watchMode.source === WatchSource.Alerts ||
      watchMode.source === WatchSource.All);

  const isAlertActive =
    isWatchingAlerts &&
    watchMode.currentItemSource === WatchSource.Alerts;

  const typeCounts = useMemo(() => {
    const counts = new Map<PointType, number>();
    const visible = alerts.filter((a) => !dismissed.has(a.item.id));
    for (const alert of visible) {
      counts.set(
        alert.item.type,
        (counts.get(alert.item.type) ?? 0) + 1,
      );
    }
    return counts;
  }, [alerts, dismissed]);

  const filterTypes = useMemo(
    () =>
      [...typeCounts.keys()].sort(
        (left, right) =>
          (typeCounts.get(right) ?? 0) -
          (typeCounts.get(left) ?? 0),
      ),
    [typeCounts],
  );

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
    rowHeight: AlertLogVirtualization.RowHeightPx,
    overscan: AlertLogVirtualization.Overscan,
  });

  useEffect(() => {
    scrollToTop();
  }, [filterType, sortBy, scrollToTop]);

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

  const { handleClick, handleZoom } = useItemSelectHandlers(
    setSelected,
    setRevealId,
    selectAndZoom,
  );

  return (
    <div className="w-full h-full flex flex-col bg-sig-bg overflow-hidden">
      <div className="shrink-0 flex items-center gap-1 px-2 py-1 border-b border-sig-border/40 flex-wrap">
        {isAlertActive && (
          <span className="text-[10px] text-sig-accent tracking-wider font-mono shrink-0 px-1.5 py-0.5 rounded bg-sig-accent/10 border border-sig-accent/30">
            WATCHING {watchMode.index + 1}/{watchMode.items.length}
          </span>
        )}

        <span className="text-sig-danger text-(length:--sig-text-sm) font-semibold shrink-0">
          {activeCount}
        </span>

        <button
          type={ButtonType.Button}
          onClick={() => setFilterType(null)}
          className={`touch-target px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border ${
            filterType === null
              ? AlertLogClassName.FilterActive
              : AlertLogClassName.FilterInactive
          }`}
        >
          ALL
        </button>
        {filterTypes.map((type) => {
          const Icon = featureRegistry[type]?.icon ?? Activity;
          const color = colorMap[type] ?? theme.colors.dim;
          return (
            <button
              type={ButtonType.Button}
              key={type}
              onClick={() =>
                setFilterType(filterType === type ? null : type)
              }
              className={`touch-target px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border flex items-center gap-1 ${
                filterType === type
                  ? AlertLogClassName.FilterActive
                  : AlertLogClassName.FilterInactive
              }`}
            >
              <Icon
                size={AlertLogIconSize.Filter}
                strokeWidth={AlertLogIconStrokeWidth.Standard}
                style={{ color }}
              />
              {typeCounts.get(type)}
            </button>
          );
        })}

        <div className="flex-1" />

        {dismissed.size > 0 && (
          <button
            type={ButtonType.Button}
            onClick={clearAllDismissed}
            className="touch-target px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border text-sig-dim bg-transparent border-sig-border/40 hover:text-sig-bright"
            title={`Restore ${dismissed.size} dismissed alert${dismissed.size > 1 ? "s" : ""}`}
          >
            <Trash2
              size={AlertLogIconSize.Filter}
              strokeWidth={AlertLogIconStrokeWidth.Standard}
              className="inline mr-0.5"
            />
            {dismissed.size}
          </button>
        )}

        <button
          type={ButtonType.Button}
          onClick={() =>
            setSortBy((current) =>
              current === AlertSort.Score
                ? AlertSort.Time
                : AlertSort.Score,
            )
          }
          className="touch-target px-1.5 py-0.5 rounded text-[10px] tracking-wider font-semibold shrink-0 transition-colors border text-sig-dim bg-transparent border-sig-border/40 hover:text-sig-bright flex items-center gap-1"
          title={
            sortBy === AlertSort.Score
              ? "Sorted by score, click for time"
              : "Sorted by time, click for score"
          }
        >
          {sortBy === AlertSort.Score ? (
            <>
              <Zap
                size={AlertLogIconSize.Filter}
                strokeWidth={AlertLogIconStrokeWidth.Standard}
              /> SCORE
            </>
          ) : (
            <>
              <Clock
                size={AlertLogIconSize.Filter}
                strokeWidth={AlertLogIconStrokeWidth.Standard}
              /> NEW
            </>
          )}
        </button>
      </div>

      {isAlertActive && (
        <div className="h-0.5 bg-sig-border/20 shrink-0">
          <div
            className="h-full bg-sig-accent transition-all duration-100"
            style={{
              width: `${watchProgress * AlertLogProgress.Percent}%`,
            }}
          />
        </div>
      )}

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto sigint-scroll"
      >
        <div style={{ height: totalHeight, position: "relative" }}>
          <div
            style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}
          >
            {visibleAlerts.map((alert) => {
              const Icon =
                featureRegistry[alert.item.type]?.icon ?? Activity;
              const color = colorMap[alert.item.type] ?? theme.colors.dim;
              const isSelected = selectedCurrent?.id === alert.item.id;
              const isWatchTarget =
                isAlertActive && watchMode.currentId === alert.item.id;
              const showSelected =
                isSelected && (!watchActive || isWatchTarget);
              const age = relativeAge(alert.item.timestamp);
              const detail = getDetail(alert.item);
              const scorePresentation = alertScorePresentation(
                alert.score,
              );
              const backgroundClass = alertRowBackgroundClass(
                isWatchTarget,
                showSelected,
              );

              return (
                <div
                  key={alert.item.id}
                  className={`${AlertLogClassName.AlertRow} ${scorePresentation.borderClass} ${backgroundClass}`}
                  style={{
                    height: AlertLogVirtualization.RowHeightPx,
                  }}
                >
                  <button
                    type={ButtonType.Button}
                    aria-label={alert.label}
                    onClick={() => handleClick(alert.item)}
                    className="absolute inset-0 w-full h-full bg-transparent border-none cursor-pointer"
                  />
                  <div className="relative flex items-center gap-2 pointer-events-none">
                    <Icon
                      size={AlertLogIconSize.Row}
                      strokeWidth={AlertLogIconStrokeWidth.Standard}
                      style={{ color }}
                      className="shrink-0"
                    />
                    <span
                      className={`text-(length:--sig-text-sm) font-bold tracking-wider truncate ${scorePresentation.textClass}`}
                    >
                      {alert.label}
                    </span>
                    <span
                      className={`inline-flex items-center px-1 py-0 rounded text-[9px] font-bold tracking-wider border shrink-0 ${scorePresentation.badgeClass}`}
                    >
                      {alert.score}
                    </span>
                    <span className="ml-auto text-(length:--sig-text-sm) text-sig-dim shrink-0">
                      {age}
                    </span>
                  </div>
                  <div className="relative text-sig-text text-(length:--sig-text-sm) mt-0.5 truncate ml-5 pointer-events-none">
                    {detail}
                  </div>
                  <div className="relative flex items-center mt-0.5 ml-5 gap-1 pointer-events-none">
                    <span className="text-[9px] text-sig-dim truncate">
                      {alert.factors.join(AlertLogText.FactorSeparator)}
                    </span>
                    <div className="ml-auto flex items-center shrink-0 pointer-events-auto">
                      <button
                        type={ButtonType.Button}
                        onClick={(e) => dismissAlert(alert.item.id, e)}
                        className="min-h-11 min-w-11 flex items-center justify-center rounded text-sig-dim bg-transparent border-none hover:text-sig-danger transition-colors"
                        title="Dismiss alert"
                      >
                        <XCircle
                          size={AlertLogIconSize.Action}
                          strokeWidth={AlertLogIconStrokeWidth.Dismiss}
                        />
                      </button>
                      <button
                        type={ButtonType.Button}
                        onClick={(e) => handleZoom(alert.item, e)}
                        className="min-h-11 min-w-11 flex items-center justify-center rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
                        title="Zoom to"
                      >
                        <Locate
                          size={AlertLogIconSize.Action}
                          strokeWidth={AlertLogIconStrokeWidth.Standard}
                        />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {filteredAlerts.length === 0 && activeCount > 0 && (
          <div className={AlertLogClassName.EmptyState}>
            <Bell
              size={AlertLogIconSize.Empty}
              className={AlertLogClassName.EmptyIcon}
            />
            <span className={AlertLogClassName.EmptyTitle}>
              No alerts match filter
            </span>
          </div>
        )}
        {activeCount === 0 && (
          <div className={AlertLogClassName.EmptyState}>
            <Bell
              size={AlertLogIconSize.Empty}
              className={AlertLogClassName.EmptyIcon}
            />
            <span className={AlertLogClassName.EmptyTitle}>
              {dismissed.size > 0 ? "All alerts dismissed" : "No active alerts"}
            </span>
            <span className="text-(length:--sig-text-sm) mt-1 text-center px-4">
              {dismissed.size > 0
                ? `${dismissed.size} dismissed, click restore to see them`
                : "Context-scored monitoring for emergency squawks, severe events, large quakes, high-FRP fires, extreme weather"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
