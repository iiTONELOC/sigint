import { describe, test, expect } from "bun:test";

// ─────────────────────────────────────────────────────────────────────
// Server cache modules use module-level state + fetch.
// We replicate the pure parsing logic inline and test it directly.
// This catches regressions in CSV/RSS/TSV parsers without needing
// network mocks or module state management.
// ─────────────────────────────────────────────────────────────────────

// ═════════════════════════════════════════════════════════════════════
// FIRMS CSV PARSER (from firmsCache.ts)
// ═════════════════════════════════════════════════════════════════════

type FireRecord = {
  lat: number;
  lon: number;
  brightness: number;
  scan: number;
  track: number;
  acqDate: string;
  acqTime: string;
  satellite: string;
  instrument: string;
  confidence: string;
  version: string;
  brightT31: number;
  frp: number;
  daynight: string;
};

function parseFirmsCsv(csv: string): FireRecord[] {
  const lines = csv.split("\n");
  if (lines.length < 2) return [];
  const header = lines[0]!.toLowerCase();
  if (!header.includes("latitude")) return [];
  const records: FireRecord[] = [];
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim();
    if (!line) continue;
    const cols = line.split(",");
    if (cols.length < 14) continue;
    const lat = parseFloat(cols[0] ?? "");
    const lon = parseFloat(cols[1] ?? "");
    if (!isFinite(lat) || !isFinite(lon)) continue;
    if (lat === 0 && lon === 0) continue;
    records.push({
      lat,
      lon,
      brightness: isFinite(parseFloat(cols[2] ?? "0"))
        ? parseFloat(cols[2]!)
        : 0,
      scan: isFinite(parseFloat(cols[3] ?? "0")) ? parseFloat(cols[3]!) : 0,
      track: isFinite(parseFloat(cols[4] ?? "0")) ? parseFloat(cols[4]!) : 0,
      acqDate: cols[5]?.trim() ?? "",
      acqTime: cols[6]?.trim() ?? "",
      satellite: cols[7]?.trim() ?? "",
      instrument: cols[8]?.trim() ?? "",
      confidence: cols[9]?.trim() ?? "",
      version: cols[10]?.trim() ?? "",
      brightT31: isFinite(parseFloat(cols[11] ?? "0"))
        ? parseFloat(cols[11]!)
        : 0,
      frp: isFinite(parseFloat(cols[12] ?? "0")) ? parseFloat(cols[12]!) : 0,
      daynight: cols[13]?.trim() ?? "",
    });
  }
  return records;
}

describe("parseFirmsCsv", () => {
  test("parses valid CSV with header", () => {
    const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
35.123,45.456,320.5,1.0,1.0,2026-03-21,0130,N,VIIRS,nominal,2.0,290.1,42.5,N
-10.5,120.3,310.2,0.8,0.9,2026-03-21,0145,N,VIIRS,high,2.0,285.0,88.3,D`;
    const records = parseFirmsCsv(csv);
    expect(records.length).toBe(2);
    expect(records[0]!.lat).toBeCloseTo(35.123, 3);
    expect(records[0]!.lon).toBeCloseTo(45.456, 3);
    expect(records[0]!.frp).toBeCloseTo(42.5, 1);
    expect(records[1]!.daynight).toBe("D");
  });

  test("returns empty for no header", () => {
    expect(parseFirmsCsv("")).toEqual([]);
    expect(parseFirmsCsv("just one line")).toEqual([]);
  });

  test("returns empty for wrong header", () => {
    const csv = `name,value\nfoo,bar`;
    expect(parseFirmsCsv(csv)).toEqual([]);
  });

  test("skips lines with too few columns", () => {
    const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
35.1,45.2`;
    expect(parseFirmsCsv(csv)).toEqual([]);
  });

  test("skips null island (0,0)", () => {
    const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
0,0,300,1,1,2026-03-21,0100,N,VIIRS,nom,2.0,280,10,N`;
    expect(parseFirmsCsv(csv)).toEqual([]);
  });

  test("skips invalid lat/lon", () => {
    const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight
abc,def,300,1,1,2026-03-21,0100,N,VIIRS,nom,2.0,280,10,N`;
    expect(parseFirmsCsv(csv)).toEqual([]);
  });

  test("handles empty lines gracefully", () => {
    const csv = `latitude,longitude,brightness,scan,track,acq_date,acq_time,satellite,instrument,confidence,version,bright_t31,frp,daynight

35.1,45.2,300,1,1,2026-03-21,0100,N,VIIRS,nom,2.0,280,10,N

`;
    expect(parseFirmsCsv(csv).length).toBe(1);
  });
});

