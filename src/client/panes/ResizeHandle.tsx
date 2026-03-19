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

      const rect = parent.getBoundingClientRect();
      const isH = direction === "h";
      const totalSize = isH ? rect.width : rect.height;
      const startOffset = isH ? rect.left : rect.top;

      setDragging(true);
      document.body.style.cursor = isH ? "col-resize" : "row-resize";
      document.body.style.userSelect = "none";

      const onMove = (ev: PointerEvent) => {
        const pos = isH ? ev.clientX : ev.clientY;
        const raw = (pos - startOffset) / totalSize;
        const ratio = Math.max(0.1, Math.min(0.9, raw));
        onResize(splitId, ratio);
      };

      const onUp = () => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        setDragging(false);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    },
    [splitId, direction, onResize],
  );

  const isH = direction === "h";

  return (
    <div
      ref={handleRef}
      className={`relative flex items-center justify-center ${
        isH ? "cursor-col-resize w-[6px]" : "cursor-row-resize h-[6px]"
      } ${
        dragging
          ? "bg-sig-accent/40"
          : "bg-sig-border/30 hover:bg-sig-accent/25"
      } transition-colors`}
      onPointerDown={onPointerDown}
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
            ? "inset-y-0 -left-[10px] w-[26px]"
            : "inset-x-0 -top-[10px] h-[26px]"
        } touch-none`}
        onPointerDown={onPointerDown}
      />
    </div>
  );
}
