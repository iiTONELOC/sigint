import { afterEach, describe, expect, setSystemTime, test } from "bun:test";
import { HttpHeader, HttpStatus } from "@shared/http";
import { MS_PER_SECOND } from "@shared/time";
import {
  __resetEncyclopediaCacheForTests,
  acceptsArticle,
  articleFromSummary,
  getAircraftTypeArticle,
  getVesselEncyclopedia,
  photoFromCommons,
  titleFromEntity,
  titleFromSearch,
  typeQueries,
} from "../../../src/server/api/encyclopediaCache";

enum EncyclopediaFixtureText {
  Description = "BOEING 737-800",
  DisambiguationTitle = "B350",
  DisambiguationType = "disambiguation",
  DisambiguationUrl = "https://en.wikipedia.org/wiki/B350",
  Extract = "The Boeing 737 Next Generation is a twin-engined narrow-body aircraft.",
  HelicopterDescription = "AIRBUS HELICOPTERS EC-135/635",
  HelicopterTitle = "Eurocopter EC135",
  Image = "https://upload.wikimedia.org/wikipedia/commons/thumb/f/ff/Delta_737-800.jpg/640px-Delta_737-800.jpg",
  ListTitle = "List of Boeing customer codes",
  LegalNamed = "Textron Aviation Inc 182T",
  ListUrl = "https://en.wikipedia.org/wiki/List_of_Boeing_customer_codes",
  Manufacturer = "THE BOEING CO",
  Model = "737-86N(WL)",
  Named = "THE BOEING CO 737-86N(WL)",
  SkylaneModel = "182T",
  SkylaneTitle = "Cessna 182 Skylane",
  StrangerTitle = "Diamond DA40 Diamond Star",
  Title = "Boeing 737 Next Generation",
  TireTitle = "Tire code",
  Url = "https://en.wikipedia.org/wiki/Boeing_737_Next_Generation",
  WeightClass = "Light (< 15500 lbs)",
}

enum EncyclopediaFixtureSize {
  Height = 427,
  Width = 640,
}

enum EncyclopediaFixtureCount {
  None = 0,
  OneCall = 1,
  OneLookup = 2,
  TwoLookups = 4,
  VesselLookup = 4,
}

enum RefusalFixture {
  RetrySeconds = 7,
}

enum VesselFixture {
  Imo = 9811000,
}

enum VesselFixtureText {
  Entity = "Q104378621",
  Title = "Ever Given",
  Url = "https://en.wikipedia.org/wiki/Ever_Given",
}

const VESSEL_SEARCH = { query: { search: [{ title: VesselFixtureText.Entity }] } };
const VESSEL_ENTITY = { entities: { [VesselFixtureText.Entity]: { sitelinks: { enwiki: { title: VesselFixtureText.Title } } } } };
const VESSEL_SUMMARY = { title: VesselFixtureText.Title, extract: "", content_urls: { desktop: { page: VesselFixtureText.Url } } };

enum CommonsFixture {
  PageId = 123,
}

enum CommonsFixtureText {
  Artist = '<a href="//commons.wikimedia.org/wiki/User:Huug_Pieterse" title="User:Huug Pieterse">Huug Pieterse</a>',
  Credit = "Huug Pieterse",
  License = "CC BY 4.0",
  Page = "https://commons.wikimedia.org/wiki/File:Ever_Given_2021.jpg",
  Thumb = "https://upload.wikimedia.org/wikipedia/commons/thumb/e/ev/Ever_Given_2021.jpg/640px-Ever_Given_2021.jpg",
}

const COMMONS = {
  query: {
    pages: {
      [String(CommonsFixture.PageId)]: {
        imageinfo: [{
          thumburl: CommonsFixtureText.Thumb,
          thumbwidth: EncyclopediaFixtureSize.Width,
          thumbheight: EncyclopediaFixtureSize.Height,
          descriptionurl: CommonsFixtureText.Page,
          extmetadata: { Artist: { value: CommonsFixtureText.Artist }, LicenseShortName: { value: CommonsFixtureText.License } },
        }],
      },
    },
  },
};

