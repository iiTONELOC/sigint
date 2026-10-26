import { describe, expect, test } from "bun:test";
import { IntelSeverity } from "@shared/domain/correlation";
import { parseFirmsCsv } from "../../src/server/api/firmsCache";
import {
  GdeltColumn,
  GdeltRootCode,
  buildHeadline,
  goldsteinSeverity,
  parseDateAdded,
  parseGdeltExportUrl,
  parseExportCsv,
} from "../../src/server/api/gdeltCache";
import {
  extractAttr,
  extractTag,
  hashUrl,
  parseRssItems,
  stripHtml,
} from "../../src/server/api/newsCache";

enum FirmsFixtureText {
  BulkHeader = "latitude,longitude,bright_ti4,scan,track,acq_date,acq_time,satellite,confidence,version,bright_ti5,frp,daynight",
  BulkRow = "15.27001,-10.23617,310.87,0.56,0.69,2026-06-15,0308,N20,nominal,2.0NRT,291.19,6.07,N",
  Header = "latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight",
  InvalidRow = "abc,def,300,1,1,2026-03-21,0100,N,VIIRS,nom,2.0,280,10,N",
  NullIslandRow = "0,0,300,1,1,2026-03-21,0100,N,VIIRS,nom,2.0,280,10,N",
  PlainRow = "35.1,45.2,300,1,1,2026-03-21,0100,N,VIIRS,nom,2.0,280,10,N",
  RowDay = "-10.5,120.3,310.2,0.8,0.9,2026-03-21,0145,N,VIIRS,high,2.0,285.0,88.3,D",
  RowNight = "35.123,45.456,320.5,1.0,1.0,2026-03-21,0130,N,VIIRS,nominal,2.0,290.1,42.5,N",
  ShortRow = "35.1,45.2",
  WrongHeader = "name,value\nfoo,bar",
}

enum FirmsFixtureValue {
  BulkBrightness = 310.87,
  BulkBrightnessT31 = 291.19,
  BulkFrp = 6.07,
  BulkLatitude = 15.27001,
  Frp = 42.5,
  Latitude = 35.123,
  Longitude = 45.456,
}

enum FixturePrecision {
  Coarse = 1,
  Fine = 4,
  Standard = 3,
}

enum FixtureCount {
  None = 0,
  One = 1,
  Two = 2,
}

describe("parseFirmsCsv", () => {
  test("parses the keyed 14-column CSV", () => {
    const records = parseFirmsCsv([FirmsFixtureText.Header, FirmsFixtureText.RowNight, FirmsFixtureText.RowDay].join("\n"));

    expect(records).toHaveLength(FixtureCount.Two);
    expect(records[0]?.lat).toBeCloseTo(FirmsFixtureValue.Latitude, FixturePrecision.Standard);
    expect(records[0]?.lon).toBeCloseTo(FirmsFixtureValue.Longitude, FixturePrecision.Standard);
    expect(records[0]?.frp).toBeCloseTo(FirmsFixtureValue.Frp, FixturePrecision.Coarse);
    expect(records[1]?.daynight).toBe("D");
  });

  test("parses the keyless 13-column bulk file and defaults the instrument", () => {
    const records = parseFirmsCsv([FirmsFixtureText.BulkHeader, FirmsFixtureText.BulkRow].join("\n"));

    expect(records).toHaveLength(FixtureCount.One);
    expect(records[0]?.lat).toBeCloseTo(FirmsFixtureValue.BulkLatitude, FixturePrecision.Fine);
    expect(records[0]?.frp).toBeCloseTo(FirmsFixtureValue.BulkFrp, FixturePrecision.Standard);
    expect(records[0]?.brightness).toBeCloseTo(FirmsFixtureValue.BulkBrightness, FixturePrecision.Standard);
    expect(records[0]?.brightT31).toBeCloseTo(FirmsFixtureValue.BulkBrightnessT31, FixturePrecision.Standard);
    expect(records[0]?.confidence).toBe("nominal");
    expect(records[0]?.instrument).toBe("VIIRS");
  });

  test("answers no records for a missing or wrong header, a short row, null island or invalid coordinates", () => {
    const rejected: ReadonlyArray<readonly [string, string]> = [
      ["empty", ""],
      ["one line", "just one line"],
      ["wrong header", FirmsFixtureText.WrongHeader],
      ["short row", [FirmsFixtureText.Header, FirmsFixtureText.ShortRow].join("\n")],
      ["null island", [FirmsFixtureText.Header, FirmsFixtureText.NullIslandRow].join("\n")],
      ["invalid coordinates", [FirmsFixtureText.Header, FirmsFixtureText.InvalidRow].join("\n")],
    ];

    for (const [name, csv] of rejected) {
      expect([name, parseFirmsCsv(csv)]).toEqual([name, []]);
    }
  });

  test("ignores blank lines between rows", () => {
    expect(parseFirmsCsv([FirmsFixtureText.Header, "", FirmsFixtureText.PlainRow, "", ""].join("\n"))).toHaveLength(FixtureCount.One);
  });
});

