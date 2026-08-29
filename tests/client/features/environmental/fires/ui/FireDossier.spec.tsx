import { describe, expect, test } from "bun:test";
import type { FirePoint } from "@/features/environmental/fires/data/source";
import { FireDossier } from "@/features/environmental/fires/ui/FireDossier";
import { Domain } from "@shared/domain/identity";
import type { FireData } from "@shared/domain/fireDayNight";
import { renderReact } from "../../../../../support/react";

enum FireDossierFixture {
  Id = "FI:N20:20260721:1430:30.0000:-80.0000",
  Timestamp = "2026-07-21T14:30:00.000Z",
}

const FULL_DATA: FireData = {
  frp: 42.5,
  confidence: "high",
  brightness: 340,
  brightT31: 295,
  scan: 0.5,
  track: 0.4,
  daynight: "D",
  satellite: "N20",
  instrument: "VIIRS",
  complexSize: 3,
  complexFrp: 120,
};

const SPARSE_DATA: FireData = {
  frp: 4,
  confidence: "low",
  satellite: "N",
};

function firePoint(data: FireData): FirePoint {
  return {
    id: FireDossierFixture.Id,
    type: Domain.Fires,
    lat: 30,
    lon: -80,
    timestamp: FireDossierFixture.Timestamp,
    data,
  };
}

function noop(): void {}

function renderFireDossier(data: FireData): HTMLDivElement {
  return renderReact(
    <FireDossier
      item={firePoint(data)}
      isolateMode={null}
      onLocate={noop}
      onFocus={noop}
      onSolo={noop}
      onClose={noop}
    />,
  ).container;
}

function sectionTitles(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("section h3")).map(
    (heading) => heading.textContent ?? "",
  );
}

function linkLabels(container: HTMLElement): string[] {
  return Array.from(container.querySelectorAll("a")).map(
    (anchor) => anchor.textContent ?? "",
  );
}

describe("FireDossier", () => {
  test("renders every section and link for a full detection", () => {
    const container = renderFireDossier(FULL_DATA);

    expect(container.textContent).toContain("Fire hotspot: 42.5 MW");
    expect(container.textContent).toContain("ACTIVE FIRE");
    expect(sectionTitles(container)).toEqual([
      "THERMAL SIGNATURE",
      "INTENSITY",
      "FIRE COMPLEX",
      "DETECTION FOOTPRINT",
      "INTEL LINKS",
    ]);
    expect(linkLabels(container)).toEqual([
      "NASA FIRMS Map",
      "Google Maps (Satellite)",
    ]);
    expect(container.textContent).toContain("DETECTIONS");
    expect(container.textContent).toContain("120 MW");
    expect(container.querySelector("button[aria-label='Close dossier']"))
      .not.toBeNull();
  });

  test("omits conditional sections for a sparse detection", () => {
    const container = renderFireDossier(SPARSE_DATA);

    expect(sectionTitles(container)).toEqual([
      "INTENSITY",
      "FIRE COMPLEX",
      "INTEL LINKS",
    ]);
    expect(container.textContent).toContain("isolated detection");
  });
});
