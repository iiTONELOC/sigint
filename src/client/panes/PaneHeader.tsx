import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  Minus,
  X,
  Columns2,
  Rows2,
  ChevronDown,
  GripVertical,
  Maximize2,
  Minimize2,
  type LucideIcon,
} from "lucide-react";
import { Tooltip, TooltipPlacement } from "@/components/Tooltip";
import { useData } from "@/context/DataContext";
import { DeviceType, useLayoutMode } from "@/layout-mode";
import { DomEvent } from "@/runtime";
import { ButtonType } from "@/lib/ui/button";
import { cn } from "@/lib/ui/utils";
import { isEnumValue } from "@shared/types/enum";
import type { PaneType } from "./paneTree";
import {
  PaneDragDataType,
  PaneDragEffect,
  PaneType as PaneTypeId,
  PaneWorkspaceIconMetric,
} from "@/panes/workspace/model";

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
  ExitFullscreen = "Exit fullscreen",
}

type PaneOption = {
  readonly id: string;
  readonly label: string;
  readonly icon: LucideIcon;
};

type PaneHeaderProps = {
  readonly label: string;
  readonly icon: LucideIcon;
  readonly leafId: string;
  readonly paneType?: PaneType;
  readonly statusSlot?: React.ReactNode;
  readonly onSplitH?: (e: React.MouseEvent) => void;
  readonly onSplitV?: (e: React.MouseEvent) => void;
  readonly onMinimize: () => void;
  readonly onClose?: () => void;
  readonly onChangePaneType?: (id: PaneType) => void;
  readonly paneOptions?: PaneOption[];
  readonly onDragStart?: (leafId: string) => void;
  readonly onDragEnd?: () => void;
  readonly onDrop?: (targetLeafId: string) => void;
  readonly onTouchDragStart?: (leafId: string) => void;
  readonly isDragTarget?: boolean;
};

