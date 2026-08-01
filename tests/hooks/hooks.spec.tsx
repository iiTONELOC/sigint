import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import { act } from "react";
import { SourceStatus } from "@shared/domain/sourceStatus";
import { renderHook } from "../support/react";
import {
  installFetchMock,
  type RestoreFetch,
} from "../support/network";

describe("useNewsData", () => {
  let restoreFetch: RestoreFetch | undefined;

  afterEach(() => {
    restoreFetch?.();
    restoreFetch = undefined;
  });

  test("starts empty and loads data", async () => {
    const mockArticles = [
      {
        id: "n1",
        title: "Test",
        url: "https://example.com",
        source: "BBC",
        publishedAt: new Date().toISOString(),
        description: "desc",
      },
    ];

    restoreFetch = installFetchMock(async () =>
      Response.json({ items: mockArticles }),
    );

    const { newsProvider, useNewsData } = await import("@/features/news");
    const { result, unmount, waitFor } = renderHook(() => useNewsData());

    await act(async () => {
      await newsProvider.refresh();
    });
    await waitFor(() => result.current.loading === false);

    expect(result.current.data).not.toHaveLength(0);
    expect(result.current.dataSource).toBe(SourceStatus.Live);
    unmount();
  });
});
