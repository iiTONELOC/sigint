// ── Cyclones dossier cache ───────────────────────────────────────────
// Per-storm cache of NHC text products (Public Advisory, Forecast
// Discussion, Wind Speed Probabilities). Mirrors src/server/api/
// dossierCache.ts structurally — Map<stormId, CacheEntry<Bundle>>,
// 60-min TTL, stale-while-revalidate, 10-min purge interval.
//
// URL source: cyclonesCache.ts stashes the per-storm record from
// CurrentStorms.json after every successful poll. The 2019 NHC schema
// populates direct URLs in publicAdvisory / forecastDiscussion /
// windSpeedProbabilities — this cache reads those URLs as-is. No URL
// templating, no AWIPS slot computation.
//
// SSRF (OWASP A10): outbound URLs come exclusively from the NHC payload
// stashed by cyclonesCache.ts. The setStormProducts setter is called
// only by the cache itself (after parsing CurrentStorms.json), never
// from a client request. The :stormId path param is used as a Map key
// only — never interpolated into a URL.

import { getStormProducts } from "./cyclonesCache";
import { fetchWithTimeout } from "../lib/fetchWithTimeout";
import { createPerKeyCache } from "../lib/perKeyCache";

// ── Config ───────────────────────────────────────────────────────────

export const DOSSIER_CACHE_TTL_MS = 60 * 60_000;
const FETCH_TIMEOUT_MS = 8_000;
const PURGE_INTERVAL_MS = 10 * 60_000;

// ── Types ────────────────────────────────────────────────────────────

export type ProductBody = {
  advisoryNumber: string;
  issuedAt: string;
  body: string;
  /** NHC's published "next advisory" time, verbatim from the bulletin's
   *  NEXT ADVISORY section (e.g. "300 AM PDT" / "0900 UTC"). "" if absent. */
  nextAdvisory: string;
};

export type CycloneDossierBundle = {
  stormId: string;
  advisory?: ProductBody;
  discussion?: ProductBody;
  windProbs?: ProductBody;
};


// ── Fetch with timeout ───────────────────────────────────────────────

// ── Body parser ──────────────────────────────────────────────────────
// NHC wraps each text product in HTML with the bulletin in a <pre>
// element. Bulletin starts with `ZCZC <AWIPS>` and ends with `$$\nNNNN`.
// The `BULLETIN` line marks the start of human-readable content; the
// Advisory Number and timestamp lines live inside that body.

// Matches the "Advisory Number  13" or "Discussion Number  13" line
// regardless of what storm-classification prefix precedes it. Letter
// suffix `\d+[A-Z]?` covers the intermediate-advisory case (`11A`).
const ADVISORY_RE = /(?:Advisory|Discussion) Number\s+(\d+[A-Z]?)\b/i;
// Two timestamp formats are emitted by NHC:
//   AM/PM form  — "400 AM CDT Tue Oct 08 2024"
//   UTC form    — "0900 UTC MON OCT 07 2024"
const TIMESTAMP_RE =
  /^(\d{3,4}\s+(?:(?:AM|PM)\s+\w{3,4}|UTC)\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4})\s*$/im;
// Wind-probabilities products use "WIND SPEED PROBABILITIES NUMBER 8"
const WNDPRB_NUMBER_RE = /WIND SPEED PROBABILITIES NUMBER\s+(\d+[A-Z]?)/i;
// NHC closes each public advisory with a NEXT ADVISORY section, e.g.:
//   "Next complete advisory at 300 AM PDT."
//   "Next intermediate advisory at 1200 PM PDT."
// Capture the time phrase NHC actually published — never computed.
const NEXT_ADVISORY_RE =
  /Next (?:complete|intermediate)?\s*advisory at\s+(.+?)\.?\s*$/im;

const PRE_TAG_RE = /<pre[^>]*>/i;

function extractPreText(html: string): string | null {
  // HTMLRewriter is overkill for a single <pre> extraction in a static
  // page; a substring scan is simpler, deterministic, and avoids the
  // streaming-callback indirection. The NHC pages all have exactly one
  // <pre> block, so the first match wins.
  const open = PRE_TAG_RE.exec(html);
  if (!open) return null;
  const start = open.index;
  const openLen = open[0].length;
  const end = html.indexOf("</pre>", start + openLen);
  if (end < 0) return null;
  const inner = html.slice(start + openLen, end);
  // NHC pages don't HTML-entity-encode their bulletin text, but unescape
  // a few common ones defensively for fixture portability.
  return inner
    .replaceAll("&amp;", "&")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&#39;", "'")
    .replaceAll("&quot;", '"');
}

