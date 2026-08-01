import { describe, test } from "bun:test";
import {
  NewsFeedSkeleton,
  NewsFeedSkeletonCopy,
} from "@/panes/news-feed/NewsFeedSkeleton";
import { expectBusyStatus, renderReact } from "../../../support/react";

describe("NewsFeedSkeleton", () => {
  test("exposes its loading state", () => {
    const { container } = renderReact(<NewsFeedSkeleton />);

    expectBusyStatus(container, NewsFeedSkeletonCopy.Loading);
  });
});
