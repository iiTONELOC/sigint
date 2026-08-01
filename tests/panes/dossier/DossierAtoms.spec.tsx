import { describe, expect, mock, test } from "bun:test";
import { Eye, LocateFixed, Plane } from "lucide-react";
import type { ComponentProps } from "react";
import {
  DossierToolbar,
  IsoBtn,
  LinkRow,
  Row,
  Section,
} from "@/panes/dossier/DossierAtoms";
import { IsolateMode } from "@/workers/render/protocol";
import {
  renderReact,
  type ReactRenderResult,
} from "../../support/react";

type IsoButtonOverrides = Partial<ComponentProps<typeof IsoBtn>>;
type ToolbarOverrides = Partial<ComponentProps<typeof DossierToolbar>>;

function noop(): void {}

function renderIsoButton(
  overrides: IsoButtonOverrides = {},
): ReactRenderResult {
  return renderReact(
    <IsoBtn
      active={false}
      label="LOCATE"
      icon={LocateFixed}
      onClick={noop}
      {...overrides}
    />,
  );
}

function renderToolbar(
  overrides: ToolbarOverrides = {},
): ReactRenderResult {
  return renderReact(
    <DossierToolbar
      icon={Plane}
      title="UAL123"
      isolateMode={null}
      onLocate={noop}
      onFocus={noop}
      onSolo={noop}
      onClose={noop}
      {...overrides}
    />,
  );
}

describe("Section", () => {
  test("labels the section with its heading", () => {
    const { container } = renderReact(
      <Section title="IDENTITY">
        <div>body</div>
      </Section>,
    );
    const section = container.querySelector("section");
    const heading = section?.querySelector("h3");

    expect(section).not.toBeNull();
    expect(heading?.textContent).toBe("IDENTITY");
    expect(section?.getAttribute("aria-labelledby")).toBe(heading?.id);
  });
});

describe("IsoBtn", () => {
  test("uses the explicit accessible name", () => {
    const { container } = renderIsoButton({
      ariaLabel: "Locate on globe",
    });

    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "Locate on globe",
    );
  });

  test("uses the visible label as the accessible name", () => {
    const { container } = renderIsoButton();
    const button = container.querySelector("button");

    expect(button?.getAttribute("aria-label")).toBe("LOCATE");
    expect(button?.textContent).toContain("LOCATE");
  });

  test("reports the toggle state", () => {
    const activeButton = renderIsoButton({
      active: true,
      icon: Eye,
      label: "FOCUS",
      toggle: true,
    }).container.querySelector("button");
    const inactiveButton = renderIsoButton({
      icon: Eye,
      label: "FOCUS",
      toggle: true,
    }).container.querySelector("button");

    expect(activeButton?.getAttribute("aria-pressed")).toBe("true");
    expect(inactiveButton?.getAttribute("aria-pressed")).toBe("false");
  });

  test("omits the toggle state for an action button", () => {
    const { container } = renderIsoButton();

    expect(
      container.querySelector("button")?.getAttribute("aria-pressed"),
    ).toBeNull();
  });

  test("runs its action", () => {
    const onClick = mock(noop);
    const { container } = renderIsoButton({ onClick });

    container.querySelector("button")?.click();

    expect(onClick).toHaveBeenCalledTimes(1);
  });
});

describe("DossierToolbar", () => {
  test("renders the title and actions", () => {
    const { container } = renderToolbar();

    expect(container.textContent).toContain("UAL123");
    expect(container.textContent).toContain("LOCATE");
    expect(container.textContent).toContain("FOCUS");
    expect(container.textContent).toContain("SOLO");
  });

  test("names the close action", () => {
    const { container } = renderToolbar();

    expect(
      container
        .querySelector('button[aria-label="Close dossier"]')
        ?.getAttribute("type"),
    ).toBe("button");
  });

  test("reports focus isolation", () => {
    const { container } = renderToolbar({
      isolateMode: IsolateMode.Focus,
    });

    expect(
      container
        .querySelector('button[aria-label="Focus this layer"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container
        .querySelector('button[aria-label="Solo this point"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
  });

  test("reports solo isolation", () => {
    const { container } = renderToolbar({
      isolateMode: IsolateMode.Solo,
    });

    expect(
      container
        .querySelector('button[aria-label="Solo this point"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("true");
    expect(
      container
        .querySelector('button[aria-label="Focus this layer"]')
        ?.getAttribute("aria-pressed"),
    ).toBe("false");
  });

  test("renders optional badge and subtitle content", () => {
    const { container } = renderToolbar({
      badge: "CAT 5",
      subtitle: "Hurricane Cat 5",
      title: "STORM TEST",
    });

    expect(container.textContent).toContain("STORM TEST");
    expect(container.textContent).toContain("CAT 5");
    expect(container.textContent).toContain("Hurricane Cat 5");
  });
});

describe("Row", () => {
  test("renders its label and value", () => {
    const { container } = renderReact(
      <Row label="ICAO24" value="ABC123" />,
    );

    expect(container.textContent).toContain("ICAO24");
    expect(container.textContent).toContain("ABC123");
  });

  test("omits empty and unknown values", () => {
    const empty = renderReact(<Row label="X" value="" />).container;
    const titleCase = renderReact(
      <Row label="X" value="Unknown" />,
    ).container;
    const upperCase = renderReact(
      <Row label="X" value="UNKNOWN" />,
    ).container;

    expect(empty.firstElementChild).toBeNull();
    expect(titleCase.firstElementChild).toBeNull();
    expect(upperCase.firstElementChild).toBeNull();
  });
});

describe("LinkRow", () => {
  test("protects an external browsing context", () => {
    const { container } = renderReact(
      <LinkRow label="FlightAware" href="https://example.com" />,
    );
    const link = container.querySelector("a");

    expect(link?.getAttribute("href")).toBe("https://example.com");
    expect(link?.getAttribute("target")).toBe("_blank");
    expect(link?.getAttribute("rel")).toBe("noopener noreferrer");
  });
});
