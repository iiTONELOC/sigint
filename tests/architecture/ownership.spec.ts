import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import { RUNTIME_OWNERS } from "@/architecture/ownership";
import { SOURCE_IDS, type SourceId } from "@shared/source";
import { RENDER_SOURCE_IDS } from "@/workers/data/sourceIds";

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
    expect(SOURCE_IDS).toEqual([
      Domain.Aircraft,
      Domain.Ships,
      Domain.Events,
      Domain.Weather,
      Domain.Cyclones,
      Domain.CycloneWarnings,
      Domain.Earthquake,
      Domain.Fire,
      Domain.News,
    ]);
    expect(RENDER_SOURCE_IDS).toEqual([
      Domain.Aircraft,
      Domain.Ships,
      Domain.Events,
      Domain.Weather,
      Domain.Cyclones,
      Domain.CycloneWarnings,
      Domain.Earthquake,
      Domain.Fire,
    ]);
  });
});