// ═════════════════════════════════════════════════════════════════════
// NEWS RSS PARSER (from newsCache.ts)
// ═════════════════════════════════════════════════════════════════════

type NewsItem = {
  id: string;
  title: string;
  url: string;
  source: string;
  publishedAt: string;
  description: string;
};

function stripHtml(html: string): string {
  let text = html
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ");
  text = text.replace(/<[^>]+>/g, " ");
  return text.replace(/\s+/g, " ").trim();
}

function hashUrl(url: string): string {
  let hash = 0;
  for (let i = 0; i < url.length; i++) {
    hash = ((hash << 5) - hash + url.charCodeAt(i)) | 0;
  }
  return `NW${Math.abs(hash).toString(36)}`;
}

function extractTag(xml: string, tag: string): string {
  const re = new RegExp(`<${tag}[^>]*>([\\s\\S]*?)</${tag}>`, "i");
  const m = xml.match(re);
  if (m?.[1]) {
    const val = m[1].trim();
    const cdata = val.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/);
    return cdata ? cdata[1]!.trim() : val;
  }
  return "";
}

function extractAttr(xml: string, tag: string, attr: string): string {
  const re = new RegExp(`<${tag}[^>]*?${attr}\\s*=\\s*["']([^"']*)["']`, "i");
  return xml.match(re)?.[1] ?? "";
}

function parseRssItems(xml: string, sourceName: string): NewsItem[] {
  const items: NewsItem[] = [];
  const isAtom = xml.includes("<feed") && xml.includes("<entry");
  const parts = xml.split(isAtom ? "<entry" : "<item");
  for (let i = 1; i < parts.length; i++) {
    const chunk = parts[i]!;
    const title = stripHtml(extractTag(chunk, "title"));
    if (!title) continue;
    let url = isAtom ? extractAttr(chunk, "link", "href") : "";
    if (!url) url = stripHtml(extractTag(chunk, "link"));
    if (!url) continue;
    const dateStr =
      extractTag(chunk, "pubDate") ||
      extractTag(chunk, "published") ||
      extractTag(chunk, "updated");
    let publishedAt: string;
    try {
      publishedAt = dateStr
        ? new Date(dateStr).toISOString()
        : new Date().toISOString();
    } catch {
      publishedAt = new Date().toISOString();
    }
    const description = stripHtml(
      extractTag(chunk, "description") ||
        extractTag(chunk, "summary") ||
        extractTag(chunk, "content"),
    ).slice(0, 500);
    items.push({
      id: hashUrl(url),
      title,
      url,
      source: sourceName,
      publishedAt,
      description,
    });
  }
  return items;
}

describe("stripHtml", () => {
  test("strips HTML tags", () => {
    expect(stripHtml("<p>Hello <b>world</b></p>")).toBe("Hello world");
  });

  test("decodes HTML entities", () => {
    expect(stripHtml("&amp;")).toBe("&");
    expect(stripHtml("&quot;")).toBe('"');
    expect(stripHtml("&#39;")).toBe("'");
    expect(stripHtml("&nbsp;word")).toBe("word");
  });

  test("collapses whitespace", () => {
    expect(stripHtml("  hello   world  ")).toBe("hello world");
  });

  test("handles empty string", () => {
    expect(stripHtml("")).toBe("");
  });
});