export function PaneHeader({
  label,
  icon: Icon,
  leafId,
  paneType,
  statusSlot,
  onSplitH,
  onSplitV,
  onMinimize,
  onClose,
  onChangePaneType,
  paneOptions,
  onDragStart,
  onDragEnd,
  onDrop,
  onTouchDragStart,
  isDragTarget,
}: PaneHeaderProps) {
  const { chromeHidden, setChromeHidden } = useData();
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

  const hasSwitch = onChangePaneType && paneOptions && paneOptions.length > 0;

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
      {/* Drag handle */}
      <Tooltip
        content="Drag to swap"
        placement={TooltipPlacement.Bottom}
        delay={PaneHeaderMetric.TooltipDelayMs}
      >
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData(PaneDragDataType.PlainText, leafId);
            e.dataTransfer.effectAllowed = PaneDragEffect.Move;
            onDragStart?.(leafId);
          }}
          onDragEnd={() => onDragEnd?.()}
          onTouchStart={(e) => {
            e.preventDefault();
            onTouchDragStart?.(leafId);
          }}
          className="cursor-grab active:cursor-grabbing text-sig-dim hover:text-sig-accent transition-colors px-0.5 py-1 -ml-0.5"
        >
          <GripVertical
            size={PaneWorkspaceIconMetric.CompactSize}
            strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
          />
        </div>
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
        paneOptions &&
        onChangePaneType &&
        dropPos &&
        createPortal(
          <div
            ref={menuRef}
            className="fixed z-80 bg-sig-panel border border-sig-border/60 rounded shadow-lg py-0.5 min-w-48"
            style={{ top: dropPos.top, left: dropPos.left }}
          >
            {paneOptions.map((opt) => {
              const OptIcon = opt.icon;
              return (
                <button
                  type={ButtonType.Button}
                  key={opt.id}
                  onClick={() => {
                    if (!isEnumValue(opt.id, PaneTypeId)) return;
                    onChangePaneType(opt.id);
                    setShowMenu(false);
                  }}
                  className="w-full flex items-center gap-1.5 px-2.5 py-2 bg-transparent border-none text-left hover:bg-sig-accent/10 transition-colors min-h-11"
                >
                  <OptIcon
                    size={PaneWorkspaceIconMetric.ToolbarSize}
                    strokeWidth={PaneWorkspaceIconMetric.LightStroke}
                    className="text-sig-dim shrink-0"
                  />
                  <span className="text-sig-bright text-(length:--sig-text-md) tracking-wide">
                    {opt.label}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}

      {/* Inline status (e.g. track count for globe) */}
      {statusSlot && (
        <div className="flex items-center gap-1.5 ml-2 text-(length:--sig-text-sm) text-sig-dim">
          {statusSlot}
        </div>
      )}

      <div className="flex-1" />

      {/* Controls meet the minimum pointer target size. */}
      <div className="flex items-center">
        {onSplitH && (
          <Tooltip content="Split right" placement={TooltipPlacement.Bottom}>
            <button
              type={ButtonType.Button}
              data-tour={
                paneType === PaneTypeId.Globe ? "split-right-btn" : undefined
              }
              aria-label="Split pane right"
              onClick={onSplitH}
              className={cn(
                PaneHeaderClassName.Control,
                PaneHeaderClassName.Interactive,
              )}
            >
              <Columns2
                className={PaneHeaderClassName.ControlIcon}
                strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                aria-hidden
              />
            </button>
          </Tooltip>
        )}
        {onSplitV && (
          <Tooltip content="Split down" placement={TooltipPlacement.Bottom}>
            <button
              type={ButtonType.Button}
              data-tour={
                paneType === PaneTypeId.Globe ? "split-down-btn" : undefined
              }
              aria-label="Split pane down"
              onClick={onSplitV}
              className={cn(
                PaneHeaderClassName.Control,
                PaneHeaderClassName.Interactive,
              )}
            >
              <Rows2
                className={PaneHeaderClassName.ControlIcon}
                strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                aria-hidden
              />
            </button>
          </Tooltip>
        )}

        {!isPhone && (
          <Tooltip
            content={
              chromeHidden ? PaneHeaderCopy.ExitFullscreen : "Fullscreen"
            }
            placement={TooltipPlacement.Bottom}
          >
            <button
              type={ButtonType.Button}
              aria-label={
                chromeHidden
                  ? PaneHeaderCopy.ExitFullscreen
                  : "Enter fullscreen"
              }
              aria-pressed={chromeHidden}
              onClick={() => setChromeHidden((v) => !v)}
              className={cn(
                PaneHeaderClassName.Control,
                PaneHeaderClassName.Interactive,
              )}
            >
              {chromeHidden ? (
                <Minimize2
                  className={PaneHeaderClassName.ControlIcon}
                  strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                  aria-hidden
                />
              ) : (
                <Maximize2
                  className={PaneHeaderClassName.ControlIcon}
                  strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                  aria-hidden
                />
              )}
            </button>
          </Tooltip>
        )}

        <Tooltip content="Minimize" placement={TooltipPlacement.Bottom}>
          <button
            type={ButtonType.Button}
            aria-label="Minimize pane"
            onClick={onMinimize}
            className={cn(
              PaneHeaderClassName.Control,
              PaneHeaderClassName.Interactive,
            )}
          >
            <Minus
              className={PaneHeaderClassName.ControlIcon}
              strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
              aria-hidden
            />
          </button>
        </Tooltip>

        {onClose && (
          <Tooltip
            content={PaneHeaderCopy.ClosePane}
            placement={TooltipPlacement.Bottom}
          >
            <button
              type={ButtonType.Button}
              aria-label={PaneHeaderCopy.ClosePane}
              onClick={onClose}
              className={cn(
                PaneHeaderClassName.Control,
                PaneHeaderClassName.Destructive,
              )}
            >
              <X
                className={PaneHeaderClassName.ControlIcon}
                strokeWidth={PaneWorkspaceIconMetric.StandardStroke}
                aria-hidden
              />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
