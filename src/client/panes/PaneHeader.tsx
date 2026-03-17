import { Minus, X, Columns2, Rows2 } from "lucide-react";

type PaneHeaderProps = {
  readonly label: string;
  readonly icon: React.ForwardRefExoticComponent<any>;
  readonly onSplitH?: () => void;
  readonly onSplitV?: () => void;
  readonly onMinimize: () => void;
  readonly onClose?: () => void;
};

export function PaneHeader({
  label,
  icon: Icon,
  onSplitH,
  onSplitV,
  onMinimize,
  onClose,
}: PaneHeaderProps) {
  return (
    <div className="shrink-0 flex items-center gap-1 px-2 py-0.5 bg-sig-panel/80 border-b border-sig-border/40 select-none">
      <Icon size={11} strokeWidth={2.5} className="text-sig-accent shrink-0" />
      <span className="text-sig-accent tracking-wider text-(length:--sig-text-sm) font-semibold">
        {label}
      </span>

      <div className="flex-1" />

      {onSplitH && (
        <button
          onClick={onSplitH}
          className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
          title="Split right"
        >
          <Columns2 size={11} strokeWidth={2.5} />
        </button>
      )}
      {onSplitV && (
        <button
          onClick={onSplitV}
          className="p-0.5 rounded text-sig-dim bg-transparent border-none hover:text-sig-accent transition-colors"
          title="Split down"
        >
          <Rows2 size={11} strokeWidth={2.5} />
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
