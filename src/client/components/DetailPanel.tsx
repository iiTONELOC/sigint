import { IsolateMode, type SelectedIsolateMode } from "@/workers/render/protocol";
import { PanelSide } from "@/layout-mode/model/layoutMode";
import {
  useRef,
  useState,
  useEffect,
  useCallback,
} from "react";
import { createPortal } from "react-dom";
import { Domain } from "@shared/domain/identity";
import {
  Eye,
  Crosshair,
  GripHorizontal,
  FileSearch,
  LocateFixed,
  type LucideIcon,
} from "lucide-react";
import { useHasDossier } from "@/lib/runtime/layoutSignals";
import { useIsMobileLayout } from "@/layout-mode";
import { DomEvent } from "@/runtime";
import { getColorMap, ThemeCssVar, useTheme } from "@/theme";
import { formatLat, formatLon } from "@/geo";
import { recordLatitude, recordLongitude } from "@/workers/data/source-model/position";
import { useUnitsMode } from "@/preferences/units/useUnitsMode";
import type { DataPoint } from "@/features/base/dataPoints";
import { featureIconProps, type FeatureDefinition } from "@/features/base/presentation";
import { featureRegistry } from "@/features/registry";
import { isHttpUrl } from "@/dossier/detail-panel/utils/httpUrl";
import { DossierLinkGrid } from "@/dossier";
import { CycloneDossierBody } from "@/features/environmental/cyclones/ui/CycloneDossier";
import { ButtonType } from "@/lib/ui/button";
import {
  SheetPolicy,
  useDrag,
  useSheetDismiss,
} from "@/components/detailPanelSheet";
function getRows(item: DataPoint): [string, string][] {
  const feature = featureRegistry[item.type];
  if (!feature) return [];
  return feature.buildDetailRows(item.data, item.timestamp);
}

export type DetailPanelProps = {
  readonly item: DataPoint | null;
  readonly isolateMode: SelectedIsolateMode;
  readonly onSetIsolateMode: (mode: SelectedIsolateMode) => void;
  readonly onZoomTo?: () => void;
  readonly onClose: () => void;
  readonly side?: PanelSide;
  readonly onOpenDossier?: () => void;
};

enum DetailPanelLabel {
  Close = "Close detail panel",
  Locate = "LOCATE",
  Focus = "FOCUS",
  Solo = "SOLO",
}

enum DetailPanelIconSize {
  Action = 12,
  Drag = 14,
  Feature = 16,
  Mode = 11,
}

enum DetailPanelIconStrokeWidth {
  Action = 2.5,
}

enum DetailPanelColorSuffix {
  ActiveBackground = "20",
}

enum DetailPanelScrollPx {
  NearTop = 5,
  OverflowMargin = 10,
}

enum DetailPanelClassName {
  DesktopPanel = "w-72 min-h-0 rounded-md backdrop-blur-sm z-(--layer-tooltip) bg-sig-panel/94 border border-sig-border p-3.5 overflow-y-auto sigint-scroll pointer-events-auto",
  Divider = "mt-1.5 pt-1.5 border-t border-sig-border",
  HeaderRow = "flex items-center gap-1.5",
  SummaryRow = "flex justify-between mb-1.5",
  SummaryRowLabel = "uppercase tracking-wide text-sig-accent text-(length:--sig-text-xs)",
  SummaryRowList = "pt-2.5 border-t border-sig-border",
  SummaryRowValue = "text-right max-w-38.75 wrap-break-word text-sig-bright text-(length:--sig-text-sm)",
}

