import { describe, test } from "bun:test";
import {
  RawConsoleSkeleton,
  RawConsoleSkeletonCopy,
} from "@/panes/raw-console/RawConsoleSkeleton";
import { expectBusyStatus, renderReact } from "../../../support/react";

describe("RawConsoleSkeleton", () => {
  test("exposes its loading state", () => {
    const { container } = renderReact(<RawConsoleSkeleton />);

    expectBusyStatus(container, RawConsoleSkeletonCopy.Loading);
  });
});
