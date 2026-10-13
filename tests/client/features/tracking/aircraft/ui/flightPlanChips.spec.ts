import { describe, expect, test } from "bun:test";
import { delayChip } from "@/features/tracking/aircraft/ui/AircraftFlightPlan";
import { AircraftChipTone } from "@/features/tracking/aircraft/ui/AircraftIdentityTicket";
import { AIRCRAFT_MINIMUM_LATE_SECONDS } from "@shared/domain/aircraftDossier";
import { SECONDS_PER_MINUTE } from "@shared/time";

enum DelayFixtureMinutes {
  Late = 20,
  Critical = 120,
}

enum DelayFixtureText {
  OnTime = "ON TIME",
  Plus = "+",
}

describe("delayChip", () => {
  test("reads on time for no delay or a delay under the minimum", () => {
    expect(delayChip(undefined)).toEqual({ label: DelayFixtureText.OnTime, tone: AircraftChipTone.OnTime });
    expect(delayChip(AIRCRAFT_MINIMUM_LATE_SECONDS)).toEqual({ label: DelayFixtureText.OnTime, tone: AircraftChipTone.OnTime });
  });

  test("tones a delay by its length and labels it as a plus duration", () => {
    const late = delayChip(DelayFixtureMinutes.Late * SECONDS_PER_MINUTE);
    const critical = delayChip(DelayFixtureMinutes.Critical * SECONDS_PER_MINUTE);

    expect(late.tone).toBe(AircraftChipTone.Late);
    expect(late.label.startsWith(DelayFixtureText.Plus)).toBe(true);
    expect(critical.tone).toBe(AircraftChipTone.Critical);
  });
});
