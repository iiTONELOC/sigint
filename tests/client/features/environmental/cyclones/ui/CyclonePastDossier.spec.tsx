import { afterAll, describe, expect, mock, test } from "bun:test";
import type { ReactElement } from "react";
import { formatKtMph } from "@/measurements";
import { formatTime } from "@/time";
import {
  TEST_CYCLONE_PAST_TRACK,
  testCycloneScenePoint,
} from "../../../../../_support/cyclone";
import { renderReact, waitForReact } from "../../../../../support/react";

enum PastDossierFixture {
  AnalysisTime = "2026-09-17T00:00:00.000Z",
  OpenStorm = "OPEN STORM DOSSIER",
}

const storm = testCycloneScenePoint();
const fakeClient = {
  getSourceEntity: async (source: string) => ({ source, value: storm }),
  getSourceSnapshot: () => null,
  subscribeSource: () => () => undefined,
};
let activeClient: typeof fakeClient | null = fakeClient;
const realClientExports = { ...(await import("@/lib/cache/dataWorkerClient")) };
mock.module("@/lib/cache/dataWorkerClient", () => ({
  ...realClientExports,
  getDataWorkerClient: () => activeClient ?? realClientExports.getDataWorkerClient(),
}));

const { cyclonePastPoint } = await import("@/features/environmental/cyclones/data/forecastProjection");
const { CyclonePastDossier } = await import("@/features/environmental/cyclones/ui/CyclonePastDossier");
const { categoryShort } = await import("@/features/environmental/cyclones/classification");
const { UIProvider } = await import("@/context/UIContext");
const { ThemeProvider } = await import("@/theme");

function noop(): void {}

function withProviders(content: ReactElement): ReactElement {
  return (
    <ThemeProvider>
      <UIProvider>{content}</UIProvider>
    </ThemeProvider>
  );
}

afterAll(() => {
  activeClient = null;
});

describe("CyclonePastDossier", () => {
  test("shows the past track point and links back to its storm", async () => {
    const item = cyclonePastPoint(storm, TEST_CYCLONE_PAST_TRACK);

    const { container } = renderReact(withProviders(
      <CyclonePastDossier
        item={item}
        isolateMode={null}
        onLocate={noop}
        onFocus={noop}
        onSolo={noop}
        onClose={noop}
      />,
    ));
    await waitForReact(
      () => container.textContent?.includes(PastDossierFixture.OpenStorm) ?? false,
    );

    expect(item.timestamp).toBe(PastDossierFixture.AnalysisTime);
    expect(container.textContent).toContain(formatTime(PastDossierFixture.AnalysisTime));
    expect(container.textContent).toContain(formatKtMph(TEST_CYCLONE_PAST_TRACK.vmaxKt));
    expect(container.textContent).toContain(categoryShort(TEST_CYCLONE_PAST_TRACK.vmaxKt));
    expect(container.textContent).toContain(storm.data.name);
  });
});
