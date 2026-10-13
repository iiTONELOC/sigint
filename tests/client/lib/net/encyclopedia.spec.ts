import { afterEach, describe, expect, test } from "bun:test";
import { __resetEncyclopediaArticlesForTests, fetchEncyclopedia } from "@/lib/net/encyclopedia";
import {
  EncyclopediaQuery,
  EncyclopediaRoute,
  type EncyclopediaTypeAnswer,
  type EncyclopediaVesselAnswer,
} from "@shared/domain/encyclopedia";
import { HttpStatus } from "@shared/http";
import { installFetchMock, type RestoreFetch } from "../../../support/network";

enum ArticleFixtureText {
  Description = "CESSNA 172 Skyhawk",
  Title = "Cessna 172",
  Url = "https://en.wikipedia.org/wiki/Cessna_172",
}

enum ArticleFixtureCount {
  One = 1,
  Two = 2,
}

const ANSWER = { article: { title: ArticleFixtureText.Title, extract: "", url: ArticleFixtureText.Url, image: null }, photo: null };

let restoreFetch: RestoreFetch = () => undefined;
let requested: string[] = [];

function serve(statuses: number[]): void {
  restoreFetch = installFetchMock(async (input: string | URL | Request) => {
    requested.push(String(input));
    const status = statuses.shift() ?? HttpStatus.Ok;
    return status === HttpStatus.Ok ? Response.json(ANSWER) : new Response(null, { status });
  });
}

afterEach(() => {
  restoreFetch();
  __resetEncyclopediaArticlesForTests();
  requested = [];
});

describe("fetchEncyclopedia", () => {
  test("asks the route once per query, skipping blank fields, and shares the answer", async () => {
    serve([]);
    const query = { [EncyclopediaQuery.Description]: ArticleFixtureText.Description, [EncyclopediaQuery.Manufacturer]: undefined, [EncyclopediaQuery.Model]: "" };

    const [first, second] = await Promise.all([
      fetchEncyclopedia<EncyclopediaTypeAnswer>(EncyclopediaRoute.AircraftType, query),
      fetchEncyclopedia<EncyclopediaTypeAnswer>(EncyclopediaRoute.AircraftType, query),
    ]);

    expect(first?.article?.title).toBe(ArticleFixtureText.Title);
    expect(second).toBe(first);
    expect(requested).toHaveLength(ArticleFixtureCount.One);
    expect(requested[0]).toBe(`${EncyclopediaRoute.AircraftType}?${EncyclopediaQuery.Description}=${encodeURIComponent(ArticleFixtureText.Description).replaceAll("%20", "+")}`);
  });

  test("does not remember a refused answer and asks again next time", async () => {
    serve([HttpStatus.ServiceUnavailable]);
    const query = { [EncyclopediaQuery.Imo]: String(ArticleFixtureCount.One) };

    expect(await fetchEncyclopedia<EncyclopediaVesselAnswer>(EncyclopediaRoute.Vessel, query)).toBeNull();
    expect((await fetchEncyclopedia<EncyclopediaVesselAnswer>(EncyclopediaRoute.Vessel, query))?.article?.title).toBe(ArticleFixtureText.Title);
    expect(requested).toHaveLength(ArticleFixtureCount.Two);
  });
});