enum NewsFixtureText {
  AtomTitle = "Atom Article",
  AtomUrl = "https://example.com/atom1",
  CdataTitle = "CDATA Title",
  Description = "First article description",
  FirstUrl = "https://example.com/article1",
  HashPrefix = "NW",
  LongFiller = "x",
  Source = "TestSource",
  Title = "Breaking News",
  UrlA = "https://example.com/a",
  UrlB = "https://example.com/b",
}

enum NewsFixtureSize {
  DescriptionCap = 500,
  LongDescription = 1000,
}

const RSS_FEED = `<?xml version="1.0"?>
<rss version="2.0">
<channel>
<item>
  <title>${NewsFixtureText.Title}</title>
  <link>${NewsFixtureText.FirstUrl}</link>
  <pubDate>Mon, 21 Mar 2026 12:00:00 GMT</pubDate>
  <description>${NewsFixtureText.Description}</description>
</item>
<item>
  <title>Second Story</title>
  <link>https://example.com/article2</link>
  <pubDate>Mon, 21 Mar 2026 11:00:00 GMT</pubDate>
  <description>Second article</description>
</item>
</channel>
</rss>`;

const ATOM_FEED = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <title>${NewsFixtureText.AtomTitle}</title>
  <link href="${NewsFixtureText.AtomUrl}"/>
  <published>2026-03-21T12:00:00Z</published>
  <summary>Atom summary</summary>
