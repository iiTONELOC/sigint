import { describe, expect, test } from "bun:test";
import {
  isRenderInteraction,
} from "@/render-surface/events";
import {
  RenderInteractionKind,
} from "@/workers/render/protocol";
import { Domain } from "@shared/domain/identity";

describe("render surface interactions", () => {
  test("accepts a bounded selection snapshot", () => {
    expect(isRenderInteraction({
      kind: RenderInteractionKind.Selection,
      selection: {
        revision: 1,
        identity: {
          source: Domain.Cyclones,
          entityId: "storm-a",
          interactionId: "forecast-a",
          pointType: Domain.CyclonesForecast,
        },
      },
    })).toBe(true);
  });

  test("accepts a cleared selection snapshot", () => {
    expect(isRenderInteraction({
      kind: RenderInteractionKind.Selection,
      selection: {
        revision: 2,
        identity: null,
      },
    })).toBe(true);
  });

  test("rejects mismatched source and point identities", () => {
    expect(isRenderInteraction({
      kind: RenderInteractionKind.Selection,
      selection: {
        revision: 1,
        identity: {
          source: Domain.Aircraft,
          entityId: "storm-a",
          interactionId: "forecast-a",
          pointType: Domain.CyclonesForecast,
        },
      },
    })).toBe(false);
  });
});
