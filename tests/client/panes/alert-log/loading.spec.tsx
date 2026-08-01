import { describe, test } from "bun:test";
import {
  AlertLogSkeleton,
  AlertLogSkeletonCopy,
} from "@/panes/alert-log/AlertLogSkeleton";
import { expectBusyStatus, renderReact } from "../../../support/react";

describe("AlertLogSkeleton", () => {
  test("exposes its loading state", () => {
    const { container } = renderReact(<AlertLogSkeleton />);

    expectBusyStatus(container, AlertLogSkeletonCopy.Loading);
  });
});