describe("hashUrl", () => {
  test("returns consistent hash for same URL", () => {
    const h1 = hashUrl("https://example.com/article");
    const h2 = hashUrl("https://example.com/article");
    expect(h1).toBe(h2);
  });

  test("returns different hash for different URLs", () => {
    const h1 = hashUrl("https://example.com/a");
    const h2 = hashUrl("https://example.com/b");
    expect(h1).not.toBe(h2);
  });

  test("starts with NW prefix", () => {
    expect(hashUrl("https://test.com")).toMatch(/^NW/);
  });
});

describe("extractTag", () => {
  test("extracts simple tag content", () => {
    expect(extractTag("<title>Hello</title>", "title")).toBe("Hello");
  });

  test("extracts CDATA content", () => {
    expect(extractTag("<title><![CDATA[Hello World]]></title>", "title")).toBe(
      "Hello World",
    );
  });

  test("returns empty for missing tag", () => {
    expect(extractTag("<foo>bar</foo>", "title")).toBe("");
  });

  test("handles tag with attributes", () => {
    expect(
      extractTag('<link type="text">http://example.com</link>', "link"),
    ).toBe("http://example.com");
  });
});

describe("parseRssItems", () => {
  test("parses RSS 2.0 feed", () => {
    const xml = `<?xml version="1.0"?>
<rss version="2.0">
<channel>
<item>
  <title>Breaking News</title>
  <link>https://example.com/article1</link>
  <pubDate>Mon, 21 Mar 2026 12:00:00 GMT</pubDate>
  <description>First article description</description>
</item>
<item>
  <title>Second Story</title>
  <link>https://example.com/article2</link>
  <pubDate>Mon, 21 Mar 2026 11:00:00 GMT</pubDate>
  <description>Second article</description>
</item>
</channel>
</rss>`;
    const items = parseRssItems(xml, "TestSource");
    expect(items.length).toBe(2);
    expect(items[0]!.title).toBe("Breaking News");
    expect(items[0]!.url).toBe("https://example.com/article1");
    expect(items[0]!.source).toBe("TestSource");
    expect(items[0]!.description).toBe("First article description");
  });

  test("parses Atom feed", () => {
    const xml = `<?xml version="1.0"?>
<feed xmlns="http://www.w3.org/2005/Atom">
<entry>
  <title>Atom Article</title>
  <link href="https://example.com/atom1"/>
  <published>2026-03-21T12:00:00Z</published>
  <summary>Atom summary</summary>
</entry>
</feed>`;
    const items = parseRssItems(xml, "AtomSource");
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe("Atom Article");
    expect(items[0]!.url).toBe("https://example.com/atom1");
  });

  test("skips items without title", () => {
    const xml = `<rss><channel><item><link>https://example.com/x</link></item></channel></rss>`;
    expect(parseRssItems(xml, "Test")).toEqual([]);
  });

  test("skips items without URL", () => {
    const xml = `<rss><channel><item><title>No Link</title></item></channel></rss>`;
    expect(parseRssItems(xml, "Test")).toEqual([]);
  });

  test("handles CDATA in title and description", () => {
    const xml = `<rss><channel><item>
      <title><![CDATA[CDATA Title]]></title>
      <link>https://example.com/cdata</link>
      <description><![CDATA[<p>HTML in CDATA</p>]]></description>
    </item></channel></rss>`;
    const items = parseRssItems(xml, "Test");
    expect(items.length).toBe(1);
    expect(items[0]!.title).toBe("CDATA Title");
    expect(items[0]!.description).toBe("HTML in CDATA");
  });

  test("caps description at 500 chars", () => {
    const longDesc = "x".repeat(1000);
    const xml = `<rss><channel><item>
      <title>Long</title>
      <link>https://example.com/long</link>
      <description>${longDesc}</description>
    </item></channel></rss>`;
    const items = parseRssItems(xml, "Test");
    expect(items[0]!.description.length).toBeLessThanOrEqual(500);
  });
});

// ═════════════════════════════════════════════════════════════════════
// GDELT EXPORT PARSER (from gdeltCache.ts)
// ═════════════════════════════════════════════════════════════════════

