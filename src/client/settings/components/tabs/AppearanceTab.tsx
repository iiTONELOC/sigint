import { useCallback, useEffect, useState } from "react";
import {
  Monitor,
  MonitorSmartphone,
  Moon,
  RotateCcw,
  Smartphone,
  Sun,
} from "lucide-react";
import {
  LAYER_COLOR_KEYS,
  LAYER_COLOR_LABELS,
  themes,
  type ColorOverrides,
  type LayerColorKey,
} from "@/config/theme";
import { cacheGet, cacheSet } from "@/lib/cache";
import { ButtonType } from "@/lib/ui/button";
import { LayoutMode, useLayoutMode } from "@/layout-mode";
import {
  setAlwaysShowCyclones,
  useAlwaysShowCyclones,
} from "@/preferences/cyclones";
import {
  setUnitsMode,
  UnitMode,
  useUnitsMode,
} from "@/preferences/units";
import { DomInputType } from "@/runtime";
import { TickerSpeedPolicy } from "@/shell/ticker";
import { ThemeMode, type ResolvedThemeMode } from "@/theme";
import { CacheKey } from "@shared/domain/cache";
import {
  SettingsClassName,
  SettingsIconSize,
} from "../../model";

type AppearanceTabProps = Readonly<{
  colorOverrides: ColorOverrides;
  mode: ThemeMode;
  resetAllColors: () => void;
  resetLayerColor: (key: LayerColorKey) => void;
  resolvedMode: ResolvedThemeMode;
  setLayerColor: (key: LayerColorKey, color: string) => void;
  setMode: (mode: ThemeMode) => void;
}>;

type ThemeOption = Readonly<{
  icon: typeof Monitor;
  label: string;
}>;

type LayoutModeOption = Readonly<{
  description: string;
  icon: typeof Monitor;
}>;

enum AppearanceClassName {
  ColorInput = "w-8 h-8 rounded border-2 border-sig-border/40 bg-transparent p-0 cursor-pointer shrink-0",
  Option = "flex-1 flex flex-col items-center gap-1 px-3 py-2.5 rounded border transition-all",
  UnitOption = "flex-1 px-2 py-2 rounded border text-[10px] font-semibold tracking-wider transition-all",
}

enum TickerSpeedLabel {
  Fast = "FAST",
  Halted = "STOPPED",
  Normal = "NORMAL",
  Slow = "SLOW",
}

const THEME_OPTIONS: Readonly<Record<ThemeMode, ThemeOption>> = {
  [ThemeMode.Auto]: { icon: MonitorSmartphone, label: "AUTO" },
  [ThemeMode.Dark]: { icon: Moon, label: "DARK" },
  [ThemeMode.Light]: { icon: Sun, label: "LIGHT" },
};

const LAYOUT_MODE_OPTIONS: Readonly<Record<LayoutMode, LayoutModeOption>> = {
  [LayoutMode.Auto]: {
    description:
      "Layout switches by phone orientation. Tablets use desktop layout.",
    icon: MonitorSmartphone,
  },
  [LayoutMode.Mobile]: {
    description: "Mobile layout is forced. Panes use a vertical column.",
    icon: Smartphone,
  },
  [LayoutMode.Desktop]: {
    description: "Desktop layout is forced. Panes use the split grid.",
    icon: Monitor,
  },
};

function optionClass(active: boolean, base: AppearanceClassName): string {
  const state = active
    ? SettingsClassName.ActiveOption
    : SettingsClassName.InactiveOption;
  return `${base} ${state}`;
}

function tickerSpeedLabel(speed: number): TickerSpeedLabel {
  if (speed === TickerSpeedPolicy.Stopped) return TickerSpeedLabel.Halted;
  if (speed <= TickerSpeedPolicy.SlowMax) return TickerSpeedLabel.Slow;
  if (speed <= TickerSpeedPolicy.NormalMax) return TickerSpeedLabel.Normal;
  return TickerSpeedLabel.Fast;
}

