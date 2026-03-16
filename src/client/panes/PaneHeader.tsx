import {
  Minus,
  X,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
} from "lucide-react";

type PaneHeaderProps = {
  readonly label: string;
  readonly icon: React.ForwardRefExoticComponent<any>;
  readonly onMinimize: () => void;
  readonly onClose?: () => void;
  readonly onMoveLeft?: () => void;
  readonly onMoveRight?: () => void;
  readonly direction: "horizontal" | "vertical";
};

export function PaneHeader({
  label,
  icon: Icon,
  onMinimize,
  onClose,
  onMoveLeft,
  onMoveRight,
  direction,
}: PaneHeaderProps) {
  const isHoriz = direction === "horizontal";
  const MoveBackIcon = isHoriz ? ChevronLeft : ChevronUp;
  const MoveFwdIcon = isHoriz ? ChevronRight : ChevronDown;

  return (
    <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-sig-panel/80 border-b border-sig-border/40 select-none">
      <Icon size={11} strokeWidth={2.5} className="text-sig-accent shrink-0" />
      <span className="text-sig-accent tracking-wider text-(length:--sig-text-sm) font-semibold">
        {label}
      </span>

      <div className="flex-1" />

      {onMoveLeft && (
        <button
          onClick={onMoveLeft}
          className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
          title={isHoriz ? "Move left" : "Move up"}
        >
          <MoveBackIcon size={11} strokeWidth={2.5} />
        </button>
      )}
      {onMoveRight && (
        <button
          onClick={onMoveRight}
          className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
          title={isHoriz ? "Move right" : "Move down"}
        >
          <MoveFwdIcon size={11} strokeWidth={2.5} />
        </button>
      )}

      <button
        onClick={onMinimize}
        className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
        title="Minimize"
      >
        <Minus size={11} strokeWidth={2.5} />
      </button>

      {onClose && (
        <button
          onClick={onClose}
          className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-danger transition-colors"
          title="Close"
        >
          <X size={11} strokeWidth={2.5} />
        </button>
      )}
    </div>
  );
}