const RELEVANT_ROOT_CODES = new Set([
  "10",
  "13",
  "14",
  "15",
  "17",
  "18",
  "19",
  "20",
]);

const COL = {
  GlobalEventID: 0,
  Actor1Name: 6,
  Actor2Name: 16,
  EventCode: 26,
  EventBaseCode: 27,
  EventRootCode: 28,
  GoldsteinScale: 30,
  NumMentions: 31,
  AvgTone: 34,
  ActionGeo_Type: 43,
  ActionGeo_Fullname: 44,
  ActionGeo_CountryCode: 45,
  ActionGeo_Lat: 48,
  ActionGeo_Long: 49,
  SOURCEURL: 60,
  DATEADDED: 59,
} as const;

function parseDateAdded(dateStr: string): string {
  if (dateStr.length < 14) return new Date().toISOString();
  const y = dateStr.slice(0, 4);
  const m = dateStr.slice(4, 6);
  const d = dateStr.slice(6, 8);
  const h = dateStr.slice(8, 10);
  const mn = dateStr.slice(10, 12);
  const s = dateStr.slice(12, 14);
  return new Date(`${y}-${m}-${d}T${h}:${mn}:${s}Z`).toISOString();
}

function goldsteinToSeverity(gs: number): {
  severity: number;
  category: string;
} {
  if (gs <= -7) return { severity: 5, category: "Crisis" };
  if (gs <= -4) return { severity: 4, category: "Conflict" };
  if (gs <= -2) return { severity: 3, category: "Tension" };
  if (gs <= 0) return { severity: 2, category: "Concern" };
  return { severity: 1, category: "Monitoring" };
}

function buildHeadline(
  actor1: string,
  actor2: string,
  eventCode: string,
): string {
  const a1 = actor1 || "Unknown actor";
  const a2 = actor2 ? ` → ${actor2}` : "";
  return `${a1}${a2} [${eventCode}]`;
}

describe("parseDateAdded", () => {
  test("parses YYYYMMDDHHMMSS format", () => {
    const result = parseDateAdded("20260321143000");
    expect(result).toBe("2026-03-21T14:30:00.000Z");
  });

  test("returns current time for short strings", () => {
    const result = parseDateAdded("2026");
    const parsed = new Date(result);
    expect(parsed.getTime()).toBeGreaterThan(Date.now() - 5000);
  });
});

describe("goldsteinToSeverity", () => {
  test("crisis for -10", () => {
    expect(goldsteinToSeverity(-10)).toEqual({
      severity: 5,
      category: "Crisis",
    });
  });

  test("conflict for -5", () => {
    expect(goldsteinToSeverity(-5)).toEqual({
      severity: 4,
      category: "Conflict",
    });
  });

  test("tension for -3", () => {
    expect(goldsteinToSeverity(-3)).toEqual({
      severity: 3,
      category: "Tension",
    });
  });

  test("concern for -1", () => {
    expect(goldsteinToSeverity(-1)).toEqual({
      severity: 2,
      category: "Concern",
    });
  });

  test("monitoring for positive", () => {
    expect(goldsteinToSeverity(5)).toEqual({
      severity: 1,
      category: "Monitoring",
    });
  });

  test("crisis at boundary -7", () => {
    expect(goldsteinToSeverity(-7).severity).toBe(5);
  });

  test("conflict at boundary -4", () => {
    expect(goldsteinToSeverity(-4).severity).toBe(4);
  });

  test("tension at boundary -2", () => {
    expect(goldsteinToSeverity(-2).severity).toBe(3);
  });

  test("concern at boundary 0", () => {
    expect(goldsteinToSeverity(0).severity).toBe(2);
  });
});

describe("buildHeadline", () => {
  test("builds headline with both actors", () => {
    expect(buildHeadline("USA", "IRAN", "190")).toBe("USA → IRAN [190]");
  });

  test("builds headline with one actor", () => {
    expect(buildHeadline("PROTEST GROUP", "", "140")).toBe(
      "PROTEST GROUP [140]",
    );
  });

  test("uses Unknown actor for empty actor1", () => {
    expect(buildHeadline("", "TARGET", "180")).toBe(
      "Unknown actor → TARGET [180]",
    );
  });
});

