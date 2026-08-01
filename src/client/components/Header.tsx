import { useState, useEffect, useMemo } from "react";
import { useTheme } from "@/context/ThemeContext";
import { LayoutMode, useLayoutMode } from "@/layout-mode";
import { getColorMap } from "@/config/theme";

import { featureList } from "@/features/registry";
import type { AircraftFilter } from "@/features/tracking/aircraft/types";
import { AircraftFilterControl } from "@/features/tracking/aircraft";
import { Tooltip, TooltipPlacement } from "@/components/Tooltip";
import { AlertTriangle, Settings, Smartphone, Monitor } from "lucide-react";
import { shouldShowCyclonesToggle } from "../../shared/cyclonesSeason";
import { useAlwaysShowCyclones } from "@/preferences/cyclones";
import {
  buildSourceStatusMap,
  type SourceStatusEntry,
} from "@/lib/net/sourceHealth";
import { Domain } from "@shared/domain/identity";
import { isSourceDown, SourceStatus } from "@shared/domain/sourceStatus";
import { SettingsModal } from "@/settings";
import { ThemeMode } from "@/theme";

enum HeaderLabel {
  Hide = "Hide",
  OpenSettings = "Open settings",
  Settings = "Settings",
  Show = "Show",
}

enum HeaderTourTarget {
  AircraftFilter = "aircraft-filter",
  Brand = "header-brand",
  LayerToggles = "layer-toggles",
  LayoutMode = "layout-mode-toggle",
  Search = "search",
  Settings = "settings-button",
}

enum HeaderColorSuffix {
  ActiveBackground = "15",
  ActiveBorder = "50",
}

enum HeaderCssValue {
  LayerIconSize = "var(--sig-text-icon)",
}

enum HeaderIconSize {
  Compact = 14,
  SettingsDesktop = 15,
  SourceError = 10,
}

enum HeaderIconStrokeWidth {
  Emphasis = 2.5,
  Standard = 2,
}

enum HeaderTiming {
  ClockRefreshMs = 1_000,
}

enum HeaderLocale {
  UnitedStatesEnglish = "en-US",
}

enum HeaderDateStyle {
  Numeric = "numeric",
  Short = "short",
}

const HEADER_TIME_FORMAT: Intl.DateTimeFormatOptions = {
  hour12: false,
};

const HEADER_DATE_FORMAT: Intl.DateTimeFormatOptions = {
  year: HeaderDateStyle.Numeric,
  month: HeaderDateStyle.Short,
  day: HeaderDateStyle.Numeric,
};

type HeaderProps = {
  readonly layers: Record<string, boolean>;
  readonly toggleLayer: (key: string) => void;
  readonly counts: Record<string, number>;
  readonly dataSources: readonly SourceStatusEntry[];
  readonly aircraftFilter: AircraftFilter;
  readonly setAircraftFilter: React.Dispatch<
    React.SetStateAction<AircraftFilter>
  >;
  readonly availableCountries: string[];
  readonly searchSlot?: React.ReactNode;
};

function LayerToggle({
  label,
  icon: Icon,
  on,
  color,
  count,
  down,
  reason,
  iconProps,
  onToggle,
}: {
  readonly label: string;
  readonly icon: React.ForwardRefExoticComponent<any>;
  readonly on: boolean;
  readonly color: string;
  readonly count: number;
  readonly down: boolean;
  readonly reason: string | null;
  readonly iconProps: Record<string, unknown>;
  readonly onToggle: () => void;
}) {
  const downText = reason
    ? `${label} offline: ${reason}`
    : `${label} offline`;
  const visibilityAction = on ? HeaderLabel.Hide : HeaderLabel.Show;
  const tooltipText = down ? downText : `${visibilityAction} ${label}`;

  return (
    <Tooltip
      content={tooltipText}
      placement={TooltipPlacement.Bottom}
    >
      <button
        type="button"
        onClick={onToggle}
        aria-label={`Toggle ${label} layer`}
        aria-pressed={on}
        // Explicit off-state colors keep the icon visible after a toggle.
        className="flex items-center gap-0.5 sm:gap-1 px-1 sm:px-1.5 md:px-2 py-0.5 rounded tracking-wide transition-all font-semibold text-(length:--sig-text-btn) border shrink-0 touch-target justify-center sm:justify-start focus:outline-none focus-visible:ring-2 focus-visible:ring-sig-accent"
        style={{
          color: on ? color : "var(--sigint-dim)",
          background: on
            ? `${color}${HeaderColorSuffix.ActiveBackground}`
            : undefined,
          borderColor: on
            ? `${color}${HeaderColorSuffix.ActiveBorder}`
            : "var(--sigint-border)",
        }}
      >
        <Icon
          aria-hidden="true"
          {...iconProps}
          style={{
            width: HeaderCssValue.LayerIconSize,
            height: HeaderCssValue.LayerIconSize,
          }}
        />
        <span className="hidden sm:inline-flex items-center min-h-lh">
          {down && count === 0 ? (
            <AlertTriangle
              size={HeaderIconSize.SourceError}
              strokeWidth={HeaderIconStrokeWidth.Emphasis}
              className="text-sig-dim opacity-60"
              aria-label={`${label} source offline`}
            />
          ) : (
            count
          )}
        </span>
      </button>
    </Tooltip>
  );
}

