import {
  useState,
  useRef,
  useEffect,
  type MouseEvent as ReactMouseEvent,
  type MouseEventHandler,
} from "react";
import {
  Copy,
  Minus,
  X,
  Columns2,
  Rows2,
  ChevronDown,
  ChevronRight,
  GripVertical,
  Fullscreen,
  Maximize2,
  Minimize,
  Square,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipPlacement } from "@/components/Tooltip";
import { DeviceType, useLayoutMode } from "@/layout-mode";
import { DomEvent } from "@/runtime";
import { ButtonType } from "@/lib/ui/button";
import { cn } from "@/lib/ui/utils";
import { FULL_WIDTH_ONLY, type PaneType } from "./paneTree";
import { SplitMenu } from "./SplitMenu";
import type { PaneCatalog } from "@/panes/workspace/paneCatalog";
import type { MobileBlock } from "@/panes/workspace/utils/mobile";
import {
  PaneDragDataType,
  PaneDragEffect,
  PaneDropZone,
  PaneNodeType,
  PaneType as PaneTypeId,
  PaneWorkspaceIconMetric,
  SplitDirection,
  type PaneDropZoneValue,
  type SplitDirectionValue,
} from "@/panes/workspace/model/pane";

enum PaneHeaderClassName {
  Control = "p-1 min-h-6 min-w-6 pointer-fine:-mt-px pointer-fine:-mb-0.5 touch-target flex items-center justify-center rounded text-sig-dim bg-transparent border-none transition-colors",
  ControlIcon = "size-3.25",
  Destructive = "hover:text-sig-danger hover:bg-sig-danger/10",
  DragIdle = "border-sig-border/40",
  DragTarget = "border-sig-accent border-b-2 bg-sig-accent/10",
  Header = "shrink-0 flex flex-wrap items-center gap-0.5 px-1 py-px bg-sig-panel/80 border-b select-none relative transition-colors",
  Interactive = "hover:text-sig-accent hover:bg-sig-accent/10",
}

enum PaneHeaderMetric {
  MenuOffsetPx = 2,
  TooltipDelayMs = 600,
}

enum PaneHeaderCopy {
  ClosePane = "Close pane",
  EnterBrowserFullscreen = "Enter browser fullscreen",
  ExitBrowserFullscreen = "Exit browser fullscreen",
  ExpandPane = "Expand pane",
  MaximizePane = "Maximize pane",
  MinimizePane = "Minimize pane",
  PopOut = "Pop out to own block",
  RestorePaneLayout = "Restore pane layout",
  SplitDown = "Split pane down",
  SplitRight = "Split pane right",
}

enum MobilePaneControlClassName {
  MoveZone = "rounded flex items-center justify-center gap-1 bg-sig-bg/85 border-2 border-dashed border-sig-accent/60 text-sig-accent text-(length:--sig-text-md) tracking-wider font-bold hover:bg-sig-accent/30 active:bg-sig-accent/40 transition-colors",
  MoveZoneFullWidth = "col-span-3",
  SwapZone = "rounded flex items-center justify-center gap-1 bg-sig-bg/90 border-2 border-sig-accent/80 text-sig-accent text-(length:--sig-text-md) tracking-wider font-bold hover:bg-sig-accent/30 active:bg-sig-accent/40 transition-colors",
}

type PaneHeaderProps = {
  readonly isFullscreen: boolean;
  readonly isMaximized?: boolean;
  readonly isMinimized?: boolean;
  readonly label: string;
  readonly icon: LucideIcon;
  readonly leafId: string;
  readonly paneType?: PaneType;
  readonly statusSlot?: React.ReactNode;
  readonly onSplitH?: (e: React.MouseEvent) => void;
  readonly onSplitV?: (e: React.MouseEvent) => void;
  readonly onMinimize?: () => void;
  readonly onToggleMaximize?: () => void;
  readonly onToggleFullscreen?: () => void;
  readonly onPopOut?: () => void;
  readonly onClose?: () => void;
  readonly onChangePaneType?: (id: PaneType) => void;
  readonly paneCatalog?: PaneCatalog;
  readonly onDragStart?: (leafId: string) => void;
  readonly onDragEnd?: () => void;
  readonly onDrop?: (targetLeafId: string) => void;
  readonly onTouchDragStart?: (leafId: string) => void;
  readonly onGripClick?: () => void;
  readonly isDragTarget?: boolean;
};

type PaneHeaderControlsProps = Readonly<
  Pick<
    PaneHeaderProps,
    | "isFullscreen"
    | "isMaximized"
    | "isMinimized"
    | "onClose"
    | "onMinimize"
    | "onPopOut"
    | "onSplitH"
    | "onSplitV"
    | "onToggleMaximize"
    | "onToggleFullscreen"
    | "paneType"
  > & { isPhone: boolean }