export function DetailPanel({
  item,
  isolateMode,
  onSetIsolateMode,
  onZoomTo,
  onClose,
  side = PanelSide.Right,
  onOpenDossier,
}: DetailPanelProps) {
  const { theme } = useTheme();
  const hasDossier = useHasDossier();
  const isMobileLayout = useIsMobileLayout();
  const colorMap = getColorMap(theme);
  const drag = useDrag();
  const sheet = useSheetDismiss(onClose);
  useUnitsMode(); // re-render rows when the units pref flips

  // LOCATE button stays highlighted until the selected item changes
  const [locateActive, setLocateActive] = useState(false);
  const handleLocate = useCallback(() => {
    onZoomTo?.();
    setLocateActive(true);
  }, [onZoomTo]);

  const lastItemId = useRef<string | null>(null);
  const lastSide = useRef(side);
  if (item?.id !== lastItemId.current || side !== lastSide.current) {
    lastItemId.current = item?.id ?? null;
    lastSide.current = side;
    if (drag.dragged) drag.reset();
    sheet.reset();
    if (locateActive) setLocateActive(false);
  }

  if (!item) return null;

  const feature = featureRegistry[item.type];
  if (!feature) return null;

  const Icon = feature.icon;
  const color = colorMap[item.type];
  const rows = getRows(item);

  const content = (
    <PanelContent
      Icon={Icon}
      color={color}
      feature={feature}
      item={item}
      rows={rows}
      isolateMode={isolateMode}
      onSetIsolateMode={onSetIsolateMode}
      onZoomTo={handleLocate}
      locateActive={locateActive}
      onClose={onClose}
      onOpenDossier={!hasDossier ? onOpenDossier : undefined}
    />
  );

  if (isMobileLayout) {
    return createPortal(
      <div className="fixed inset-x-0 bottom-0 z-(--layer-tooltip) pointer-events-none">
        <div
          ref={sheet.sheetRef}
          data-detail-sheet
          className="pointer-events-auto mx-1.5 rounded-t-lg backdrop-blur-sm bg-sig-panel/96 border border-sig-border border-b-0 pt-0 flex flex-col"
          style={{
            height: `${sheet.heightVh}vh`,
            transform: `translateY(${sheet.offsetY}px)`,
            transition: sheet.settling
              ? `transform ${SheetPolicy.AnimationMs}ms ease-out, height ${SheetPolicy.AnimationMs}ms ease-out`
              : "none",
            willChange: "transform, height",
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="shrink-0 px-2.5">
            <div
              className="flex flex-col items-center py-3.5 -mx-2.5 cursor-grab touch-none bg-sig-panel/96 rounded-t-lg"
              onTouchStart={(e) => {
                e.stopPropagation();
                sheet.onTouchStart(e);
              }}
              onTouchMove={(e) => {
                e.stopPropagation();
                sheet.onTouchMove(e);
              }}
              onTouchEnd={(e) => {
                e.stopPropagation();
                sheet.onTouchEnd();
              }}
            >
              <div className="w-12 h-1.5 rounded-full bg-sig-dim/40" />
            </div>
            <PanelHeader
              Icon={Icon}
              color={color}
              feature={feature}
              isolateMode={isolateMode}
              onSetIsolateMode={onSetIsolateMode}
              onZoomTo={handleLocate}
              locateActive={locateActive}
              onClose={onClose}
            />
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto sigint-scroll px-2.5 pb-3">
            <PanelBody
              item={item}
              rows={rows}
              onOpenDossier={!hasDossier ? onOpenDossier : undefined}
            />
          </div>
        </div>
      </div>,
      document.body,
    );
  }

  return (
    <div
      className={DetailPanelClassName.DesktopPanel}
      style={{ transform: `translate(${drag.pos.x}px, ${drag.pos.y}px)` }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        data-tour="detail-drag-handle"
        className="flex justify-center mb-1 -mt-1 text-sig-dim cursor-grab active:cursor-grabbing touch-none"
        onPointerDown={drag.onPointerDown}
      >
        <GripHorizontal size={DetailPanelIconSize.Drag} />
      </div>
      {content}
    </div>
  );
}

function MobileScrollHint({
  sheetRef,
}: {
  readonly sheetRef: React.RefObject<HTMLDivElement | null>;
}) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const el = sheetRef.current;
    if (!el) return;
    const check = () => {
      const hasOverflow =
        el.scrollHeight >
        el.clientHeight + DetailPanelScrollPx.OverflowMargin;
      const nearTop = el.scrollTop < DetailPanelScrollPx.NearTop;
      setShow(hasOverflow && nearTop);
    };
    check();
    el.addEventListener(DomEvent.Scroll, check);
    const ob = new ResizeObserver(check);
    ob.observe(el);
    return () => {
      el.removeEventListener(DomEvent.Scroll, check);
      ob.disconnect();
    };
  }, [sheetRef]);
  if (!show) return null;
  return (
    <div className="sticky bottom-0 left-0 right-0 flex justify-center py-1 pointer-events-none">
      <div className="text-[9px] tracking-widest text-sig-dim/50 animate-bounce">
        ▼ SCROLL
      </div>
    </div>
  );
}

