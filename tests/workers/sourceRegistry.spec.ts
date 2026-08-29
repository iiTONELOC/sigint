import { Domain } from "@shared/domain/identity";
import { describe, expect, test } from "bun:test";
import { getPointSourceDefinition } from "@shared/domain/pointSource";
import { RENDER_SOURCE_IDS } from "@shared/source";

describe("point source registry", () => {
  test("defines each render source one time", () => {
    const definitions = RENDER_SOURCE_IDS.map((source) =>
      getPointSourceDefinition(source),
    );
    expect(
      definitions.map((definition) => definition.id),
    ).toEqual(Array.from(RENDER_SOURCE_IDS));
    expect(
      new Set(definitions.map((definition) => definition.cacheKey)).size,
    ).toBe(definitions.length);
  });

  test("returns the registry-owned source facts", () => {
    const events = getPointSourceDefinition(Domain.Events);
    expect(events.id).toBe(Domain.Events);
    expect(events.pointType).toBe(Domain.Events);
    expect(events.pollIntervalMs).toBeGreaterThan(0);
  });
});
