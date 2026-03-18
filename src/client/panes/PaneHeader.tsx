import { useState, useRef, useEffect } from "react";
import {
  Minus,
  X,
  Columns2,
  Rows2,
  ChevronDown,
  GripVertical,
  Maximize2,
  Minimize2,
} from "lucide-react";
import { Tooltip } from "@/components/Tooltip";
import { useData } from "@/context/DataContext";

type PaneOption = {
  id: string;
  label: string;
  icon: React.ForwardRefExoticComponent<any>;
};

type PaneHeaderProps = {
  readonly label: string;
  readonly icon: React.ForwardRefExoticComponent<any>;
  readonly leafId: string;
  readonly statusSlot?: React.ReactNode;
  readonly onSplitH?: () => void;
  readonly onSplitV?: () => void;
  readonly onMinimize: () => void;
  readonly onClose?: () => void;
  readonly onChangePaneType?: (id: string) => void;
  readonly paneOptions?: PaneOption[];
  readonly onDragStart?: (leafId: string) => void;
  readonly onDragEnd?: () => void;
  readonly onDrop?: (targetLeafId: string) => void;
  readonly isDragTarget?: boolean;
};

export function PaneHeader({
  label,
  icon: Icon,
  leafId,
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
  isDragTarget,
}: PaneHeaderProps) {
  const { chromeHidden, setChromeHidden } = useData();
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!showMenu) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node))
        setShowMenu(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [showMenu]);

  const hasSwitch = onChangePaneType && paneOptions && paneOptions.length > 0;

  return (
    <div
      className={`shrink-0 flex items-center gap-0.5 px-1 py-px bg-sig-panel/80 border-b select-none relative transition-colors ${
        isDragTarget
          ? "border-sig-accent border-b-2 bg-sig-accent/10"
          : "border-sig-border/40"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = "move";
      }}
      onDrop={(e) => {
        e.preventDefault();
        onDrop?.(leafId);
      }}
    >
      {/* Drag handle */}
      <Tooltip content="Drag to swap" placement="bottom" delay={600}>
        <div
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", leafId);
            e.dataTransfer.effectAllowed = "move";
            onDragStart?.(leafId);
          }}
          onDragEnd={() => onDragEnd?.()}
          className="cursor-grab active:cursor-grabbing text-sig-dim hover:text-sig-accent transition-colors px-0.5 py-1 -ml-0.5"
        >
          <GripVertical size={10} strokeWidth={2.5} />
        </div>
      </Tooltip>

      {/* Clickable label — opens pane type dropdown */}
      <button
        onClick={() => {
          if (hasSwitch) setShowMenu((v) => !v);
        }}
        className={`flex items-center gap-1 bg-transparent border-none p-0 ${hasSwitch ? "cursor-pointer" : "cursor-default"} group`}
      >
        <Icon
          size={11}
          strokeWidth={2.5}
          className="text-sig-accent shrink-0"
        />
        <span className="text-sig-accent tracking-wider text-(length:--sig-text-sm) font-semibold group-hover:text-sig-bright transition-colors">
          {label}
        </span>
        {hasSwitch && (
          <ChevronDown
            size={9}
            strokeWidth={2.5}
            className="text-sig-dim group-hover:text-sig-accent transition-colors"
          />
        )}
      </button>

      {/* Pane type dropdown */}
      {showMenu && paneOptions && onChangePaneType && (
        <div
          ref={menuRef}
          className="absolute top-full left-0 z-30 mt-0.5 bg-sig-panel border border-sig-border/60 rounded shadow-lg py-0.5 min-w-36"
        >
          {paneOptions.map((opt) => {
            const OptIcon = opt.icon;
            return (
              <button
                key={opt.id}
                onClick={() => {
                  onChangePaneType(opt.id);
                  setShowMenu(false);
                }}
                className="w-full flex items-center gap-1.5 px-2.5 py-1 bg-transparent border-none text-left hover:bg-sig-accent/10 transition-colors"
              >
                <OptIcon
                  size={11}
                  strokeWidth={2}
                  className="text-sig-dim shrink-0"
                />
                <span className="text-sig-bright text-(length:--sig-text-md) tracking-wide">
                  {opt.label}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {/* Inline status (e.g. track count for globe) */}
      {statusSlot && (
        <div className="flex items-center gap-1.5 ml-2 text-(length:--sig-text-sm) text-sig-dim">
          {statusSlot}
        </div>
      )}

      <div className="flex-1" />

      {/* Control buttons — grouped tighter */}
      <div className="flex items-center">
        {onSplitH && (
          <Tooltip content="Split right" placement="bottom">
            <button
              onClick={onSplitH}
              className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
            >
              <Columns2 size={11} strokeWidth={2.5} />
            </button>
          </Tooltip>
        )}
        {onSplitV && (
          <Tooltip content="Split down" placement="bottom">
            <button
              onClick={onSplitV}
              className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
            >
              <Rows2 size={11} strokeWidth={2.5} />
            </button>
          </Tooltip>
        )}

        <Tooltip
          content={chromeHidden ? "Exit fullscreen" : "Fullscreen"}
          placement="bottom"
        >
          <button
            onClick={() => setChromeHidden((v) => !v)}
            className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
          >
            {chromeHidden ? (
              <Minimize2 size={11} strokeWidth={2.5} />
            ) : (
              <Maximize2 size={11} strokeWidth={2.5} />
            )}
          </button>
        </Tooltip>

        <Tooltip content="Minimize" placement="bottom">
          <button
            onClick={onMinimize}
            className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent hover:bg-sig-accent/10 transition-colors"
          >
            <Minus size={11} strokeWidth={2.5} />
          </button>
        </Tooltip>

        {onClose && (
          <Tooltip content="Close pane" placement="bottom">
            <button
              onClick={onClose}
              className="p-1 rounded text-sig-dim bg-transparent border-none hover:text-sig-danger hover:bg-sig-danger/10 transition-colors"
            >
              <X size={11} strokeWidth={2.5} />
            </button>
          </Tooltip>
        )}
      </div>
    </div>
  );
}
