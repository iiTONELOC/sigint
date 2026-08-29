import { Domain } from "@shared/domain/identity";
import type { DataPoint } from "@/features/base/dataPoints";
import type { TickerPage } from "@/lib/ui/tickerFeed";

export enum TickerFixtureCoordinate {
  Latitude = 35.5,
  Longitude = -74.25,
}

export enum TickerFixtureIndex {
  Last = -1,
  First = 0,
}

export enum TickerFixturePriority {
  None = 0,
  One = 1,
}

export enum TickerFixturePointId {
  Alpha = "ALPHA1",
  Bravo = "BRAVO2",
  Charlie = "CHARLIE3",
  Delta = "DELTA4",
  Echo = "ECHO5",
  Foxtrot = "FOXTROT6",
}

export enum TickerFixtureText {
  AircraftType = "TEST",
  Origin = "Fixture origin",
}

export function tickerAircraft(
  id: TickerFixturePointId | string,
): DataPoint {
  return {
    data: {
      acType: TickerFixtureText.AircraftType,
      callsign: id,
      icao24: id,
      originCountry: TickerFixtureText.Origin,
    },
    id,
    position: [
      TickerFixtureCoordinate.Longitude,
      TickerFixtureCoordinate.Latitude,
    ],
    type: Domain.Aircraft,
  };
}

export function tickerPage(
  items: readonly DataPoint[],
  priorityCount: number = TickerFixturePriority.None,
): TickerPage {
  return { items, priorityCount };
}
