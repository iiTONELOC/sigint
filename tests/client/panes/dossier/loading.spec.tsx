import { describe, test } from "bun:test";
import {
  DossierSkeleton,
  DossierSkeletonCopy,
} from "@/panes/dossier/DossierSkeleton";
import { expectBusyStatus, renderReact } from "../../../support/react";

describe("DossierSkeleton", () => {
  test("exposes its loading state", () => {
    const { container } = renderReact(<DossierSkeleton />);

    expectBusyStatus(container, DossierSkeletonCopy.Loading);
  });
});