function shouldShowLayerToggle(
  featureId: string,
  alwaysShowCyclones: boolean,
  sourceStatusMap: ReadonlyMap<string, SourceStatusEntry>,
): boolean {
  if (
    featureId === Domain.Aircraft ||
    featureId === Domain.CyclonesForecast ||
    featureId === Domain.CyclonesWarning
  ) {
    return false;
  }
  if (featureId !== Domain.Cyclones) return true;
  if (alwaysShowCyclones) return true;

  const cyclonesEmpty =
    sourceStatusMap.get(Domain.Cyclones)?.status === SourceStatus.Empty;
  return shouldShowCyclonesToggle(cyclonesEmpty ? 0 : 1);
}

function Toggles({
  layers,
  toggleLayer,
  counts,
  dataSources,
  aircraftFilter,
  setAircraftFilter,
  availableCountries,
  searchSlot,
}: Readonly<HeaderProps>) {
  const { theme, resolvedMode } = useTheme();
  const colors = theme.colors;
  const colorMap = getColorMap(theme);
  const sourceStatusMap = useMemo(
    () => buildSourceStatusMap(dataSources),
    [dataSources],
  );
  const alwaysShowCyclones = useAlwaysShowCyclones();

  return (
    <>
      <div data-tour={HeaderTourTarget.Search}>{searchSlot}</div>
      <div className="w-px h-4 shrink-0 bg-sig-border/40 mx-0.5" />
      <div
        data-tour={HeaderTourTarget.LayerToggles}
        className="flex items-center gap-0.5 sm:gap-1"
      >
        {featureList
          .filter((feature) =>
            shouldShowLayerToggle(
              feature.id,
              alwaysShowCyclones,
              sourceStatusMap,
            ),
          )
          .map((feature) => {
            const on = layers[feature.id] ?? false;
            const color = colorMap[feature.id] ?? colors.dim;
            const entry = sourceStatusMap.get(feature.id);
            const count = counts[feature.id] ?? 0;
            const down = isSourceDown(entry?.status);
            return (
              <LayerToggle
                key={feature.id}
                label={feature.label}
                icon={feature.icon}
                on={on}
                color={color}
                count={count}
                down={down}
                reason={entry?.error ?? null}
                iconProps={feature.iconProps}
                onToggle={() => toggleLayer(feature.id)}
              />
            );
          })}
        <div data-tour={HeaderTourTarget.AircraftFilter}>
          <AircraftFilterControl
            aircraftFilter={aircraftFilter}
            setAircraftFilter={setAircraftFilter}
            aircraftCount={counts[Domain.Aircraft] ?? 0}
            aircraftColor={
              colorMap[Domain.Aircraft] ?? colors.aircraft
            }
            availableCountries={availableCountries}
            colors={{
              panel: colors.panel,
              border: colors.border,
              bright:
                resolvedMode === ThemeMode.Dark
                  ? "#00b8d4"
                  : colors.accent,
              dim: colors.dim,
              danger: colors.danger,
            }}
        />
        </div>
      </div>
    </>
  );
}

type LayoutModePresentation = Readonly<{
  label: string;
  tooltip: string;
}>;

const LAYOUT_MODE_PRESENTATION: Readonly<
  Record<LayoutMode, LayoutModePresentation>
> = {
  [LayoutMode.Auto]: {
    label: "AUTO",
    tooltip: "Layout: Auto (viewport-based); click to force mobile",
  },
  [LayoutMode.Mobile]: {
    label: "MOBILE",
    tooltip: "Layout: Forced mobile; click to force desktop",
  },
  [LayoutMode.Desktop]: {
    label: "DESKTOP",
    tooltip: "Layout: Forced desktop; click for auto",
  },
};

