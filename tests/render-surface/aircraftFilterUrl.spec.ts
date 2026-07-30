import { describe, expect, test } from "bun:test";
import {
  AircraftFilterUrlAdapter,
  createAircraftFilterUrl,
  parseAircraftFilterSearch,
  type RenderUrlLocation,
} from "@/render-surface/aircraftFilterUrl";
import {
  RenderGlobeStateStore,
} from "@/render-surface/globeStateStore";
import {
  RenderGlobeCommandKind,
} from "@/workers/render/protocol";
import {
  MilFilter,
  SquawkBucket,
} from "@shared/domain/aircraft";

enum RenderUrlFixture {
  Origin = "https://sigint.test",
  FilterSearch = "?ac=0&air=no&gnd=yes&squawks=7700,invalid,7700&countries=US,CA,US&mil=military",
  ExistingSearch = "?view=operations",
  ExistingParameter = "view",
  Path = "/map",
  Hash = "#traffic",
}

function locationFromUrl(url: string): RenderUrlLocation {
  const parsed = new URL(url, RenderUrlFixture.Origin);
  return {
    pathname: parsed.pathname,
    search: parsed.search,
    hash: parsed.hash,
  };
}

describe("AircraftFilterUrlAdapter", () => {
  test("parses and canonicalizes the worker filter vocabulary", () => {
    const filter = parseAircraftFilterSearch(
      RenderUrlFixture.FilterSearch,
    );
    expect(filter).toEqual({
      enabled: false,
      showAirborne: false,
      showGround: true,
      squawks: [SquawkBucket.Emergency],
      countries: ["US", "CA"],
      milFilter: MilFilter.Military,
    });

    const location = {
      pathname: RenderUrlFixture.Path,
      search: RenderUrlFixture.ExistingSearch,
      hash: RenderUrlFixture.Hash,
    };
    const next = createAircraftFilterUrl(location, filter);
    const roundTrip = locationFromUrl(next);

    expect(roundTrip.pathname).toBe(RenderUrlFixture.Path);
    expect(roundTrip.hash).toBe(RenderUrlFixture.Hash);
    expect(parseAircraftFilterSearch(roundTrip.search)).toEqual({
      ...filter,
      countries: ["CA", "US"],
    });
    expect(
      new URLSearchParams(roundTrip.search).has(
        RenderUrlFixture.ExistingParameter,
      ),
    ).toBe(true);
  });

  test("seeds the state owner and mirrors accepted changes", () => {
    const globeState = new RenderGlobeStateStore();
    let location = locationFromUrl(
      `${RenderUrlFixture.Path}${RenderUrlFixture.FilterSearch}${RenderUrlFixture.Hash}`,
    );
    const replacements: string[] = [];
    const adapter = new AircraftFilterUrlAdapter({
      globeState,
      readLocation: () => location,
      replaceUrl: (url) => {
        replacements.push(url);
        location = locationFromUrl(url);
      },
    });

    adapter.start();
    expect(globeState.read().aircraftFilter).toEqual(
      parseAircraftFilterSearch(RenderUrlFixture.FilterSearch),
    );

    globeState.dispatch({
      kind: RenderGlobeCommandKind.SetAircraftFilter,
      filter: {
        ...globeState.read().aircraftFilter,
        showGround: false,
      },
    });
    expect(
      parseAircraftFilterSearch(location.search).showGround,
    ).toBe(false);

    adapter.stop();
    const replacementCount = replacements.length;
    globeState.dispatch({
      kind: RenderGlobeCommandKind.SetAircraftFilter,
      filter: {
        ...globeState.read().aircraftFilter,
        enabled: true,
      },
    });
    expect(replacements).toHaveLength(replacementCount);
  });
});