>;

type PaneControlButtonProps = Readonly<{
  destructive?: boolean;
  expanded?: boolean;
  icon: LucideIcon;
  label: string;
  onClick?: MouseEventHandler<HTMLButtonElement>;
  pressed?: boolean;
  tourId?: string;
}>;

type PaneControlConfiguration = Readonly<Omit<PaneControlButtonProps, "label">>;

function splitRightTourId(
  isPhone: boolean,
  paneType: PaneType | undefined,
): string | undefined {
  if (!paneType) return undefined;
  if (isPhone) return `split-right-${paneType}`;
  return paneType === PaneTypeId.Globe ? "split-right-btn" : undefined;
}

function splitDownTourId(
  isPhone: boolean,
  paneType: PaneType | undefined,
): string | undefined {
  if (paneType === PaneTypeId.Globe) return "split-down-btn";
  return isPhone && paneType ? `split-down-${paneType}` : undefined;
}

function PaneControlButton({
  destructive = false,
  expanded,
  icon: Icon,
  label,
  onClick,
  pressed,
  tourId,
}: PaneControlButtonProps) {
  if (!onClick) return null;
  return (
    <Tooltip content={label} placement={TooltipPlacement.Bottom}>
      <button
        type={ButtonType.Button}
        data-tour={tourId}
        aria-label={label}
        aria-expanded={expanded}
        aria-pressed={pressed}
        onClick={onClick}
        className={cn(
          PaneHeaderClassName.Control,
          destructive
            ? PaneHeaderClassName.Destructive
            : PaneHeaderClassName.Interactive,
        )}
      >
        <Icon
          className={PaneHeaderClassName.ControlIcon}
          strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
          aria-hidden
        />
      </button>
    </Tooltip>
  );
}

function PaneHeaderControls({
  isFullscreen,
  isMaximized = false,
  isMinimized = false,
  isPhone,
  onClose,
  onMinimize,
  onPopOut,
  onSplitH,
  onSplitV,
  onToggleMaximize,
  onToggleFullscreen,
  paneType,
}: PaneHeaderControlsProps) {
  const controls: Readonly<Partial<Record<PaneHeaderCopy, PaneControlConfiguration>>> = {
    [PaneHeaderCopy.SplitRight]: {
      icon: Columns2, onClick: onSplitH,
      tourId: splitRightTourId(isPhone, paneType),
    },
    [PaneHeaderCopy.SplitDown]: {
      icon: Rows2, onClick: onSplitV,
      tourId: splitDownTourId(isPhone, paneType),
    },
    [PaneHeaderCopy.PopOut]: {
      icon: Maximize2, onClick: onPopOut,
    },
    [isMaximized
      ? PaneHeaderCopy.RestorePaneLayout
      : PaneHeaderCopy.MaximizePane]: {
      icon: isMaximized ? Copy : Square,
      onClick: isPhone ? undefined : onToggleMaximize,
      pressed: isMaximized,
    },
    [isFullscreen
      ? PaneHeaderCopy.ExitBrowserFullscreen
      : PaneHeaderCopy.EnterBrowserFullscreen]: {
      icon: isFullscreen ? Minimize : Fullscreen,
      onClick: isPhone ? undefined : onToggleFullscreen,
      pressed: isFullscreen,
    },
    [isMinimized
      ? PaneHeaderCopy.ExpandPane
      : PaneHeaderCopy.MinimizePane]: {
      expanded: !isMinimized,
      icon: isMinimized ? ChevronRight : Minus,
      onClick: onMinimize,
    },
    [PaneHeaderCopy.ClosePane]: {
      destructive: true, icon: X, onClick: onClose,
    },
  };
  return (
    <div className="flex items-center">
      {Object.entries(controls).map(([label, configuration]) =>
        configuration ? (
          <PaneControlButton
            key={label}
            {...configuration}
            label={label}
          />
        ) : null,
      )}
    </div>
  );
}

