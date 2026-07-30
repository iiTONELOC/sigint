import { describe, expect, test } from "bun:test";
import {
  IsolateMode,
  type RenderPresentationPayload,
  type RenderSelectionIdentity,
} from "@/workers/render/protocol";
import {
  selectionIsVisible,
  type SelectionVisibility,
} from "@/workers/render/selectionVisibility";
import { Domain } from "@shared/domain/identity";

const aircraftSelection: RenderSelectionIdentity = {
  source: Domain.Aircraft,
  entityId: "aircraft-1",
  interactionId: "aircraft-1",
  pointType: Domain.Aircraft,
};

const shipSelection: RenderSelectionIdentity = {
  source: Domain.Ships,
  entityId: "ship-1",
  interactionId: "ship-1",
  pointType: Domain.Ships,
};

const enabledLayers: RenderPresentationPayload["layers"] = {
  [Domain.Aircraft]: true,
  [Domain.Ships]: true,
};

function settings(
  selection: RenderSelectionIdentity | null,
  overrides: Partial<SelectionVisibility> = {},
): SelectionVisibility {
  return {
    selection,
    searchIds: null,
    isolateMode: null,
    isolatedId: null,
    isolatedType: null,
    layers: enabledLayers,
    aircraftEntityIsVisible: () => true,
    ...overrides,
  };
}

describe("selectionIsVisible", () => {
  test("rejects an empty selection", () => {
    expect(selectionIsVisible(settings(null))).toBe(false);
  });

  test("rejects a selection outside the search result", () => {
    expect(
      selectionIsVisible(
        settings(shipSelection, { searchIds: new Set() }),
      ),
    ).toBe(false);
  });

  test("enforces solo isolation by interaction identity", () => {
    expect(
      selectionIsVisible(
        settings(shipSelection, {
          isolateMode: IsolateMode.Solo,
          isolatedId: aircraftSelection.interactionId,
        }),
      ),
    ).toBe(false);
  });

  test("enforces focus isolation by point type", () => {
    expect(
      selectionIsVisible(
        settings(shipSelection, {
          isolateMode: IsolateMode.Focus,
          isolatedType: Domain.Aircraft,
        }),
      ),
    ).toBe(false);
  });

  test("uses the aircraft layer as the aircraft authority", () => {
    expect(
      selectionIsVisible(
        settings(aircraftSelection, {
          aircraftEntityIsVisible: () => false,
        }),
      ),
    ).toBe(false);
  });

  test("uses layer visibility for a non-aircraft selection", () => {
    expect(
      selectionIsVisible(
        settings(shipSelection, {
          layers: { [Domain.Ships]: false },
        }),
      ),
    ).toBe(false);
  });

  test("accepts a selection that survives every active filter", () => {
    expect(selectionIsVisible(settings(shipSelection))).toBe(true);
  });
});