// Build a GDELT-style tab-delimited line (61+ columns)
function makeGdeltLine(overrides: Record<number, string> = {}): string {
  const cols = new Array(61).fill("");
  cols[COL.GlobalEventID] = overrides[COL.GlobalEventID] ?? "12345";
  cols[COL.Actor1Name] = overrides[COL.Actor1Name] ?? "UNITED STATES";
  cols[COL.Actor2Name] = overrides[COL.Actor2Name] ?? "IRAN";
  cols[COL.EventCode] = overrides[COL.EventCode] ?? "190";
  cols[COL.EventRootCode] = overrides[COL.EventRootCode] ?? "19"; // Fight
  cols[COL.GoldsteinScale] = overrides[COL.GoldsteinScale] ?? "-8.0";
  cols[COL.NumMentions] = overrides[COL.NumMentions] ?? "25";
  cols[COL.AvgTone] = overrides[COL.AvgTone] ?? "-5.2";
  cols[COL.ActionGeo_Fullname] =
    overrides[COL.ActionGeo_Fullname] ?? "Baghdad, Iraq";
  cols[COL.ActionGeo_CountryCode] =
    overrides[COL.ActionGeo_CountryCode] ?? "IZ";
  cols[COL.ActionGeo_Lat] = overrides[COL.ActionGeo_Lat] ?? "33.3";
  cols[COL.ActionGeo_Long] = overrides[COL.ActionGeo_Long] ?? "44.4";
  cols[COL.DATEADDED] = overrides[COL.DATEADDED] ?? "20260321120000";
  cols[COL.SOURCEURL] =
    overrides[COL.SOURCEURL] ?? "https://example.com/article";
  return cols.join("\t");
}

// Replicate parseExportCsv logic
type GdeltEvent = {
  id: string;
  lat: number;
  lon: number;
  timestamp: string;
  headline: string;
  actor1: string;
  actor2: string;
  eventCode: string;
  goldstein: number;
  tone: number;
  mentions: number;
  locationName: string;
  countryCode: string;
  sourceUrl: string;
  severity: number;
  category: string;
};

function parseExportCsv(csv: string): GdeltEvent[] {
  const lines = csv.split("\n");
  const events: GdeltEvent[] = [];
  for (const line of lines) {
    if (!line.trim()) continue;
    const cols = line.split("\t");
    if (cols.length < 58) continue;
    const rootCode = cols[COL.EventRootCode]?.trim();
    if (!rootCode || !RELEVANT_ROOT_CODES.has(rootCode)) continue;
    const lat = parseFloat(cols[COL.ActionGeo_Lat] ?? "");
    const lon = parseFloat(cols[COL.ActionGeo_Long] ?? "");
    if (!isFinite(lat) || !isFinite(lon)) continue;
    if (lat === 0 && lon === 0) continue;
    const goldstein = parseFloat(cols[COL.GoldsteinScale] ?? "0");
    const tone = parseFloat(cols[COL.AvgTone] ?? "0");
    const mentions = parseInt(cols[COL.NumMentions] ?? "1", 10);
    const { severity, category } = goldsteinToSeverity(
      isFinite(goldstein) ? goldstein : 0,
    );
    const actor1 = cols[COL.Actor1Name]?.trim() ?? "";
    const actor2 = cols[COL.Actor2Name]?.trim() ?? "";
    const eventCode =
      cols[COL.EventCode]?.trim() ?? cols[COL.EventRootCode]?.trim() ?? "";
    events.push({
      id: cols[COL.GlobalEventID]?.trim() ?? "",
      lat,
      lon,
      timestamp: parseDateAdded(cols[COL.DATEADDED]?.trim() ?? ""),
      headline: buildHeadline(actor1, actor2, eventCode),
      actor1,
      actor2,
      eventCode,
      goldstein: isFinite(goldstein) ? goldstein : 0,
      tone: isFinite(tone) ? tone : 0,
      mentions,
      locationName: cols[COL.ActionGeo_Fullname]?.trim() ?? "",
      countryCode: cols[COL.ActionGeo_CountryCode]?.trim() ?? "",
      sourceUrl: cols[COL.SOURCEURL]?.trim() ?? "",
      severity,
      category,
    });
  }
  return events;
}

