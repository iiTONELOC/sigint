import { describe, test } from "bun:test";
import {
  IntelFeedSkeleton,
  IntelFeedSkeletonCopy,
} from "@/panes/intel-feed/IntelFeedSkeleton";
import { expectBusyStatus, renderReact } from "../../../support/react";

describe("IntelFeedSkeleton", () => {
  test("exposes its loading state", () => {
    const { container } = renderReact(<IntelFeedSkeleton />);

    expectBusyStatus(container, IntelFeedSkeletonCopy.Loading);
  });
});
