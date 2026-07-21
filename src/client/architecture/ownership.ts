export type RuntimeOwner =
  | "render-surface"
  | "data-worker"
  | "render-worker";

export const RUNTIME_OWNERS = {
  canvas: "render-surface",
  completeData: "data-worker",
  persistence: "data-worker",
  trails: "data-worker",
  indexes: "data-worker",
  correlation: "data-worker",
  camera: "render-worker",
  projection: "render-worker",
  frameSchedule: "render-worker",
  scene: "render-worker",
  hitTests: "render-worker",
} as const satisfies Readonly<Record<string, RuntimeOwner>>;
