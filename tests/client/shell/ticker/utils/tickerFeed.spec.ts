import {
  describe,
  expect,
  test,
} from "bun:test";
import type { DataPoint } from "@/features/base/dataPoints";
import {
  TICKER_ITEM_LIMIT,
  mergeTickerPages,
} from "@/lib/ui/tickerFeed";
import {
  TickerFixtureIndex,
  TickerFixturePointId,
  TickerFixturePriority,
  tickerAircraft,
  tickerPage,
} from "../fixtures";

enum TickerFeedCount {
  Empty = 0,
  Overflow = 200,
}

enum TickerFeedGeneratedId {
  Prefix = "ticker-flood-",
}

enum TickerFeedTestErrorMessage {
  ItemMissing = "The ticker feed fixture did not contain its final item.",
}

function floodItems(): DataPoint[] {
  return Array.from(
    { length: TickerFeedCount.Overflow },
    (_value, index) =>
      tickerAircraft(`${TickerFeedGeneratedId.Prefix}${index}`),
  );
}

describe("mergeTickerPages empty input", () => {
  test("returns no items for absent or empty pages", () => {
    expect(mergeTickerPages([])).toHaveLength(TickerFeedCount.Empty);
    expect(
      mergeTickerPages([tickerPage([]), tickerPage([])]),
    ).toHaveLength(TickerFeedCount.Empty);
  });
});

describe("mergeTickerPages priority", () => {
  test("keeps priority items ahead of ordinary pages", () => {
    const ordinary = tickerAircraft(TickerFixturePointId.Alpha);
    const priority = tickerAircraft(TickerFixturePointId.Bravo);

    const result = mergeTickerPages([
      tickerPage([ordinary]),
      tickerPage([priority], TickerFixturePriority.One),
    ]);

    expect(result.at(TickerFixtureIndex.First)).toBe(priority);
    expect(result).toContain(ordinary);
  });
});

describe("mergeTickerPages bounded fairness", () => {
  test("caps the result without starving a shorter page", () => {
    const minority = tickerAircraft(TickerFixturePointId.Charlie);

    const result = mergeTickerPages([
      tickerPage(floodItems()),
      tickerPage([minority]),
    ]);

    expect(result).toHaveLength(TICKER_ITEM_LIMIT);
    expect(result).toContain(minority);
  });

  test("drains remaining items after a shorter page ends", () => {
    const expected = [
      tickerAircraft(TickerFixturePointId.Alpha),
      tickerAircraft(TickerFixturePointId.Bravo),
      tickerAircraft(TickerFixturePointId.Charlie),
      tickerAircraft(TickerFixturePointId.Delta),
    ];
    const finalItem = expected.at(TickerFixtureIndex.Last);
    if (!finalItem) {
      throw new TypeError(TickerFeedTestErrorMessage.ItemMissing);
    }

    const result = mergeTickerPages([
      tickerPage(
        expected.slice(
          TickerFixtureIndex.First,
          TickerFixtureIndex.Last,
        ),
      ),
      tickerPage([finalItem]),
    ]);

    expect(new Set(result)).toEqual(new Set(expected));
  });
});