const LIST_SUMMARY = {
  title: EncyclopediaFixtureText.ListTitle,
  extract: "",
  content_urls: { desktop: { page: EncyclopediaFixtureText.ListUrl } },
};

const DISAMBIGUATION_SUMMARY = {
  title: EncyclopediaFixtureText.DisambiguationTitle,
  type: EncyclopediaFixtureText.DisambiguationType,
  extract: "",
  content_urls: { desktop: { page: EncyclopediaFixtureText.DisambiguationUrl } },
};

const SEARCH = { query: { search: [{ title: EncyclopediaFixtureText.Title }] } };
const SUMMARY = {
  title: EncyclopediaFixtureText.Title,
  extract: EncyclopediaFixtureText.Extract,
  content_urls: { desktop: { page: EncyclopediaFixtureText.Url } },
  thumbnail: { source: EncyclopediaFixtureText.Image, width: EncyclopediaFixtureSize.Width, height: EncyclopediaFixtureSize.Height },
};

const BASE_ARTICLE = { title: EncyclopediaFixtureText.Title, extract: "", url: EncyclopediaFixtureText.Url, image: null };

function articleTitled(title: string) {
  return { ...BASE_ARTICLE, title };
}

function flushTasks(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

describe("encyclopedia parsers", () => {
  test("reads the first search title and maps a summary to an article", () => {
    expect(titleFromSearch(SEARCH)).toBe(EncyclopediaFixtureText.Title);
    expect(titleFromSearch({})).toBeNull();
    expect(articleFromSummary(SUMMARY)).toEqual({
      title: EncyclopediaFixtureText.Title,
      extract: EncyclopediaFixtureText.Extract,
      url: EncyclopediaFixtureText.Url,
      image: { src: EncyclopediaFixtureText.Image, width: EncyclopediaFixtureSize.Width, height: EncyclopediaFixtureSize.Height },
    });
  });

  test("reads the first Commons file as a credited photo, stripping the artist markup", () => {
    expect(photoFromCommons(COMMONS)).toEqual({
      src: CommonsFixtureText.Thumb,
      width: EncyclopediaFixtureSize.Width,
      height: EncyclopediaFixtureSize.Height,
      link: CommonsFixtureText.Page,
      credit: CommonsFixtureText.Credit,
      license: CommonsFixtureText.License,
    });
    expect(photoFromCommons({})).toBeNull();
  });

  test("keeps an article without a picture and drops a summary without a page or a disambiguation page", () => {
    const { thumbnail: _thumbnail, ...noPicture } = SUMMARY;
    const article = articleFromSummary(noPicture);

    expect(article?.image).toBeNull();
    expect(article?.url).toBe(EncyclopediaFixtureText.Url);
    expect(articleFromSummary({ title: EncyclopediaFixtureText.Title })).toBeNull();
    expect(articleFromSummary(DISAMBIGUATION_SUMMARY)).toBeNull();
  });
});

describe("typeQueries and acceptsArticle", () => {
  test("asks with the feed description first, then the model alone, then the named model, never blanks or repeats", () => {
    expect(typeQueries({ description: EncyclopediaFixtureText.Description, manufacturer: EncyclopediaFixtureText.Manufacturer, model: EncyclopediaFixtureText.Model }))
      .toEqual([EncyclopediaFixtureText.Description, EncyclopediaFixtureText.Model, EncyclopediaFixtureText.Named]);
    expect(typeQueries({ model: EncyclopediaFixtureText.Model })).toEqual([EncyclopediaFixtureText.Model]);
    expect(typeQueries({ description: EncyclopediaFixtureText.Model, model: EncyclopediaFixtureText.Model })).toEqual([EncyclopediaFixtureText.Model]);
    expect(typeQueries({ description: " ", manufacturer: "", model: undefined })).toEqual([]);
  });

  test("accepts an article that shares a type token or its number with the query and rejects lists and strangers", () => {
    expect(acceptsArticle(articleTitled(EncyclopediaFixtureText.HelicopterTitle), EncyclopediaFixtureText.HelicopterDescription)).toBe(true);
    expect(acceptsArticle(articleTitled(EncyclopediaFixtureText.Title), EncyclopediaFixtureText.Named)).toBe(true);
    expect(acceptsArticle(articleTitled(EncyclopediaFixtureText.Title), EncyclopediaFixtureText.Model)).toBe(true);
    expect(acceptsArticle(articleTitled(EncyclopediaFixtureText.SkylaneTitle), EncyclopediaFixtureText.SkylaneModel)).toBe(true);
    expect(acceptsArticle(articleTitled(EncyclopediaFixtureText.StrangerTitle), EncyclopediaFixtureText.LegalNamed)).toBe(false);
    expect(acceptsArticle(articleTitled(EncyclopediaFixtureText.TireTitle), EncyclopediaFixtureText.WeightClass)).toBe(false);
    expect(acceptsArticle(articleTitled(EncyclopediaFixtureText.ListTitle), EncyclopediaFixtureText.Description)).toBe(false);
  });
});

describe("getAircraftTypeArticle", () => {
  const originalFetch = globalThis.fetch;
  let calls: string[] = [];

  function serve(answer: (url: string) => Response | Promise<Response>): void {
    globalThis.fetch = (async (input: string | URL | Request) => {
      const url = decodeURIComponent(String(input));
      calls.push(url);
      return answer(url);
    }) as unknown as typeof globalThis.fetch;
  }

  afterEach(() => {
    globalThis.fetch = originalFetch;
    setSystemTime();
    __resetEncyclopediaCacheForTests();
    calls = [];
  });

  test("takes the article for the description in one lookup, then serves the cache", async () => {
    serve((url) => Response.json(url.includes("list=search") ? SEARCH : SUMMARY));

    const first = await getAircraftTypeArticle({ description: EncyclopediaFixtureText.Description, manufacturer: EncyclopediaFixtureText.Manufacturer, model: EncyclopediaFixtureText.Model });
    const second = await getAircraftTypeArticle({ description: EncyclopediaFixtureText.Description, manufacturer: EncyclopediaFixtureText.Manufacturer, model: EncyclopediaFixtureText.Model });

    expect(first?.title).toBe(EncyclopediaFixtureText.Title);
    expect(second).toBe(first);
    expect(calls).toHaveLength(EncyclopediaFixtureCount.OneLookup);
    expect(calls[0]).toContain(EncyclopediaFixtureText.Description);
  });

  test("skips a list or a disambiguation answer for the description and takes the next candidate's article", async () => {
    const rejected = [
      { title: EncyclopediaFixtureText.ListTitle, summary: LIST_SUMMARY },
      { title: EncyclopediaFixtureText.DisambiguationTitle, summary: DISAMBIGUATION_SUMMARY },
    ];
    for (const { title, summary } of rejected) {
      calls = [];
      __resetEncyclopediaCacheForTests();
      serve((url) => {
        if (url.includes("list=search")) {
          const first = url.includes(EncyclopediaFixtureText.Description);
          return Response.json({ query: { search: [{ title: first ? title : EncyclopediaFixtureText.Title }] } });
        }
        return Response.json(url.includes(title) ? summary : SUMMARY);
      });

      const article = await getAircraftTypeArticle({ description: EncyclopediaFixtureText.Description, manufacturer: EncyclopediaFixtureText.Manufacturer, model: EncyclopediaFixtureText.Model });

      expect({ rejected: title, found: article?.title, calls: calls.length })
        .toEqual({ rejected: title, found: EncyclopediaFixtureText.Title, calls: EncyclopediaFixtureCount.TwoLookups });
    }
  });

  test("backs off after a refusal for as long as the upstream asked and does not remember it", async () => {
    const start = Date.now();
    setSystemTime(new Date(start));
    serve(() => new Response(null, { status: HttpStatus.TooManyRequests, headers: { [HttpHeader.RetryAfter]: String(RefusalFixture.RetrySeconds) } }));

    expect(await getAircraftTypeArticle({ description: EncyclopediaFixtureText.Description })).toBeNull();
    expect(await getAircraftTypeArticle({ description: EncyclopediaFixtureText.Description })).toBeNull();
    expect(calls).toHaveLength(EncyclopediaFixtureCount.OneCall);

    calls = [];
    setSystemTime(new Date(start + RefusalFixture.RetrySeconds * MS_PER_SECOND));
    serve((url) => Response.json(url.includes("list=search") ? SEARCH : SUMMARY));

    expect((await getAircraftTypeArticle({ description: EncyclopediaFixtureText.Description }))?.title).toBe(EncyclopediaFixtureText.Title);
    expect(calls).toHaveLength(EncyclopediaFixtureCount.OneLookup);
  });

  test("sends upstream requests one at a time", async () => {
    let release = (): void => undefined;
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    let firstStarted = (): void => undefined;
    const started = new Promise<void>((resolve) => {
      firstStarted = resolve;
    });
    serve(async (url) => {
      if (calls.length === EncyclopediaFixtureCount.OneCall) {
        firstStarted();
        await gate;
      }
      return Response.json(url.includes("list=search") ? SEARCH : SUMMARY);
    });

    const first = getAircraftTypeArticle({ description: EncyclopediaFixtureText.Description });
    const second = getAircraftTypeArticle({ model: EncyclopediaFixtureText.Model });
    await started;
    await flushTasks();
    expect(calls).toHaveLength(EncyclopediaFixtureCount.OneCall);

    release();
    expect((await first)?.title).toBe(EncyclopediaFixtureText.Title);
    expect((await second)?.title).toBe(EncyclopediaFixtureText.Title);
    expect(calls).toHaveLength(EncyclopediaFixtureCount.TwoLookups);
  });

  test("finds a vessel by IMO: its article through Wikidata and its hull photo from Commons", async () => {
    serve((url) => {
      if (url.includes("haswbstatement")) return Response.json(VESSEL_SEARCH);
      if (url.includes("wbgetentities")) return Response.json(VESSEL_ENTITY);
      if (url.includes("commons.wikimedia.org")) return Response.json(COMMONS);
      return Response.json(VESSEL_SUMMARY);
    });

    const { article, photo } = await getVesselEncyclopedia(VesselFixture.Imo);

    expect(titleFromEntity(VESSEL_ENTITY, VesselFixtureText.Entity)).toBe(VesselFixtureText.Title);
    expect(article?.title).toBe(VesselFixtureText.Title);
    expect(article?.url).toBe(VesselFixtureText.Url);
    expect(photo?.credit).toBe(CommonsFixtureText.Credit);
    expect(photo?.link).toBe(CommonsFixtureText.Page);
    expect(calls).toHaveLength(EncyclopediaFixtureCount.VesselLookup);
    expect(calls[0]).toContain(String(VesselFixture.Imo));
    expect(calls[calls.length - 1]).toContain(`deepcat:"IMO ${VesselFixture.Imo}"`);
  });

  test("answers null for an empty query without asking, and asks again after a reset", async () => {
    serve(() => Response.json({ query: { search: [] } }));

    expect(await getAircraftTypeArticle({})).toBeNull();
    expect(calls).toHaveLength(EncyclopediaFixtureCount.None);

    expect(await getAircraftTypeArticle({ model: EncyclopediaFixtureText.Model })).toBeNull();
    __resetEncyclopediaCacheForTests();
    expect(await getAircraftTypeArticle({ model: EncyclopediaFixtureText.Model })).toBeNull();
    expect(calls).toHaveLength(EncyclopediaFixtureCount.OneLookup);
  });
});
