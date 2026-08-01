import {
  beforeEach,
  describe,
  expect,
  mock,
  test,
} from "bun:test";
import { act } from "react";
import type { DataPoint } from "@/features/base/dataPoints";
import { Domain } from "@shared/domain/identity";
import {
  renderReact,
  setReactInputValue,
  waitForReact,
} from "../../../../support/react";

enum SearchFixtureCount {
  Empty = 0,
  Single = 1,
}

enum SearchFixtureCoordinate {
  Origin = 0,
}

enum SearchFixtureSelector {
  Input = "input[type='text']",
  OpenButton = "button[title='Search (Ctrl+K)']",
}

enum SearchFixtureText {
  AircraftPrimary = "UAL123",
  AircraftSecondary = "B738 · US · Delta",
  EventPrimary = "Delta",
  EventSecondary = "Conflict · GDELT",
  Query = "delta",
}

enum SearchTestErrorMessage {
  InputMissing = "The Search input did not render.",
  OpenButtonMissing = "The Search action did not render.",
}

let searchItems: readonly DataPoint[] = [];

mock.module("@/features/base/useSourceSearch", () => ({
  useSourceSearch: (text: string | null) => ({
    items: text === null ? [] : searchItems,
    ready: text !== null,
    total: text === null ? SearchFixtureCount.Empty : searchItems.length,
  }),
}));

mock.module("@/context/ThemeContext", () => ({
  useTheme: () => ({
    theme: {
      colors: {
        dim: "fixture-dim",
      },
    },
  }),
}));

const { Search } = await import("@/components/Search");

const AIRCRAFT_POINT: DataPoint = {
  data: {
    acType: "B738",
    callsign: SearchFixtureText.AircraftPrimary,
    operator: SearchFixtureText.EventPrimary,
    originCountry: "US",
  },
  id: "aircraft-delta",
  lat: SearchFixtureCoordinate.Origin,
  lon: SearchFixtureCoordinate.Origin,
  type: Domain.Aircraft,
};

const EVENT_POINT: DataPoint = {
  data: {
    category: "Conflict",
    headline: SearchFixtureText.EventPrimary,
    source: "GDELT",
  },
  id: "event-delta",
  lat: SearchFixtureCoordinate.Origin,
  lon: SearchFixtureCoordinate.Origin,
  type: Domain.Events,
};

function requireElement<TElement extends Element>(
  selector: string,
  constructor: new (...args: never[]) => TElement,
  errorMessage: SearchTestErrorMessage,
): TElement {
  const element = document.body.querySelector(selector);
  if (!(element instanceof constructor)) {
    throw new Error(errorMessage);
  }
  return element;
}

function openSearch(): HTMLInputElement {
  const button = requireElement(
    SearchFixtureSelector.OpenButton,
    HTMLButtonElement,
    SearchTestErrorMessage.OpenButtonMissing,
  );
  act(() => {
    button.click();
  });
  return requireElement(
    SearchFixtureSelector.Input,
    HTMLInputElement,
    SearchTestErrorMessage.InputMissing,
  );
}

async function enterQuery(input: HTMLInputElement): Promise<void> {
  setReactInputValue(input, SearchFixtureText.Query);
  await waitForReact(
    () => resultButton(SearchFixtureText.EventPrimary) !== undefined,
  );
}

function resultButton(label: SearchFixtureText): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll("button")).find((button) =>
    button.textContent?.includes(label),
  );
}

beforeEach(() => {
  searchItems = [AIRCRAFT_POINT, EVENT_POINT];
});

describe("Search", () => {
  test("renders production result presentation in score order", async () => {
    renderReact(
      <Search
        onCommit={mock(() => undefined)}
        onSelect={mock(() => undefined)}
        onZoomTo={mock(() => undefined)}
      />,
    );

    await enterQuery(openSearch());

    const bodyText = document.body.textContent ?? "";
    expect(bodyText).toContain(SearchFixtureText.EventPrimary);
    expect(bodyText).toContain(SearchFixtureText.EventSecondary);
    expect(bodyText).toContain(SearchFixtureText.AircraftPrimary);
    expect(bodyText).toContain(SearchFixtureText.AircraftSecondary);
    expect(bodyText.indexOf(SearchFixtureText.EventPrimary)).toBeLessThan(
      bodyText.indexOf(SearchFixtureText.AircraftPrimary),
    );
  });

  test("selects, zooms, and commits the chosen result", async () => {
    const onCommit = mock((_text: string | null) => undefined);
    const onSelect = mock((_item: DataPoint) => undefined);
    const onZoomTo = mock((_item: DataPoint) => undefined);
    renderReact(
      <Search
        onCommit={onCommit}
        onSelect={onSelect}
        onZoomTo={onZoomTo}
      />,
    );

    await enterQuery(openSearch());
    const eventButton = resultButton(SearchFixtureText.EventPrimary);
    expect(eventButton).not.toBeUndefined();
    act(() => {
      eventButton?.click();
    });

    expect(onSelect).toHaveBeenCalledTimes(SearchFixtureCount.Single);
    expect(onSelect).toHaveBeenCalledWith(EVENT_POINT);
    expect(onZoomTo).toHaveBeenCalledTimes(SearchFixtureCount.Single);
    expect(onZoomTo).toHaveBeenCalledWith(EVENT_POINT);
    expect(onCommit).toHaveBeenCalledTimes(SearchFixtureCount.Single);
    expect(onCommit).toHaveBeenCalledWith(SearchFixtureText.Query);
  });
});
