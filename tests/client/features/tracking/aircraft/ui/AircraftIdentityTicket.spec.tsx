import { describe, expect, test } from "bun:test";
import { AircraftIdentityTicket } from "@/features/tracking/aircraft/ui/AircraftIdentityTicket";
import { ThemeProvider } from "@/theme";
import { renderReact } from "../../../../../support/react";

enum TicketFixtureText {
  Image = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Delta_737-800.jpg/640px-Delta_737-800.jpg",
  Link = "https://en.wikipedia.org/wiki/Boeing_737_Next_Generation",
  Operator = "Delta Air Lines",
  Photographer = "Boeing 737 Next Generation",
  Registration = "N371DA",
  StockLabel = "STOCK PHOTO",
  Type = "B738",
}

enum TicketFixtureSize {
  Height = 427,
  Width = 640,
}

function noop(): void {}

function renderTicket(stock: boolean): HTMLDivElement {
  return renderReact(
    <ThemeProvider>
      <AircraftIdentityTicket
        photo={{ src: TicketFixtureText.Image, link: TicketFixtureText.Link, photographer: TicketFixtureText.Photographer, width: TicketFixtureSize.Width, height: TicketFixtureSize.Height, stock }}
        photoLoading={false}
        photoError={false}
        onPhotoError={noop}
        typeBadge={TicketFixtureText.Type}
        military={false}
        recon={false}
        operator={TicketFixtureText.Operator}
        chip={null}
        reg={TicketFixtureText.Registration}
        icao24=""
        originCountry=""
        model=""
        aircraft=""
        mfr=""
        wake={null}
      />
    </ThemeProvider>,
  ).container;
}

function creditLine(container: HTMLDivElement): HTMLElement {
  const title = Array.from(container.querySelectorAll("span")).find(
    (span) => span.textContent === TicketFixtureText.Photographer,
  );
  if (!title?.parentElement) throw new TypeError("the photo credit line must render");
  return title.parentElement;
}

describe("AircraftIdentityTicket photo", () => {
  test("names a stock photo on the credit line above the overlays, not inside the picture link", () => {
    const container = renderTicket(true);

    expect(creditLine(container).textContent).toBe(`${TicketFixtureText.StockLabel}${TicketFixtureText.Photographer}`);
    expect(container.querySelector("a")?.textContent).not.toContain(TicketFixtureText.StockLabel);
  });

  test("leaves a real photo's credit line as the photographer alone", () => {
    const container = renderTicket(false);

    expect(creditLine(container).textContent).toBe(TicketFixtureText.Photographer);
    expect(container.textContent).not.toContain(TicketFixtureText.StockLabel);
  });
});
