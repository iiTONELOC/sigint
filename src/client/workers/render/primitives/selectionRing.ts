import type { Ctx } from "@/features/environmental/cyclones/render/cycloneGeometry";

export function drawSelectionRing(
  context: Ctx,
  x: number,
  y: number,
  size: number,
  color: string,
  time: number,
): void {
  context.globalAlpha = 0.85;
  context.strokeStyle = color;
  context.lineWidth = 1.5;
  context.beginPath();
  context.arc(
    x,
    y,
    size * 2.5 + Math.sin(time * 2) * 2,
    0,
    Math.PI * 2,
  );
  context.stroke();
}
