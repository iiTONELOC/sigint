import { describe, expect, test } from "bun:test";
import { RenderSelectionController } from "@/workers/render/selectionController";
import type { RenderSelectionIdentity } from "@/workers/render/protocol";
import { Domain } from "@shared/domain/identity";

function aircraftSelection(
  interactionId = "aircraft-a",
): RenderSelectionIdentity {
  return {
    source: Domain.Aircraft,
    entityId: "aircraft-a",
    interactionId,
    pointType: Domain.Aircraft,
  };
}

describe("RenderSelectionController", () => {
  test("increments the revision only when identity changes", () => {
    const controller = new RenderSelectionController();

    expect(controller.snapshot()).toEqual({
      revision: 0,
      identity: null,
    });
    expect(controller.set(aircraftSelection())).toBe(true);
    expect(controller.snapshot()).toEqual({
      revision: 1,
      identity: aircraftSelection(),
    });
    expect(controller.set(aircraftSelection())).toBe(false);
    expect(controller.snapshot().revision).toBe(1);
  });

  test("clears once and retains the last revision", () => {
    const controller = new RenderSelectionController();
    controller.set(aircraftSelection());

    expect(controller.set(null)).toBe(true);
    expect(controller.snapshot()).toEqual({
      revision: 2,
      identity: null,
    });
    expect(controller.set(null)).toBe(false);
    expect(controller.snapshot().revision).toBe(2);
  });
});