</entry>
</feed>`;

function rssItem(body: string): string {
  return `<rss><channel><item>${body}</item></channel></rss>`;
}

describe("news feed parsers", () => {
  test("stripHtml removes tags, decodes entities and collapses whitespace", () => {
    const cases: ReadonlyArray<readonly [string, string]> = [
      ["<p>Hello <b>world</b></p>", "Hello world"],
      ["&amp; &quot; &#39; &nbsp;word", "& \" ' word"],
      ["  hello   world  ", "hello world"],
      ["", ""],
    ];

    for (const [html, text] of cases) {
      expect([html, stripHtml(html)]).toEqual([html, text]);
    }
  });

  test("hashUrl is stable per URL, distinct across URLs and prefixed", () => {
    expect(hashUrl(NewsFixtureText.UrlA)).toBe(hashUrl(NewsFixtureText.UrlA));
    expect(hashUrl(NewsFixtureText.UrlA)).not.toBe(hashUrl(NewsFixtureText.UrlB));
    expect(hashUrl(NewsFixtureText.UrlA).startsWith(NewsFixtureText.HashPrefix)).toBe(true);
  });

  test("extractTag reads plain, CDATA and attributed tags and answers empty for a missing one", () => {
    const cases: ReadonlyArray<readonly [string, string, string]> = [
      ["<title>Hello</title>", "title", "Hello"],
      ["<title><![CDATA[Hello World]]></title>", "title", "Hello World"],
      ['<link type="text">http://example.com</link>', "link", "http://example.com"],
      ["<foo>bar</foo>", "title", ""],
    ];

    for (const [xml, tag, value] of cases) {
      expect([xml, extractTag(xml, tag)]).toEqual([xml, value]);
    }
    expect(extractAttr('<link rel="alternate" href="https://example.com/x"/>', "link", "href")).toBe("https://example.com/x");
  });

  test("parseRssItems reads RSS 2.0 and Atom feeds", () => {
    const rss = parseRssItems(RSS_FEED, NewsFixtureText.Source);
    const atom = parseRssItems(ATOM_FEED, NewsFixtureText.Source);

    expect(rss).toHaveLength(FixtureCount.Two);
    expect(rss[0]?.title).toBe(NewsFixtureText.Title);
    expect(rss[0]?.url).toBe(NewsFixtureText.FirstUrl);
    expect(rss[0]?.source).toBe(NewsFixtureText.Source);
    expect(rss[0]?.description).toBe(NewsFixtureText.Description);
    expect(rss[0]?.id).toBe(hashUrl(NewsFixtureText.FirstUrl));
    expect(atom).toHaveLength(FixtureCount.One);
    expect(atom[0]?.title).toBe(NewsFixtureText.AtomTitle);
    expect(atom[0]?.url).toBe(NewsFixtureText.AtomUrl);
  });

  test("parseRssItems skips items without a title or a link", () => {
    expect(parseRssItems(rssItem("<link>https://example.com/x</link>"), NewsFixtureText.Source)).toEqual([]);
    expect(parseRssItems(rssItem("<title>No Link</title>"), NewsFixtureText.Source)).toEqual([]);
  });

  test("parseRssItems unwraps CDATA, strips markup and caps the description", () => {
    const cdata = parseRssItems(
      rssItem(`<title><![CDATA[${NewsFixtureText.CdataTitle}]]></title><link>https://example.com/cdata</link><description><![CDATA[<p>HTML in CDATA</p>]]></description>`),
      NewsFixtureText.Source,
    );
    const long = parseRssItems(
      rssItem(`<title>Long</title><link>https://example.com/long</link><description>${NewsFixtureText.LongFiller.repeat(NewsFixtureSize.LongDescription)}</description>`),
      NewsFixtureText.Source,
    );

    expect(cdata[0]?.title).toBe(NewsFixtureText.CdataTitle);
    expect(cdata[0]?.description).toBe("HTML in CDATA");
    expect(long[0]?.description).toHaveLength(NewsFixtureSize.DescriptionCap);
  });
});

enum GdeltFixtureText {
  Actor1 = "UNITED STATES",
  Actor2 = "IRAN",
  CountryCode = "IZ",
  DateAdded = "20260321120000",
  DateAddedIso = "2026-03-21T12:00:00.000Z",
  EventCode = "190",
  Goldstein = "-8.0",
  Latitude = "33.3",
  Location = "Baghdad, Iraq",
  Longitude = "44.4",
  Mentions = "25",
  ShortDate = "2026",
  SourceDomain = "example.com",
  SourceUrl = "https://www.example.com/article",
  Tone = "-5.2",
  UnknownActorHeadline = "Unknown actor → TARGET [180]",
  ExportHttp = "http://data.gdeltproject.org/gdeltv2/20261026174500.export.CSV.zip",
  ExportHttps = "https://data.gdeltproject.org/gdeltv2/20261026174500.export.CSV.zip",
}

enum GdeltFixtureValue {
  Latitude = 33.3,
  Longitude = 44.4,
  OtherLatitude = 10.5,
  OtherLongitude = 20.5,
  RecentWindowMs = 5_000,
  RootCodeCount = 20,
  RootCodeWidth = 2,
}

const GDELT_COLUMN_COUNT = GdeltColumn.SourceUrl + 1;

