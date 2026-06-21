import { useState, useCallback, useRef } from "react";

export function ResizeHandle({
  splitId,
  direction,
  onResize,
}: {
  readonly splitId: string;
  readonly direction: "h" | "v";
  readonly onResize: (splitId: string, ratio: number) => void;
}) {
  const handleRef = useRef<HTMLDivElement>(null);
  const [dragging, setDragging] = useState(false);

  const onPointerDown = useCallback(
    (e: React.PointerEvent) => {
      e.preventDefault();
      const handle = handleRef.current;
      if (!handle) return;
      const parent = handle.parentElement;
      if (!parent) return;

      const captureEl = e.currentTarget as HTMLElement;
      captureEl.setPointerCapture?.(e.pointerId);

      const rect = parent.getBoundingClientRect();
      const isH = direction === "h";
      const totalSize = isH ? rect.width : rect.height;
      const startOffset = isH ? rect.left : rect.top;

      setDragging(true);
      document.body.style.cursor = isH ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";

      // Pixel floor so a pane can't be dragged narrower than its content needs
      // (the dossier truncates badly below ~18rem). Falls back to the old 10%
      // bound on very small parents so the clamp can never invert.
      const minPx = isH ? 340 : 200;
      const minRatio = Math.min(0.4, minPx / totalSize);

      const onMove = (ev: PointerEvent) => {
        const pos = isH ? ev.clientX : ev.clientY;
        const raw = (pos - startOffset) / totalSize;
        const ratio = Math.max(minRatio, Math.min(1 - minRatio, raw));
        onResize(splitId, ratio);
      };

      const onUp = (ev: PointerEvent) => {
        captureEl.releasePointerCapture?.(ev.pointerId);
        captureEl.removeEventListener("pointermove", onMove);
        captureEl.removeEventListener("pointerup", onUp);
        captureEl.removeEventListener("pointercancel", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setDragging(false);
      };

      captureEl.addEventListener("pointermove", onMove);
      captureEl.addEventListener("pointerup", onUp);
      captureEl.addEventListener("pointercancel", onUp);
    },
    [splitId, direction, onResize],
  );

  const isH = direction === "h";

  return (
    <div
      ref={handleRef}
      className={`relative z-10 flex items-center justify-center touch-none ${
        isH ? "cursor-col-resize w-[6px]" : "cursor-row-resize h-[6px]"
      } ${
        dragging
          ? "bg-sig-accent/40"
          : "bg-sig-border/30 hover:bg-sig-accent/25"
      } transition-colors`}
    >
      <div
        className={`flex ${isH ? "flex-col" : "flex-row"} gap-[3px] pointer-events-none`}
      >
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`rounded-full ${
              dragging ? "bg-sig-accent/80" : "bg-sig-dim/40"
            } w-[2px] h-[2px]`}
          />
        ))}
      </div>
      <div
        className={`absolute ${
          isH
            ? "inset-y-0 -left-[7px] w-[20px]"
            : "inset-x-0 -top-[7px] h-[20px]"
        } touch-none`}
        onPointerDown={onPointerDown}
      />
    </div>
  );
}