export function parseProductHtml(
  html: string,
  productKind: "advisory" | "discussion" | "windProbs",
): ProductBody | null {
  const pre = extractPreText(html);
  if (!pre) return null;

  // Body: everything between BULLETIN line and $$ trailer. Discussion
  // and wind-prob products typically don't have a "BULLETIN" line, so
  // start at the AWIPS header end (first blank line after ZCZC) and end
  // at $$.
  const trimmed = pre.trim();
  const stopIdx = trimmed.indexOf("\n$$");
  const body = (() => {
    if (stopIdx < 0) return trimmed;
    const bulletinIdx = trimmed.indexOf("BULLETIN\n");
    if (bulletinIdx >= 0) {
      return trimmed.slice(bulletinIdx + "BULLETIN\n".length, stopIdx).trim();
    }
    // No BULLETIN — start after the ZCZC/header block (first blank line).
    const firstBlank = trimmed.indexOf("\n\n");
    const start = firstBlank >= 0 ? firstBlank + 2 : 0;
    return trimmed.slice(start, stopIdx).trim();
  })();

  // Advisory number lookup. Wind-probs uses a different label.
  let advisoryNumber = "";
  const advMatch = ADVISORY_RE.exec(body);
  if (advMatch?.[1]) {
    advisoryNumber = advMatch[1];
  } else if (productKind === "windProbs") {
    const w = WNDPRB_NUMBER_RE.exec(body) ?? WNDPRB_NUMBER_RE.exec(trimmed);
    if (w?.[1]) advisoryNumber = w[1];
  }

  const tsMatch = TIMESTAMP_RE.exec(body);
  const issuedAt = tsMatch?.[1] ?? "";

  // NEXT ADVISORY can sit just after the $$ trailer, so search the whole
  // bulletin (trimmed), not just the extracted body.
  const nextMatch = NEXT_ADVISORY_RE.exec(trimmed);
  const nextAdvisory = nextMatch?.[1]?.trim() ?? "";

  return { advisoryNumber, issuedAt, body, nextAdvisory };
}

// ── Single-product fetch ─────────────────────────────────────────────

async function fetchProduct(
  url: string,
  productKind: "advisory" | "discussion" | "windProbs",
): Promise<ProductBody | undefined> {
  try {
    const res = await fetchWithTimeout(url, FETCH_TIMEOUT_MS);
    if (!res.ok) return undefined;
    const html = await res.text();
    const parsed = parseProductHtml(html, productKind);
    return parsed ?? undefined;
  } catch {
    return undefined;
  }
}

// ── Full bundle fetch ────────────────────────────────────────────────

async function fetchBundle(
  stormId: string,
): Promise<CycloneDossierBundle | null> {
  const products = getStormProducts(stormId);
  if (!products) return null;

  const [advisory, discussion, windProbs] = await Promise.all([
    products.advisoryUrl
      ? fetchProduct(products.advisoryUrl, "advisory")
      : Promise.resolve(undefined),
    products.discussionUrl
      ? fetchProduct(products.discussionUrl, "discussion")
      : Promise.resolve(undefined),
    products.windProbsUrl
      ? fetchProduct(products.windProbsUrl, "windProbs")
      : Promise.resolve(undefined),
  ]);

  // All products failed (transient outage) → null, not a hollow bundle that
  // would get cached for the full TTL and blank the dossier for 60 minutes.
  if (!advisory && !discussion && !windProbs) return null;

  return { stormId, advisory, discussion, windProbs };
}

// ── Public API ───────────────────────────────────────────────────────

export type CycloneDossierResult = {
  dossier: CycloneDossierBundle | null;
  fetchedAt: number;
};

/** Get the dossier for a storm, fetching if absent or expired. On
 *  background-refresh failure the stale entry is retained and returned
 *  (mirrors firmsCache stale-protect). */
// Dossier never caches a null bundle (isEmpty) — an outage keeps the last good
// bundle and keeps retrying, rather than caching the gap for the full TTL.
const dossierCache = createPerKeyCache<CycloneDossierBundle | null>({
  ttlMs: DOSSIER_CACHE_TTL_MS,
  purgeIntervalMs: PURGE_INTERVAL_MS,
  emptyValue: null,
  fetch: fetchBundle,
  isEmpty: (bundle) => bundle === null,
});

export async function getCycloneDossier(
  stormId: string,
): Promise<CycloneDossierResult> {
  const { value, fetchedAt } = await dossierCache.get(stormId);
  return { dossier: value, fetchedAt };
}

/** Test-only reset hook so specs run in isolation. */
export function __resetCycloneDossierCacheForTests(): void {
  dossierCache.reset();
}
