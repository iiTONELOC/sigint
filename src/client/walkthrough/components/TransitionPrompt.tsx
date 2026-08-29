import { Sparkles } from "lucide-react";
import { createPortal } from "react-dom";
import { ButtonType } from "@/lib/ui/button";

type TransitionPromptProps = Readonly<{
  onAccept: () => void;
  onDecline: () => void;
}>;

enum TransitionPromptIconMetric {
  Size = 28,
  StrokeWidth = 1.5,
}

export function TransitionPrompt({
  onAccept,
  onDecline,
}: TransitionPromptProps) {
  return createPortal(
    <div className="fixed inset-0 z-(--layer-blocking) flex items-center justify-center">
      <svg
        aria-hidden="true"
        className="absolute inset-0 w-full h-full fill-black/70"
      >
        <rect className="w-full h-full" />
      </svg>

      <div className="relative bg-sig-panel border border-sig-border rounded-lg shadow-2xl max-w-sm mx-4 p-6 text-center">
        <Sparkles
          size={TransitionPromptIconMetric.Size}
          className="text-sig-accent mx-auto mb-3"
          strokeWidth={TransitionPromptIconMetric.StrokeWidth}
        />
        <div className="text-sig-bright text-sm font-semibold tracking-wider mb-2">
          NICE WORK
        </div>
        <div className="text-sig-text text-sm leading-relaxed mb-5">
          You covered the essentials and built your first layout. Do you want
          to explore advanced features such as watch mode, aircraft filters,
          and globe controls?
        </div>
        <div className="flex items-center justify-center gap-3">
          <button
            type={ButtonType.Button}
            onClick={onDecline}
            className="px-4 py-2 rounded text-xs font-semibold tracking-wider text-sig-dim border border-sig-border/60 hover:text-sig-text hover:border-sig-border transition-colors"
          >
            NO, I&apos;M DONE
          </button>
          <button
            type={ButtonType.Button}
            onClick={onAccept}
            className="px-4 py-2 rounded text-xs font-semibold tracking-wider text-sig-bg bg-sig-accent hover:bg-sig-accent/90 transition-colors"
          >
            YES, SHOW ME
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