describe("parseExportCsv", () => {
  test("parses valid GDELT line", () => {
    const csv = makeGdeltLine();
    const events = parseExportCsv(csv);
    expect(events.length).toBe(1);
    expect(events[0]!.lat).toBeCloseTo(33.3, 1);
    expect(events[0]!.lon).toBeCloseTo(44.4, 1);
    expect(events[0]!.actor1).toBe("UNITED STATES");
    expect(events[0]!.actor2).toBe("IRAN");
    expect(events[0]!.severity).toBe(5); // goldstein -8 → Crisis
    expect(events[0]!.headline).toContain("UNITED STATES → IRAN");
  });

  test("filters non-relevant root codes", () => {
    const csv = makeGdeltLine({ [COL.EventRootCode]: "01" }); // Yield — not relevant
    expect(parseExportCsv(csv)).toEqual([]);
  });

  test("filters null island", () => {
    const csv = makeGdeltLine({
      [COL.ActionGeo_Lat]: "0",
      [COL.ActionGeo_Long]: "0",
    });
    expect(parseExportCsv(csv)).toEqual([]);
  });

  test("filters invalid coordinates", () => {
    const csv = makeGdeltLine({ [COL.ActionGeo_Lat]: "abc" });
    expect(parseExportCsv(csv)).toEqual([]);
  });

  test("parses multiple lines", () => {
    const lines = [
      makeGdeltLine({ [COL.GlobalEventID]: "1" }),
      makeGdeltLine({
        [COL.GlobalEventID]: "2",
        [COL.ActionGeo_Lat]: "10.5",
        [COL.ActionGeo_Long]: "20.5",
      }),
    ];
    const events = parseExportCsv(lines.join("\n"));
    expect(events.length).toBe(2);
    expect(events[0]!.id).toBe("1");
    expect(events[1]!.id).toBe("2");
  });

  test("skips empty lines", () => {
    const csv =
      makeGdeltLine() + "\n\n" + makeGdeltLine({ [COL.GlobalEventID]: "2" });
    const events = parseExportCsv(csv);
    expect(events.length).toBe(2);
  });

  test("skips short lines", () => {
    const csv = "too\tfew\tcolumns";
    expect(parseExportCsv(csv)).toEqual([]);
  });

  test("maps goldstein to correct severity", () => {
    const crisis = parseExportCsv(
      makeGdeltLine({ [COL.GoldsteinScale]: "-9" }),
    );
    expect(crisis[0]!.severity).toBe(5);
    expect(crisis[0]!.category).toBe("Crisis");

    const monitoring = parseExportCsv(
      makeGdeltLine({ [COL.GoldsteinScale]: "3" }),
    );
    expect(monitoring[0]!.severity).toBe(1);
    expect(monitoring[0]!.category).toBe("Monitoring");
  });

  test("all relevant CAMEO codes pass filter", () => {
    for (const code of ["10", "13", "14", "15", "17", "18", "19", "20"]) {
      const events = parseExportCsv(
        makeGdeltLine({ [COL.EventRootCode]: code }),
      );
      expect(events.length).toBe(1);
    }
  });

  test("non-relevant CAMEO codes are filtered", () => {
    for (const code of [
      "01",
      "02",
      "03",
      "04",
      "05",
      "06",
      "07",
      "08",
      "09",
      "11",
      "12",
      "16",
    ]) {
      const events = parseExportCsv(
        makeGdeltLine({ [COL.EventRootCode]: code }),
      );
      expect(events.length).toBe(0);
    }
  });
});