function unitModeLabel(mode: UnitMode): string {
  return mode === UnitMode.KilometersPerHour ? "KM/H" : mode.toUpperCase();
}

function LayoutModeSelector() {
  const { mode, setMode } = useLayoutMode();
  const selectedOption = LAYOUT_MODE_OPTIONS[mode];

  return (
    <div>
      <div className={SettingsClassName.Options}>
        {Object.values(LayoutMode).map((layoutMode) => {
          const option = LAYOUT_MODE_OPTIONS[layoutMode];
          const Icon = option.icon;
          return (
            <button
              key={layoutMode}
              type={ButtonType.Button}
              onClick={() => setMode(layoutMode)}
              className={optionClass(
                mode === layoutMode,
                AppearanceClassName.Option,
              )}
            >
              <Icon size={SettingsIconSize.Large} />
              <span className={SettingsClassName.OptionLabel}>
                {layoutMode.toUpperCase()}
              </span>
            </button>
          );
        })}
      </div>
      <div className={SettingsClassName.SupportingText}>
        {selectedOption.description}
      </div>
    </div>
  );
}

export function AppearanceTab({
  colorOverrides,
  mode,
  resetAllColors,
  resetLayerColor,
  resolvedMode,
  setLayerColor,
  setMode,
}: AppearanceTabProps) {
  const defaults = themes[resolvedMode].colors;
  const overrides = colorOverrides[resolvedMode];
  const hasAnyOverride = Object.keys(overrides).length > 0;
  const [tickerSpeed, setTickerSpeed] = useState(
    TickerSpeedPolicy.Default,
  );

  useEffect(() => {
    cacheGet<number>(CacheKey.TickerSpeed).then((saved) => {
      if (typeof saved === "number") setTickerSpeed(saved);
    });
  }, []);

  const handleTickerSpeed = useCallback((value: number) => {
    setTickerSpeed(value);
    cacheSet(CacheKey.TickerSpeed, value);
  }, []);

  const alwaysShowCyclones = useAlwaysShowCyclones();
  const handleAlwaysShowCyclones = useCallback((value: boolean) => {
    setAlwaysShowCyclones(value);
  }, []);
  const unitsMode = useUnitsMode();

  return (
    <div className={SettingsClassName.SectionStack}>
      <div>
        <div className={SettingsClassName.SectionTitle}>THEME</div>
        <div className={SettingsClassName.Options}>
          {Object.values(ThemeMode).map((themeMode) => {
            const option = THEME_OPTIONS[themeMode];
            const Icon = option.icon;
            return (
              <button
                key={themeMode}
                type={ButtonType.Button}
                onClick={() => setMode(themeMode)}
                className={optionClass(
                  mode === themeMode,
                  AppearanceClassName.Option,
                )}
              >
                <Icon size={SettingsIconSize.Large} />
                <span className={SettingsClassName.OptionLabel}>
                  {option.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div>
        <div className={SettingsClassName.SectionTitle}>
          WIND / SPEED UNITS
        </div>
        <div className={SettingsClassName.Options}>
          {Object.values(UnitMode).map((unitMode) => (
            <button
              key={unitMode}
              type={ButtonType.Button}
              onClick={() => {
                setUnitsMode(unitMode);
              }}
              className={optionClass(
                unitsMode === unitMode,
                AppearanceClassName.UnitOption,
              )}
            >
              {unitModeLabel(unitMode)}
            </button>
          ))}
        </div>
      </div>

      <div>
        <div className={SettingsClassName.SectionTitle}>LAYOUT MODE</div>
        <LayoutModeSelector />
      </div>

      <div>
        <div className={SettingsClassName.SectionTitle}>
          LIVE FEED TICKER
        </div>
        <div className="flex items-center gap-3 px-2.5 py-2 rounded bg-sig-bg/30 border border-sig-border/20">
          <span className="text-sm text-sig-text font-semibold tracking-wider w-16 shrink-0">
            {tickerSpeedLabel(tickerSpeed)}
          </span>
          <input
            type={DomInputType.Range}
            min={TickerSpeedPolicy.Stopped}
            max={TickerSpeedPolicy.Max}
            step={TickerSpeedPolicy.SliderStep}
            value={tickerSpeed}
            onChange={(event) =>
              handleTickerSpeed(Number(event.target.value))
            }
            className="flex-1 accent-sig-accent cursor-pointer"
            title={`Ticker speed: ${tickerSpeed} px/s`}
          />
          <span className="text-xs text-sig-dim tabular-nums w-10 text-right shrink-0">
            {tickerSpeed === TickerSpeedPolicy.Stopped
              ? "OFF"
              : `${tickerSpeed}`}
          </span>
        </div>
        <div className={SettingsClassName.SupportingText}>
          Controls scroll speed of the live feed ticker. Set to 0 to stop
          scrolling (items swap periodically).
        </div>
      </div>

      <div>
        <div className={SettingsClassName.SectionTitle}>CYCLONES</div>
        <label className="flex items-center justify-between gap-3 px-2.5 py-2 rounded bg-sig-bg/30 border border-sig-border/20 cursor-pointer">
          <div className={SettingsClassName.DataText}>
            <div className={SettingsClassName.ItemTitle}>
              Always show toggle
            </div>
            <div className="text-xs text-sig-dim/70 mt-0.5 leading-snug">
              Overrides the auto-hide that fires off-season and when the cache
              is empty. This option supports year-round operations workflows.
            </div>
          </div>
          <input
            type={DomInputType.Checkbox}
            checked={alwaysShowCyclones}
            onChange={(event) =>
              handleAlwaysShowCyclones(event.target.checked)
            }
            aria-label="Always show cyclones layer toggle"
            className="w-4 h-4 accent-sig-accent cursor-pointer shrink-0"
          />
        </label>
      </div>

      <div>
        <div className="flex items-center justify-between mb-3">
          <div className="text-xs text-sig-dim tracking-widest">
            LAYER COLORS ({resolvedMode.toUpperCase()})
          </div>
          {hasAnyOverride && (
            <button
              type={ButtonType.Button}
              onClick={resetAllColors}
              className="flex items-center gap-1 text-xs text-sig-dim hover:text-sig-accent transition-colors"
            >
              <RotateCcw size={SettingsIconSize.Tiny} />
              RESET ALL
            </button>
          )}
        </div>
        <div className={SettingsClassName.DataList}>
          {LAYER_COLOR_KEYS.map((key) => {
            const defaultColor = defaults[key];
            const currentColor = overrides[key] ?? defaultColor;
            const isOverridden = key in overrides;

            return (
              <div
                key={key}
                className="flex items-center gap-3 px-2.5 py-2.5 rounded"
              >
                <input
                  type={DomInputType.Color}
                  value={currentColor}
                  onChange={(event) => setLayerColor(key, event.target.value)}
                  className={AppearanceClassName.ColorInput}
                  title={`Select color for ${LAYER_COLOR_LABELS[key]}`}
                  aria-label={`Select color for ${LAYER_COLOR_LABELS[key]}`}
                />
                <div className={SettingsClassName.DataText}>
                  <div className={SettingsClassName.ItemTitle}>
                    {LAYER_COLOR_LABELS[key]}
                  </div>
                  <div className="text-xs text-sig-dim font-mono">
                    {currentColor.toUpperCase()}
                    {isOverridden && (
                      <span className="text-sig-accent ml-1.5">CUSTOM</span>
                    )}
                  </div>
                </div>
                {isOverridden && (
                  <button
                    type={ButtonType.Button}
                    onClick={() => resetLayerColor(key)}
                    className="p-1 rounded text-sig-dim hover:text-sig-accent transition-colors shrink-0"
                    title={`Reset to default (${defaultColor})`}
                  >
                    <RotateCcw size={SettingsIconSize.Small} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
