import { describe, test } from "bun:test";
import {
  DataTableSkeleton,
  DataTableSkeletonCopy,
} from "@/panes/data-table/DataTableSkeleton";
import { expectBusyStatus, renderReact } from "../../../support/react";

describe("DataTableSkeleton", () => {
  test("exposes its loading state", () => {
    const { container } = renderReact(<DataTableSkeleton />);

    expectBusyStatus(container, DataTableSkeletonCopy.Loading);
  });
});
