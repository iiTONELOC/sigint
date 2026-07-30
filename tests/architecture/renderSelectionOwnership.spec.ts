import { describe, expect, test } from "bun:test";

enum SelectionOwnershipFixture {
  PresentationBridge =
    "src/client/components/globe/bridge/usePresentationCommands.ts",
  PointWorker = "src/client/workers/pointWorker.ts",
}

describe("render selection ownership", () => {
  test("keeps selection out of the presentation replacement payload", async () => {
    const source = await Bun.file(
      SelectionOwnershipFixture.PresentationBridge,
    ).text();

    expect(source).toContain("RenderMessageType.Selection");
    expect(source).not.toContain("selectedId:");
  });

  test("commits a canvas hit before emitting its bounded projection", async () => {
    const source = await Bun.file(
      SelectionOwnershipFixture.PointWorker,
    ).text();
    const start = source.indexOf("function commitCanvasSelection");
    const end = source.indexOf("function postCursor", start);
    const commit = source.slice(start, end);

    expect(start).toBeGreaterThan(-1);
    expect(commit.indexOf("selectionController.set")).toBeGreaterThan(-1);
    expect(commit.indexOf("postInteraction")).toBeGreaterThan(
      commit.indexOf("selectionController.set"),
    );
    expect(source).toContain("commitCanvasSelection(point.identity)");
    expect(source).not.toContain("_presentation?.selectedId");
    expect(source).not.toContain("p.selectedId");
  });
});
