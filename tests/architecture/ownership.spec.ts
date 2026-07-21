import { describe, expect, test } from "bun:test";
import { RUNTIME_OWNERS } from "@/architecture/ownership";
import {
  DATA_SOURCE_IDS,
  RENDER_SOURCE_IDS,
} from "@/workers/data/sourceIds";

describe("runtime ownership", () => {
  test("assigns one owner to each runtime capability", () => {
    expect(RUNTIME_OWNERS).toEqual({
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
    });
  });

  test("keeps one source registry", () => {
    expect(DATA_SOURCE_IDS).toEqual([
      "aircraft",
      "ships",
      "events",
      "weather",
      "cyclones",
      "earthquake",
      "fire",
      "news",
    ]);
    expect(RENDER_SOURCE_IDS).toEqual([
      "aircraft",
      "ships",
      "events",
      "weather",
      "cyclones",
      "earthquake",
      "fire",
    ]);
  });
});
