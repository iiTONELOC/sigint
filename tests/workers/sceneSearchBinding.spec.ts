import { describe, expect, test } from "bun:test";
import { SceneSearchBinding } from "@/workers/data/render-codecs/sceneBinding";

type SearchPublication = Readonly<{
  active: boolean;
  entityIds: readonly string[];
  revision: number;
}>;

describe("scene search binding", () => {
  test("owns normalization, revision, refresh, and inactive state", () => {
    const publications: SearchPublication[] = [];
    const binding = new SceneSearchBinding({
      findEntityIds: (text) => [`match:${text}`],
      publishSearch: (entityIds, revision, active) => {
        publications.push({ entityIds, revision, active });
      },
    });

    binding.refresh();
    binding.update("  target  ");
    binding.refresh();
    binding.update(" ");

    expect(publications).toEqual([
      {
        entityIds: ["match:target"],
        revision: 1,
        active: true,
      },
      {
        entityIds: ["match:target"],
        revision: 1,
        active: true,
      },
      {
        entityIds: [],
        revision: 2,
        active: false,
      },
    ]);
  });
});
