import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  SelectionOverlayStore,
} from "@/workers/render/selectionOverlayStore";
import type {
  RenderSelectionOverlay,
  RenderSelectionSnapshot,
} from "@/workers/render/protocol";

function selection(revision: number): RenderSelectionSnapshot {
  return {
    revision,
    identity: {
      source: Domain.Aircraft,
      entityId: "aircraft-a",
      interactionId: "aircraft-a",
      pointType: Domain.Aircraft,
    },
  };
}

function overlay(revision: number): RenderSelectionOverlay {
  return {
    selection: selection(revision),
    trail: [],
    motion: null,
  };
}

describe("SelectionOverlayStore", () => {
  test("accepts only the current selection revision and identity", () => {
    const store = new SelectionOverlayStore();
    const current = selection(2);

    expect(store.apply(overlay(1), current)).toBe(false);
    expect(store.snapshot()).toBeNull();
    expect(store.apply(overlay(2), current)).toBe(true);
    expect(store.snapshot()).toEqual(overlay(2));
  });

  test("rejects an identity collision at the same revision", () => {
    const store = new SelectionOverlayStore();
    const current = selection(2);
    const mismatched: RenderSelectionOverlay = {
      ...overlay(2),
      selection: {
        revision: 2,
        identity: {
          source: Domain.Ships,
          entityId: "aircraft-a",
          interactionId: "aircraft-a",
          pointType: Domain.Ships,
        },
      },
    };

    expect(store.apply(mismatched, current)).toBe(false);
  });
});