export function PaneHeader({
  isFullscreen,
  isMaximized = false,
  isMinimized = false,
  label,
  icon: Icon,
  leafId,
  paneType,
  statusSlot,
  onSplitH,
  onSplitV,
  onMinimize,
  onToggleMaximize,
  onToggleFullscreen,
  onPopOut,
  onClose,
  onChangePaneType,
  paneCatalog,
  onDragStart,
  onDragEnd,
  onDrop,
  onTouchDragStart,
  onGripClick,
  isDragTarget,
}: PaneHeaderProps) {
  const isPhone = useLayoutMode().deviceType === DeviceType.Phone;
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const labelRef = useRef<HTMLButtonElement>(null);
  const [dropPos, setDropPos] = useState<{ top: number; left: number } | null>(
    null,
  );

  useEffect(() => {
    if (!showMenu || !labelRef.current) return;
    const rect = labelRef.current.getBoundingClientRect();
    setDropPos({
      top: rect.bottom + PaneHeaderMetric.MenuOffsetPx,
      left: rect.left,
    });
  }, [showMenu]);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as Node;
      if (
        menuRef.current &&
        !menuRef.current.contains(target) &&
        labelRef.current &&
        !labelRef.current.contains(target)
      )
        setShowMenu(false);
    };
    document.addEventListener(DomEvent.MouseDown, handler);
    return () => document.removeEventListener(DomEvent.MouseDown, handler);
  }, [showMenu]);

  const hasSwitch = onChangePaneType && paneCatalog;

  return (
    <div
      className={cn(
        PaneHeaderClassName.Header,
        isDragTarget
          ? PaneHeaderClassName.DragTarget
          : PaneHeaderClassName.DragIdle,
      )}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = PaneDragEffect.Move;
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.(leafId);
      }}
    >
      <Tooltip
        content="Drag to swap"
        placement={TooltipPlacement.Bottom}
        delay={PaneHeaderMetric.TooltipDelayMs}
      >
        <button
          type={ButtonType.Button}
          aria-label="Move pane"
          draggable={!isPhone}
          onClick={onGripClick}
          onDragStart={(e) => {
            e.dataTransfer.setData(PaneDragDataType.PlainText, leafId);
            e.dataTransfer.effectAllowed = PaneDragEffect.Move;
            onDragStart?.(leafId);
          }}
          onDragEnd={() => onDragEnd?.()}
          onTouchStart={(e) => {
            if (onTouchDragStart) {
              e.preventDefault();
              onTouchDragStart(leafId);
            }
          }}
          className={cn(
            "cursor-grab active:cursor-grabbing text-sig-dim hover:text-sig-accent transition-colors px-0.5 py-1 -ml-0.5",
            isPhone && "touch-target",
          )}
        >
          <GripVertical
            size={PaneWorkspaceIconMetric.CompactSize}
            strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
          />
        </button>
      </Tooltip>

      <button
        type={ButtonType.Button}
        ref={labelRef}
        onClick={() => {
          if (hasSwitch) setShowMenu((v) => !v);
        }}
        className={`flex items-center gap-1 bg-transparent border-none p-0 ${hasSwitch ? "cursor-pointer" : "cursor-default"} group`}
      >
        <Icon
          size={PaneWorkspaceIconMetric.ToolbarSize}
          strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
          className="text-sig-accent shrink-0"
        />
        <span className="text-sig-accent tracking-wider text-(length:--sig-text-sm) font-semibold group-hover:text-sig-bright transition-colors">
          {label}
        </span>
        {hasSwitch && (
          <ChevronDown
            size={PaneWorkspaceIconMetric.SmallSize}
            strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
            className="text-sig-dim group-hover:text-sig-accent transition-colors"
          />
        )}
      </button>

      {showMenu &&
        paneCatalog &&
        onChangePaneType &&
        dropPos && (
          <SplitMenu
            ref={menuRef}
            types={Object.values(PaneTypeId).filter(
              (optionType) => optionType !== paneType,
            )}
            catalog={paneCatalog}
            top={dropPos.top}
            left={dropPos.left}
            onSelect={(optionType) => {
              onChangePaneType(optionType);
              setShowMenu(false);
            }}
            className="fixed z-(--layer-menu) bg-sig-panel border border-sig-border/60 rounded shadow-lg py-0.5 min-w-48"
          />
        )}

      {statusSlot && (
        <div className="flex items-center gap-1.5 ml-2 text-(length:--sig-text-sm) text-sig-dim">
          {statusSlot}
        </div>
      )}

      <div className="flex-1" />

      <PaneHeaderControls
        isFullscreen={isFullscreen}
        isMaximized={isMaximized}
        isMinimized={isMinimized}
        isPhone={isPhone}
        onClose={onClose}
        onMinimize={onMinimize}
        onPopOut={onPopOut}
        onSplitH={onSplitH}
        onSplitV={onSplitV}
        onToggleMaximize={onToggleMaximize}
        onToggleFullscreen={onToggleFullscreen}
        paneType={paneType}
      />
    </div>
  );
}

type MobilePaneHeaderProps = Readonly<{
  availableTypes: readonly PaneType[];
  block: MobileBlock;
  changePaneType: (leafId: string, paneType: PaneType) => void;
  closePane: (leafId: string) => void;
  isMinimized: boolean;
  moveSourceLeafId: string | null;
  onGripClick: (leafId: string) => void;
  paneCatalog: PaneCatalog;
  requestSplit: (
    leafId: string,
    direction: SplitDirectionValue,
    event: ReactMouseEvent,
  ) => void;
  toggleMinimize: (blockId: string) => void;
  totalLeafCount: number;
}>;

