import { describe, test } from "bun:test";
import {
  VideoFeedSkeleton,
  VideoFeedSkeletonCopy,
} from "@/panes/video-feed/VideoFeedSkeleton";
import { expectBusyStatus, renderReact } from "../../../support/react";

describe("VideoFeedSkeleton", () => {
  test("exposes its loading state", () => {
    const { container } = renderReact(<VideoFeedSkeleton />);

    expectBusyStatus(container, VideoFeedSkeletonCopy.Loading);
  });
});