function ModeButton({
  active,
  label,
  icon: ButtonIcon,
  accentColor,
  onClick,
}: {
  readonly active: boolean;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly accentColor: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      type={ButtonType.Button}
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1 px-2 py-1 rounded transition-all text-(length:--sig-text-btn) tracking-wide min-h-9 touch-target ${
        active
          ? "border"
          : "text-sig-bright border border-sig-border hover:border-sig-grid/40"
      }`}
      style={
        active
          ? {
              color: accentColor,
              background: `${accentColor}${DetailPanelColorSuffix.ActiveBackground}`,
              borderColor: accentColor,
            }
          : undefined
      }
    >
      <ButtonIcon size={DetailPanelIconSize.Mode} />
      {label}
    </button>
  );
}

const TYPES_WITH_OWN_COORDINATES: ReadonlySet<string> = new Set([
  Domain.Cyclones,
  Domain.Quakes,
  Domain.Fires,
  Domain.Weather,
  Domain.Events,
  Domain.Ships,
]);

function RowList({ rows }: { readonly rows: readonly [string, string][] }) {
  return (
    <div className={DetailPanelClassName.SummaryRowList}>
      {rows.map(([label, value]) => (
        <div key={label} className={DetailPanelClassName.SummaryRow}>
          <span className={DetailPanelClassName.SummaryRowLabel}>
            {label}
          </span>
          <span className={DetailPanelClassName.SummaryRowValue}>
            {value}
          </span>
        </div>
      ))}
    </div>
  );
}

function DetailSummary({
  item,
  dataRows,
}: {
  readonly item: DataPoint;
  readonly dataRows: readonly [string, string][];
}) {
  const Summary = featureRegistry[item.type]?.DetailSummary;
  if (Summary === null) return null;
  return Summary ? <Summary item={item} /> : <RowList rows={dataRows} />;
}

function PanelBody({
  item,
  rows,
  onOpenDossier,
}: {
  readonly item: DataPoint;
  readonly rows: [string, string][];
  readonly onOpenDossier?: () => void;
}) {
  const dataRows = rows.filter(([, value]) => !isHttpUrl(value));
  const linkRows = rows.filter(([, value]) => isHttpUrl(value));

  return (
    <>
      <DetailSummary item={item} dataRows={dataRows} />

      {/* Coordinates */}
      {!TYPES_WITH_OWN_COORDINATES.has(item.type) && (
        <div className="mt-1.5 pt-1.5 border-t border-sig-border text-sig-bright text-(length:--sig-text-sm)">
          {formatLat(recordLatitude(item))}, {formatLon(recordLongitude(item))}
        </div>
      )}

      {item.type === Domain.Cyclones && <CycloneDossierBody item={item} />}

      {/* Open in Dossier button */}
      {onOpenDossier && (
        <div className={DetailPanelClassName.Divider}>
          <button
            type={ButtonType.Button}
            onClick={onOpenDossier}
            className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 rounded text-sig-accent text-(length:--sig-text-btn) tracking-wider font-semibold border border-sig-accent/30 bg-sig-accent/5 transition-all hover:bg-sig-accent/15 any-pointer-coarse:min-h-11"
          >
            <FileSearch
              size={DetailPanelIconSize.Action}
              strokeWidth={DetailPanelIconStrokeWidth.Action}
            />
            OPEN IN DOSSIER
          </button>
        </div>
      )}

      {/* Intel links */}
      {linkRows.length > 0 && (
        <div className={DetailPanelClassName.Divider}>
          <DossierLinkGrid links={linkRows} />
        </div>
      )}
    </>
  );
}

function PanelHeader({
  Icon,
  color,
  feature,
  isolateMode,
  onSetIsolateMode,
  onZoomTo,
  locateActive,
  onClose,
}: {
  readonly Icon: LucideIcon;
  readonly color: string | undefined;
  readonly feature: FeatureDefinition;
  readonly isolateMode: SelectedIsolateMode;
  readonly onSetIsolateMode: (mode: SelectedIsolateMode) => void;
  readonly onZoomTo?: () => void;
  readonly locateActive?: boolean;
  readonly onClose: () => void;
}) {
  return (
    <div className="mb-2.5">
      <div className="flex items-center justify-between mb-2">
        <div className={DetailPanelClassName.HeaderRow}>
          <Icon
            size={DetailPanelIconSize.Feature}
            style={{ color }}
            {...featureIconProps(feature.iconStyle)}
          />
          <span
            className="font-bold tracking-widest text-(length:--sig-text-btn)"
            style={{ color }}
          >
            {feature.label}
          </span>
        </div>
        <button
          type={ButtonType.Button}
          data-tour="detail-close"
          onClick={onClose}
          aria-label={DetailPanelLabel.Close}
          className="cursor-pointer text-[18px] leading-none select-none text-sig-dim touch-target flex items-center justify-center hover:text-sig-bright transition-colors"
        >
          ✕
        </button>
      </div>
      <div className={DetailPanelClassName.HeaderRow}>
        {onZoomTo && (
          <ModeButton
            active={locateActive ?? false}
            label={DetailPanelLabel.Locate}
            icon={LocateFixed}
            accentColor={ThemeCssVar.Accent}
            onClick={onZoomTo}
          />
        )}
        <ModeButton
          active={isolateMode === IsolateMode.Focus}
          label={DetailPanelLabel.Focus}
          icon={Eye}
          accentColor={ThemeCssVar.Accent}
          onClick={() =>
            onSetIsolateMode(
              isolateMode === IsolateMode.Focus ? null : IsolateMode.Focus,
            )
          }
        />
        <ModeButton
          active={isolateMode === IsolateMode.Solo}
          label={DetailPanelLabel.Solo}
          icon={Crosshair}
          accentColor={ThemeCssVar.Danger}
          onClick={() =>
            onSetIsolateMode(
              isolateMode === IsolateMode.Solo ? null : IsolateMode.Solo,
            )
          }
        />
      </div>
    </div>
  );
}

function PanelContent({
  Icon,
  color,
  feature,
  item,
  rows,
  isolateMode,
  onSetIsolateMode,
  onZoomTo,
  locateActive,
  onClose,
  onOpenDossier,
}: {
  readonly Icon: LucideIcon;
  readonly color: string | undefined;
  readonly feature: FeatureDefinition;
  readonly item: DataPoint;
  readonly rows: [string, string][];
  readonly isolateMode: SelectedIsolateMode;
  readonly onSetIsolateMode: (mode: SelectedIsolateMode) => void;
  readonly onZoomTo?: () => void;
  readonly locateActive?: boolean;
  readonly onClose: () => void;
  readonly onOpenDossier?: () => void;
}) {
  return (
    <>
      <PanelHeader
        Icon={Icon}
        color={color}
        feature={feature}
        isolateMode={isolateMode}
        onSetIsolateMode={onSetIsolateMode}
        onZoomTo={onZoomTo}
        locateActive={locateActive}
        onClose={onClose}
      />
      <PanelBody item={item} rows={rows} onOpenDossier={onOpenDossier} />
    </>
  );
}