function gdeltLine(overrides: Partial<Record<GdeltColumn, string>> = {}): string {
  const columns = new Array<string>(GDELT_COLUMN_COUNT).fill("");
  const defaults: Partial<Record<GdeltColumn, string>> = {
    [GdeltColumn.Actor1Name]: GdeltFixtureText.Actor1,
    [GdeltColumn.Actor2Name]: GdeltFixtureText.Actor2,
    [GdeltColumn.EventCode]: GdeltFixtureText.EventCode,
    [GdeltColumn.EventRootCode]: GdeltRootCode.Fight,
    [GdeltColumn.GoldsteinScale]: GdeltFixtureText.Goldstein,
    [GdeltColumn.NumMentions]: GdeltFixtureText.Mentions,
    [GdeltColumn.AverageTone]: GdeltFixtureText.Tone,
    [GdeltColumn.ActionGeoFullName]: GdeltFixtureText.Location,
    [GdeltColumn.ActionGeoCountryCode]: GdeltFixtureText.CountryCode,
    [GdeltColumn.ActionGeoLatitude]: GdeltFixtureText.Latitude,
    [GdeltColumn.ActionGeoLongitude]: GdeltFixtureText.Longitude,
    [GdeltColumn.DateAdded]: GdeltFixtureText.DateAdded,
    [GdeltColumn.SourceUrl]: GdeltFixtureText.SourceUrl,
  };
  for (const [column, value] of Object.entries({ ...defaults, ...overrides })) {
    columns[Number(column)] = value;
  }
  return columns.join("\t");
}

const RELEVANT_ROOT_CODES = new Set<string>(Object.values(GdeltRootCode));
const IRRELEVANT_ROOT_CODES = Array.from({ length: GdeltFixtureValue.RootCodeCount }, (_, index) =>
  String(index + 1).padStart(GdeltFixtureValue.RootCodeWidth, "0"),
).filter((code) => !RELEVANT_ROOT_CODES.has(code));

