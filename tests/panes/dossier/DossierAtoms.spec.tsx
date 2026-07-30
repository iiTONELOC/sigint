import { describe, test, expect } from "bun:test";
import { renderHTML } from "../../setup";
import { Plane, Eye, LocateFixed } from "lucide-react";
import {
  Section,
  IsoBtn,
  DossierToolbar,
  Row,
  LinkRow,
} from "@/panes/dossier/DossierAtoms";

function noop(): void {
  // intentionally empty — DossierToolbar handlers
}

// ── Section — semantic <section> + heading ─────────────────────────

describe("Section", () => {
  test("renders a <section> landmark with an <h3> heading", () => {
    const html = renderHTML(
      <Section title="IDENTITY">
        <div>body</div>
      </Section>,
    );
    expect(html).toContain("<section");
    expect(html).toContain("<h3");
    expect(html).toContain("IDENTITY");
  });

  test("aria-labelledby links the section to its heading", () => {
    const html = renderHTML(
      <Section title="INTENSITY">
        <div>body</div>
      </Section>,
    );
    // Match aria-labelledby and the same id on h3
    const labelMatch = /aria-labelledby="([^"]+)"/.exec(html);
    expect(labelMatch).not.toBeNull();
    const id = labelMatch?.[1] ?? "";
    expect(id.length).toBeGreaterThan(0);
    expect(html).toContain(`id="${id}"`);
  });
});

// ── IsoBtn — accessible name + aria-pressed ────────────────────────

describe("IsoBtn", () => {
  test("accepts an explicit aria-label for screen readers", () => {
    const html = renderHTML(
      <IsoBtn
        active={false}
        label="LOCATE"
        icon={LocateFixed}
        ariaLabel="Locate on globe"
        onClick={() => {}}
      />,
    );
    expect(html).toContain('aria-label="Locate on globe"');
  });

  test("falls back to the visible label when no ariaLabel is supplied", () => {
    const html = renderHTML(
      <IsoBtn
        active={false}
        label="LOCATE"
        icon={LocateFixed}
        onClick={() => {}}
      />,
    );
    // Visible label is still in the DOM as text
    expect(html).toContain("LOCATE");
  });

  test("toggle buttons reflect aria-pressed", () => {
    const on = renderHTML(
      <IsoBtn
        active={true}
        label="FOCUS"
        icon={Eye}
        toggle
        ariaLabel="Focus layer"
        onClick={() => {}}
      />,
    );
    expect(on).toContain('aria-pressed="true"');

    const off = renderHTML(
      <IsoBtn
        active={false}
        label="FOCUS"
        icon={Eye}
        toggle
        ariaLabel="Focus layer"
        onClick={() => {}}
      />,
    );
    expect(off).toContain('aria-pressed="false"');
  });

  test("non-toggle buttons (LOCATE) do not emit aria-pressed", () => {
    const html = renderHTML(
      <IsoBtn
        active={false}
        label="LOCATE"
        icon={LocateFixed}
        ariaLabel="Locate"
        onClick={() => {}}
      />,
    );
    expect(html).not.toContain("aria-pressed");
  });
});

// ── DossierToolbar — unified header with semantic + ARIA ───────────

describe("DossierToolbar", () => {
  test("renders icon + title + close + LOCATE/FOCUS/SOLO", () => {
    const html = renderHTML(
      <DossierToolbar
        icon={Plane}
        title="UAL123"
        isolateMode={null}
        onLocate={noop}
        onFocus={noop}
        onSolo={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("UAL123");
    expect(html).toContain("LOCATE");
    expect(html).toContain("FOCUS");
    expect(html).toContain("SOLO");
  });

  test("close button has an aria-label", () => {
    const html = renderHTML(
      <DossierToolbar
        icon={Plane}
        title="UAL123"
        isolateMode={null}
        onLocate={noop}
        onFocus={noop}
        onSolo={noop}
        onClose={noop}
      />,
    );
    expect(html).toMatch(/aria-label="(Close dossier|close|Close)/i);
  });

  test("FOCUS reflects aria-pressed for isolateMode='focus'", () => {
    const html = renderHTML(
      <DossierToolbar
        icon={Plane}
        title="x"
        isolateMode="focus"
        onLocate={noop}
        onFocus={noop}
        onSolo={noop}
        onClose={noop}
      />,
    );
    // FOCUS button is pressed, SOLO button is not.
    expect(html).toMatch(
      /aria-label="Focus this layer" aria-pressed="true"/,
    );
    expect(html).toMatch(
      /aria-label="Solo this point" aria-pressed="false"/,
    );
  });

  test("SOLO reflects aria-pressed for isolateMode='solo'", () => {
    const html = renderHTML(
      <DossierToolbar
        icon={Plane}
        title="x"
        isolateMode="solo"
        onLocate={noop}
        onFocus={noop}
        onSolo={noop}
        onClose={noop}
      />,
    );
    expect(html).toMatch(
      /aria-label="Solo this point" aria-pressed="true"/,
    );
    expect(html).toMatch(
      /aria-label="Focus this layer" aria-pressed="false"/,
    );
  });

  test("renders an optional badge (e.g. CAT 5, MIL)", () => {
    const html = renderHTML(
      <DossierToolbar
        icon={Plane}
        title="STORM_TEST_C5"
        badge="CAT 5"
        isolateMode={null}
        onLocate={noop}
        onFocus={noop}
        onSolo={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("CAT 5");
  });

  test("renders an optional subtitle", () => {
    const html = renderHTML(
      <DossierToolbar
        icon={Plane}
        title="STORM_TEST_C5"
        subtitle="Hurricane Cat 5 (major)"
        isolateMode={null}
        onLocate={noop}
        onFocus={noop}
        onSolo={noop}
        onClose={noop}
      />,
    );
    expect(html).toContain("Hurricane Cat 5 (major)");
  });
});

// ── Row / LinkRow regressions (verbatim contract) ──────────────────

describe("Row", () => {
  test("renders label + value", () => {
    const html = renderHTML(<Row label="ICAO24" value="ABC123" />);
    expect(html).toContain("ICAO24");
    expect(html).toContain("ABC123");
  });

  test("returns null for empty/Unknown values (existing behavior)", () => {
    const html = renderHTML(<Row label="X" value="" />);
    expect(html).toBe("");
    expect(renderHTML(<Row label="X" value="Unknown" />)).toBe("");
    expect(renderHTML(<Row label="X" value="UNKNOWN" />)).toBe("");
  });
});

describe("LinkRow", () => {
  test("external link gets target=_blank and rel=noopener noreferrer", () => {
    const html = renderHTML(
      <LinkRow label="FlightAware" href="https://example.com" />,
    );
    expect(html).toContain('target="_blank"');
    expect(html).toContain("noopener");
    expect(html).toContain("noreferrer");
  });
});
