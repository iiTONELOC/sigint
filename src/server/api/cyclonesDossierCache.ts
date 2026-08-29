import { getStormProducts } from "./cyclonesCache";
import { fetchWithTimeout, FETCH_TIMEOUT_STANDARD_MS } from "../lib/fetchWithTimeout";
import { createPerKeyCache, PURGE_INTERVAL_MS } from "../lib/perKeyCache";
import { decodeHtmlEntities } from "../lib/htmlEntities";
import {
  CycloneDossierProductKind,
  type CycloneDossierBundle,
  type CycloneDossierProductBody,
  type CycloneDossierResult,
} from "@shared/domain/cyclones";

export const DOSSIER_CACHE_TTL_MS = 60 * 60_000;

const ADVISORY_NUMBER_PATTERN = /(?:Advisory|Discussion) Number\s+(\d+[A-Z]?)\b/i;
const TIMESTAMP_PATTERN =
  /^(\d{3,4}\s+(?:(?:AM|PM)\s+\w{3,4}|UTC)\s+\w{3}\s+\w{3}\s+\d{1,2}\s+\d{4})\s*$/im;
const WIND_PROBABILITY_NUMBER_PATTERN = /WIND SPEED PROBABILITIES NUMBER\s+(\d+[A-Z]?)/i;
const PRE_TAG_PATTERN = /<pre[^>]*>/i;
const NEXT_ADVISORY_PREFIX_PATTERN = /Next (?:complete|intermediate)?\s*advisory at\s+/i;

function nextAdvisoryOf(body: string): string {
  const prefix = NEXT_ADVISORY_PREFIX_PATTERN.exec(body);
  if (!prefix) return "";
  const start = prefix.index + prefix[0].length;
  const lineEnd = body.indexOf("\n", start);
  const value = body.slice(start, lineEnd < 0 ? body.length : lineEnd).trim();
  return value.length > 1 && value.endsWith(".")
    ? value.slice(0, -1).trimEnd()
    : value;
}

const WRAPPED_PROSE_MINIMUM_LENGTH = 50;
const LOWERCASE_PATTERN = /[a-z]/;

/** NHC hard-wraps prose at 70 columns. Join those lines; keep tables,
 *  upper-case summary blocks, and one blank line between paragraphs. */
export function reflowWrappedProse(body: string): string {
  const output: string[] = [];
  for (const raw of body.split("\n")) {
    const line = raw.trimEnd();
    const previous = output.at(-1);
    if (line === "" && previous === "") continue;
    const wrapped =
      previous !== undefined &&
      previous.length >= WRAPPED_PROSE_MINIMUM_LENGTH &&
      LOWERCASE_PATTERN.test(previous) &&
      LOWERCASE_PATTERN.test(line);
    if (wrapped) output[output.length - 1] = `${previous} ${line.trimStart()}`;
    else output.push(line);
  }
  return output.join("\n");
}

function extractPreText(html: string): string | null {
  const open = PRE_TAG_PATTERN.exec(html);
  if (!open) return null;
  const start = open.index + open[0].length;
  const end = html.indexOf("</pre>", start);
  if (end < 0) return null;
  return decodeHtmlEntities(html.slice(start, end));
}

export function parseProductHtml(html: string, productKind: CycloneDossierProductKind):
  CycloneDossierProductBody | null {
  const preformattedText = extractPreText(html);
  if (!preformattedText) return null;

  const trimmed = preformattedText.trim();
  const stopIndex = trimmed.indexOf("\n$$");
  const body = (() => {
    if (stopIndex < 0) return trimmed;
    const bulletinIndex = trimmed.indexOf("BULLETIN\n");
    if (bulletinIndex >= 0) {
      return trimmed.slice(bulletinIndex + "BULLETIN\n".length, stopIndex).trim();
    }
    const firstBlank = trimmed.indexOf("\n\n");
    const start = firstBlank >= 0 ? firstBlank + 2 : 0;
    return trimmed.slice(start, stopIndex).trim();
  })();

  let advisoryNumber = "";
  const advisoryMatch = ADVISORY_NUMBER_PATTERN.exec(body);
  if (advisoryMatch?.[1]) {
    advisoryNumber = advisoryMatch[1];
  } else if (productKind === CycloneDossierProductKind.WindProbabilities) {
    const windMatch = WIND_PROBABILITY_NUMBER_PATTERN.exec(body) ??
      WIND_PROBABILITY_NUMBER_PATTERN.exec(trimmed);
    if (windMatch?.[1]) advisoryNumber = windMatch[1];
  }

  const timestampMatch = TIMESTAMP_PATTERN.exec(body);
  const issuedAt = timestampMatch?.[1] ?? "";

  const nextAdvisory = nextAdvisoryOf(trimmed);

  return { advisoryNumber, issuedAt, body: reflowWrappedProse(body), nextAdvisory };
}

async function fetchProduct(
  url: string | undefined, productKind: CycloneDossierProductKind,
): Promise<CycloneDossierProductBody | undefined> {
  if (!url) return undefined;
  try {
    const response = await fetchWithTimeout(url, FETCH_TIMEOUT_STANDARD_MS);
    if (!response.ok) return undefined;
    return parseProductHtml(await response.text(), productKind) ?? undefined;
  } catch {
    return undefined;
  }
}

async function fetchBundle(stormId: string): Promise<CycloneDossierBundle | null> {
  const products = getStormProducts(stormId);
  if (!products) return null;

  const [advisory, discussion, windProbs] = await Promise.all([
    fetchProduct(products.advisoryUrl, CycloneDossierProductKind.Advisory),
    fetchProduct(products.discussionUrl, CycloneDossierProductKind.Discussion),
    fetchProduct(products.windProbsUrl, CycloneDossierProductKind.WindProbabilities),
  ]);

  if (!advisory && !discussion && !windProbs) return null;

  return { stormId, advisory, discussion, windProbs };
}

const dossierCache = createPerKeyCache<CycloneDossierBundle | null>({
  ttlMs: DOSSIER_CACHE_TTL_MS,
  purgeIntervalMs: PURGE_INTERVAL_MS,
  emptyValue: null,
  fetch: fetchBundle,
  isEmpty: (bundle) => bundle === null,
});

export async function getCycloneDossier(stormId: string): Promise<CycloneDossierResult> {
  const { value, fetchedAt } = await dossierCache.get(stormId);
  return { dossier: value, fetchedAt };
}

export function __resetCycloneDossierCacheForTests(): void {
  dossierCache.reset();
}