describe("GDELT export parser", () => {
  test("upgrades the exact GDELT export origin and rejects other destinations", () => {
    expect(parseGdeltExportUrl(GdeltFixtureText.ExportHttp)).toBe(
      GdeltFixtureText.ExportHttps,
    );
    for (const url of [
      "https://127.0.0.1/gdeltv2/file.export.CSV.zip",
      "https://data.gdeltproject.org.evil.example/file.export.CSV.zip",
      "https://user@data.gdeltproject.org/gdeltv2/file.export.CSV.zip",
      "https://data.gdeltproject.org:443/gdeltv2/file.export.CSV.zip",
      "https://data.gdeltproject.org:8443/gdeltv2/file.export.CSV.zip",
      "https://data.gdeltproject.org/gdeltv2/file.mentions.CSV.zip",
    ]) {
      expect([url, parseGdeltExportUrl(url)]).toEqual([url, null]);
    }
  });

  test("parseDateAdded reads the GDELT timestamp and falls back to now for a short value", () => {
    expect(parseDateAdded(GdeltFixtureText.DateAdded)).toBe(GdeltFixtureText.DateAddedIso);
    expect(new Date(parseDateAdded(GdeltFixtureText.ShortDate)).getTime()).toBeGreaterThan(Date.now() - GdeltFixtureValue.RecentWindowMs);
  });

  test("goldsteinSeverity maps the scale at and between its thresholds", () => {
    const cases: ReadonlyArray<readonly [number, IntelSeverity]> = [
      [-10, IntelSeverity.Crisis],
      [-7, IntelSeverity.Crisis],
      [-5, IntelSeverity.Conflict],
      [-4, IntelSeverity.Conflict],
      [-3, IntelSeverity.Tension],
      [-2, IntelSeverity.Tension],
      [-1, IntelSeverity.Concern],
      [0, IntelSeverity.Concern],
      [5, IntelSeverity.Monitoring],
    ];

    for (const [goldstein, severity] of cases) {
      expect([goldstein, goldsteinSeverity(goldstein)]).toEqual([goldstein, severity]);
    }
  });

  test("buildHeadline names both actors, one actor, or an unknown actor", () => {
    expect(buildHeadline("USA", "IRAN", "190")).toBe("USA → IRAN [190]");
    expect(buildHeadline("PROTEST GROUP", "", "140")).toBe("PROTEST GROUP [140]");
    expect(buildHeadline("", "TARGET", "180")).toBe(GdeltFixtureText.UnknownActorHeadline);
  });

  test("parseExportCsv reads a relevant line into an event with its severity and source domain", () => {
    const events = parseExportCsv(gdeltLine());
    const event = events[0];

    expect(events).toHaveLength(FixtureCount.One);
    expect(event?.lat).toBeCloseTo(GdeltFixtureValue.Latitude, FixturePrecision.Coarse);
    expect(event?.lon).toBeCloseTo(GdeltFixtureValue.Longitude, FixturePrecision.Coarse);
    expect(event?.timestamp).toBe(GdeltFixtureText.DateAddedIso);
    expect(event?.data.actor1).toBe(GdeltFixtureText.Actor1);
    expect(event?.data.actor2).toBe(GdeltFixtureText.Actor2);
    expect(event?.data.severity).toBe(IntelSeverity.Crisis);
    expect(event?.data.category).toBe(IntelSeverity[IntelSeverity.Crisis]);
    expect(event?.data.headline).toBe(buildHeadline(GdeltFixtureText.Actor1, GdeltFixtureText.Actor2, GdeltFixtureText.EventCode));
    expect(event?.data.source).toBe(GdeltFixtureText.SourceDomain);
    expect(event?.data.sourceCountry).toBe(GdeltFixtureText.CountryCode);
    expect(event?.data.locationName).toBe(GdeltFixtureText.Location);
  });

  test("parseExportCsv keeps every relevant root code and drops every other one", () => {
    for (const code of RELEVANT_ROOT_CODES) {
      expect([code, parseExportCsv(gdeltLine({ [GdeltColumn.EventRootCode]: code })).length]).toEqual([code, FixtureCount.One]);
    }
    for (const code of IRRELEVANT_ROOT_CODES) {
      expect([code, parseExportCsv(gdeltLine({ [GdeltColumn.EventRootCode]: code }))]).toEqual([code, []]);
    }
  });

  test("parseExportCsv drops null island, invalid coordinates and short lines", () => {
    const rejected: ReadonlyArray<readonly [string, string]> = [
      ["null island", gdeltLine({ [GdeltColumn.ActionGeoLatitude]: "0", [GdeltColumn.ActionGeoLongitude]: "0" })],
      ["invalid latitude", gdeltLine({ [GdeltColumn.ActionGeoLatitude]: "abc" })],
      ["short line", "too\tfew\tcolumns"],
    ];

    for (const [name, csv] of rejected) {
      expect([name, parseExportCsv(csv)]).toEqual([name, []]);
    }
  });

  test("parseExportCsv reads several lines and ignores blank ones", () => {
    const second = gdeltLine({
      [GdeltColumn.ActionGeoLatitude]: String(GdeltFixtureValue.OtherLatitude),
      [GdeltColumn.ActionGeoLongitude]: String(GdeltFixtureValue.OtherLongitude),
    });
    const events = parseExportCsv([gdeltLine(), "", second].join("\n"));

    expect(events).toHaveLength(FixtureCount.Two);
    expect(events[1]?.lat).toBeCloseTo(GdeltFixtureValue.OtherLatitude, FixturePrecision.Coarse);
  });

  test("parseExportCsv names the category after the severity of the Goldstein scale", () => {
    const crisis = parseExportCsv(gdeltLine({ [GdeltColumn.GoldsteinScale]: "-9" }))[0];
    const monitoring = parseExportCsv(gdeltLine({ [GdeltColumn.GoldsteinScale]: "3" }))[0];

    expect(crisis?.data.severity).toBe(IntelSeverity.Crisis);
    expect(crisis?.data.category).toBe(IntelSeverity[IntelSeverity.Crisis]);
    expect(monitoring?.data.severity).toBe(IntelSeverity.Monitoring);
    expect(monitoring?.data.category).toBe(IntelSeverity[IntelSeverity.Monitoring]);
  });
});