function mobilePaneHeaderConfiguration(
  props: MobilePaneHeaderProps,
) {
  const leaf = props.block.primaryLeaf;
  let label = "SPLIT";
  let paneType: PaneType | undefined;
  let onSplitH: ((event: ReactMouseEvent) => void) | undefined;
  let onSplitV: ((event: ReactMouseEvent) => void) | undefined;
  let onMinimize: (() => void) | undefined;
  let onClose: (() => void) | undefined;
  let onChangePaneType: ((paneType: PaneType) => void) | undefined;

  if (!props.moveSourceLeafId) {
    onMinimize = () => props.toggleMinimize(props.block.id);
  }

  if (props.block.node.type === PaneNodeType.Leaf) {
    label = props.paneCatalog[leaf.paneType].label;
    paneType = leaf.paneType;
    onChangePaneType = (nextPaneType) =>
      props.changePaneType(leaf.id, nextPaneType);

    if (props.availableTypes.length > 0 && !props.moveSourceLeafId) {
      onSplitV = (event) =>
        props.requestSplit(leaf.id, SplitDirection.Vertical, event);
      if (!FULL_WIDTH_ONLY.has(leaf.paneType)) {
        onSplitH = (event) =>
          props.requestSplit(leaf.id, SplitDirection.Horizontal, event);
      }
    }

    if (props.totalLeafCount > 1 && !props.moveSourceLeafId) {
      onClose = () => props.closePane(leaf.id);
    }
  }

  return {
    label,
    paneType,
    onSplitH,
    onSplitV,
    onMinimize,
    onClose,
    onChangePaneType,
  };
}

export function MobilePaneHeader({
  availableTypes,
  block,
  changePaneType,
  closePane,
  isMinimized,
  moveSourceLeafId,
  onGripClick,
  paneCatalog,
  requestSplit,
  toggleMinimize,
  totalLeafCount,
}: MobilePaneHeaderProps) {
  const leaf = block.primaryLeaf;
  const definition = paneCatalog[leaf.paneType];
  const configuration = mobilePaneHeaderConfiguration({
    availableTypes,
    block,
    changePaneType,
    closePane,
    isMinimized,
    moveSourceLeafId,
    onGripClick,
    paneCatalog,
    requestSplit,
    toggleMinimize,
    totalLeafCount,
  });
  return (
    <PaneHeader
      isFullscreen={false}
      isMinimized={isMinimized}
      icon={definition.icon}
      leafId={leaf.id}
      paneCatalog={paneCatalog}
      onGripClick={() => onGripClick(leaf.id)}
      {...configuration}
    />
  );
}

type MobilePaneMoveOverlayProps = Readonly<{
  active: boolean;
  allowBeside: boolean;
  blockId: string;
  onMoveAction: (blockId: string, zone: PaneDropZoneValue) => void;
}>;

export function MobilePaneMoveOverlay({
  active,
  allowBeside,
  blockId,
  onMoveAction,
}: MobilePaneMoveOverlayProps) {
  if (!active) return null;
  return (
    <div className="absolute inset-0 z-(--layer-pane-overlay) grid grid-cols-3 grid-rows-3 gap-0.5 p-1">
      <button
        type={ButtonType.Button}
        onClick={() => onMoveAction(blockId, PaneDropZone.Top)}
        className={cn(
          MobilePaneControlClassName.MoveZoneFullWidth,
          MobilePaneControlClassName.MoveZone,
        )}
      >
        ↑ ABOVE
      </button>
      {allowBeside && (
        <button
          type={ButtonType.Button}
          onClick={() => onMoveAction(blockId, PaneDropZone.Left)}
          className={MobilePaneControlClassName.MoveZone}
        >
          ← LEFT
        </button>
      )}
      <button
        type={ButtonType.Button}
        onClick={() => onMoveAction(blockId, PaneDropZone.Center)}
        className={cn(
          MobilePaneControlClassName.SwapZone,
          !allowBeside && MobilePaneControlClassName.MoveZoneFullWidth,
        )}
      >
        ⇄ SWAP
      </button>
      {allowBeside && (
        <button
          type={ButtonType.Button}
          onClick={() => onMoveAction(blockId, PaneDropZone.Right)}
          className={MobilePaneControlClassName.MoveZone}
        >
          RIGHT →
        </button>
      )}
      <button
        type={ButtonType.Button}
        onClick={() => onMoveAction(blockId, PaneDropZone.Bottom)}
        className={cn(
          MobilePaneControlClassName.MoveZoneFullWidth,
          MobilePaneControlClassName.MoveZone,
        )}
      >
        ↓ BELOW
      </button>
    </div>
  );
}
