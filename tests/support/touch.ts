import type { DomEvent } from "@/runtime";

export type TouchTestPoint = Readonly<{ clientX: number; clientY: number }>;

export function touchEvent(
  type: DomEvent,
  points: readonly TouchTestPoint[],
  cancelable = true,
): Event {
  const event = new Event(type, { bubbles: true, cancelable });
  Object.defineProperty(event, "touches", {
    value: {
      length: points.length,
      item: (index: number) => points[index] ?? null,
    },
  });
  return event;
}