function LayoutModeToggle() {
  const { mode, cycleMode, isMobile } = useLayoutMode();
  const Icon = isMobile ? Smartphone : Monitor;
  const isForced = mode !== LayoutMode.Auto;
  const presentation = LAYOUT_MODE_PRESENTATION[mode];

  return (
    <Tooltip
      content={presentation.tooltip}
      placement={TooltipPlacement.Bottom}
    >
      <button
        data-tour={HeaderTourTarget.LayoutMode}
        onClick={cycleMode}
        className={`p-1.5 rounded transition-colors touch-target flex items-center justify-center gap-1 ${
          isForced
            ? "text-sig-accent"
            : "text-sig-dim hover:text-sig-accent"
        }`}
        aria-label={`Layout mode: ${presentation.label}`}
      >
        <Icon
          size={HeaderIconSize.Compact}
          strokeWidth={HeaderIconStrokeWidth.Standard}
        />
        {isForced && (
          <span className="text-[8px] tracking-widest font-bold hidden sm:inline">
            {presentation.label}
          </span>
        )}
      </button>
    </Tooltip>
  );
}

function HeaderBrand() {
  return (
    <div
      data-tour={HeaderTourTarget.Brand}
      className="flex items-center gap-1.5 sm:gap-2 shrink-0"
    >
      <div className="w-1.5 h-1.5 sm:w-1.75 sm:h-1.75 rounded-full bg-sig-accent shadow-[0_0_8px_var(--sigint-accent)] animate-[pulse_2s_infinite]" />
      <span className="font-bold tracking-[2px] sm:tracking-[2.5px] text-sig-bright text-(length:--sig-text-title)">
        SIGINT
      </span>
      <span className="font-light hidden md:inline text-sig-dim text-(length:--sig-text-subtitle)">
        OSINT LIVE FEED
      </span>
    </div>
  );
}

function HeaderClock({ time }: { readonly time: Date }) {
  return (
    <div className="text-right">
      <div className="font-semibold tracking-wider text-sig-accent text-(length:--sig-text-clock)">
        {time.toLocaleTimeString(
          HeaderLocale.UnitedStatesEnglish,
          HEADER_TIME_FORMAT,
        )}
      </div>
      <div className="tracking-wide hidden sm:block text-sig-dim text-(length:--sig-text-sm)">
        {time.toLocaleDateString(
          HeaderLocale.UnitedStatesEnglish,
          HEADER_DATE_FORMAT,
        )}
      </div>
    </div>
  );
}

function SettingsButton({
  iconSize,
  onOpen,
  showTooltip,
}: {
  readonly iconSize: HeaderIconSize;
  readonly onOpen: () => void;
  readonly showTooltip: boolean;
}) {
  const button = (
    <button
      type="button"
      data-tour={HeaderTourTarget.Settings}
      aria-label={HeaderLabel.OpenSettings}
      onClick={onOpen}
      className="p-1.5 rounded text-sig-dim hover:text-sig-accent transition-colors touch-target flex items-center justify-center"
      title={showTooltip ? undefined : HeaderLabel.Settings}
    >
      <Settings
        size={iconSize}
        strokeWidth={HeaderIconStrokeWidth.Standard}
        aria-hidden={true}
      />
    </button>
  );
  return showTooltip ? (
    <Tooltip
      content={HeaderLabel.Settings}
      placement={TooltipPlacement.Bottom}
    >
      {button}
    </Tooltip>
  ) : button;
}

export function Header(props: Readonly<HeaderProps>) {
  const [time, setTime] = useState(new Date());
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const intervalId = setInterval(
      () => setTime(new Date()),
      HeaderTiming.ClockRefreshMs,
    );
    return () => clearInterval(intervalId);
  }, []);

  const openSettings = () => setShowSettings(true);

  return (
    <div className="shrink-0 border-b border-sig-border bg-sig-panel/95">
      <div className="hidden xl:flex items-center gap-1.5 px-3 md:px-4 py-1.5">
        <HeaderBrand />

        <div className="w-px h-4 shrink-0 bg-sig-border/40 mx-1" />

        <div className="flex items-center justify-center gap-1.5 flex-1 min-w-0">
          <Toggles {...props} />
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          <HeaderClock time={time} />
          <LayoutModeToggle />
          <SettingsButton
            iconSize={HeaderIconSize.SettingsDesktop}
            onOpen={openSettings}
            showTooltip={true}
          />
        </div>
      </div>

      <div className="xl:hidden">
        <div className="flex items-center justify-between px-2 sm:px-3 py-1 sm:py-1.5">
          <HeaderBrand />
          <div className="flex items-center gap-1.5 shrink-0">
            <HeaderClock time={time} />
            <LayoutModeToggle />
            <SettingsButton
              iconSize={HeaderIconSize.Compact}
              onOpen={openSettings}
              showTooltip={false}
            />
          </div>
        </div>
        <div className="flex items-center justify-center gap-0.5 sm:gap-1.5 px-1.5 sm:px-3 pb-1 sm:pb-1.5 flex-wrap">
          <Toggles {...props} />
        </div>
      </div>

      {showSettings && <SettingsModal onClose={() => setShowSettings(false)} />}
    </div>
  );
}
