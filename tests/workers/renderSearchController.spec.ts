import { describe, expect, test } from "bun:test";
import { Domain } from "@shared/domain/identity";
import {
  IsolateMode,
  type RenderSelectionIdentity,
} from "@/workers/render/protocol";
import {
  RenderSearchController,
} from "@/workers/render/searchController";

const selection: RenderSelectionIdentity = {
  source: Domain.Aircraft,
  entityId: "aircraft-a",
  interactionId: "aircraft-a",
  pointType: Domain.Aircraft,
};

describe("render search controller", () => {
  test("owns normalized text and increasing revisions", () => {
    const controller = new RenderSearchController();

    expect(controller.snapshot()).toBeNull();
    expect(controller.update("  EAGLE  ")).toEqual({
      search: { revision: 1, text: "EAGLE" },
      restore: null,
    });
    expect(controller.update("EAGLE")).toBeNull();
    expect(controller.update(" ")).toEqual({
      search: { revision: 2, text: null },
      restore: null,
    });
  });

  test("stashes hidden selection and restores it on clear", () => {
    const controller = new RenderSearchController();
    controller.update("EAGLE");

    expect(
      controller.hideSelection(
        Domain.Aircraft,
        1,
        false,
        selection,
        IsolateMode.Focus,
      ),
    ).toEqual({
      identity: selection,
      isolateMode: IsolateMode.Focus,
    });
    expect(controller.update(null)).toEqual({
      search: { revision: 2, text: null },
      restore: {
        identity: selection,
        isolateMode: IsolateMode.Focus,
      },
    });
  });

  test("ignores visible, stale, and unrelated selections", () => {
    const controller = new RenderSearchController();
    controller.update("EAGLE");

    expect(
      controller.hideSelection(
        Domain.Aircraft,
        1,
        true,
        selection,
        null,
      ),
    ).toBeNull();
    expect(
      controller.hideSelection(
        Domain.Aircraft,
        2,
        false,
        selection,
        null,
      ),
    ).toBeNull();
    expect(
      controller.hideSelection(
        Domain.Ships,
        1,
        false,
        selection,
        null,
      ),
    ).toBeNull();
  });
});
