import {
  FETCH_TIMEOUT_STANDARD_MS,
  UpstreamRefusal,
  fetchJson,
} from "../lib/fetchWithTimeout";
import { createLogger } from "../lib/logger";
import { errorMessage } from "../lib/errorMessage";
import { HttpHeader, HttpUserAgent } from "@shared/http";
import {
  EncyclopediaRoute,
  type EncyclopediaArticle,
  type EncyclopediaPhoto,
  type EncyclopediaTypeQuery,
  type EncyclopediaVesselAnswer,
} from "@shared/domain/encyclopedia";

const logger = createLogger({ service: "encyclopedia" });

enum WikipediaEndpoint {
  Search = "https://en.wikipedia.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=",
  Summary = "https://en.wikipedia.org/api/rest_v1/page/summary/",
}

enum WikidataEndpoint {
  Entity = "https://www.wikidata.org/w/api.php?action=wbgetentities&props=sitelinks&sitefilter=enwiki&format=json&ids=",
  Search = "https://www.wikidata.org/w/api.php?action=query&list=search&srlimit=1&format=json&srsearch=haswbstatement:P458=",
}

enum CommonsEndpoint {
  Photo = "https://commons.wikimedia.org/w/api.php?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=1&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=640",
}

enum CommonsMetadata {
  Artist = "Artist",
  License = "LicenseShortName",
}

enum EncyclopediaCachePolicy {
  MaxEntries = 2_000,
  TtlMs = 604_800_000,
}

enum EncyclopediaReject {
  ListPrefix = "list of",
  SummaryType = "disambiguation",
}

enum EncyclopediaMatch {
  MinTokenLength = 3,
}

const UPSTREAM_HEADERS = { [HttpHeader.UserAgent]: HttpUserAgent.SigintRepository };
const TOKEN_BREAK = /[^a-z0-9]+/;
const TYPE_NUMBER = new RegExp(String.raw`\d{${EncyclopediaMatch.MinTokenLength},}`);
const HTML_TAG = /<[^>]+>/g;
const NO_VESSEL_ANSWER: EncyclopediaVesselAnswer = { article: null, photo: null };

type SearchResponse = Readonly<{
  query?: { search?: ReadonlyArray<{ title: string }> };
}>;

type SummaryResponse = Readonly<{
  title?: string;
  type?: string;
  extract?: string;
  content_urls?: { desktop?: { page?: string } };
  thumbnail?: { source: string; width: number; height: number };
}>;

type EntityResponse = Readonly<{
  entities?: Record<string, { sitelinks?: { enwiki?: { title: string } } }>;
}>;

type CommonsImageInfo = Readonly<{
  thumburl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  descriptionurl?: string;
  extmetadata?: Record<string, { value?: string }>;
}>;

type CommonsResponse = Readonly<{
  query?: { pages?: Record<string, { imageinfo?: ReadonlyArray<CommonsImageInfo> }> };
}>;

type EncyclopediaEntry = Readonly<{
  value: unknown;
  fetchedAt: number;
}>;

const cache = new Map<string, EncyclopediaEntry>();
let refusedUntil = 0;
let queue: Promise<unknown> = Promise.resolve();

export function titleFromSearch(raw: SearchResponse): string | null {
  return raw.query?.search?.[0]?.title ?? null;
}

export function titleFromEntity(raw: EntityResponse, id: string): string | null {
  return raw.entities?.[id]?.sitelinks?.enwiki?.title ?? null;
}

export function articleFromSummary(raw: SummaryResponse): EncyclopediaArticle | null {
  const url = raw.content_urls?.desktop?.page;
  if (!raw.title || !url || raw.type === EncyclopediaReject.SummaryType) return null;
  const thumbnail = raw.thumbnail;
  return {
    title: raw.title,
    extract: raw.extract ?? "",
    url,
    image: thumbnail
      ? { src: thumbnail.source, width: thumbnail.width, height: thumbnail.height }
      : null,
  };
}

export function photoFromCommons(raw: CommonsResponse): EncyclopediaPhoto | null {
  const info = Object.values(raw.query?.pages ?? {})[0]?.imageinfo?.[0];
  if (!info?.thumburl || !info.descriptionurl || !info.thumbwidth || !info.thumbheight) return null;
  const metadata = info.extmetadata ?? {};
  return {
    src: info.thumburl,
    width: info.thumbwidth,
    height: info.thumbheight,
    link: info.descriptionurl,
    credit: (metadata[CommonsMetadata.Artist]?.value ?? "").replace(HTML_TAG, "").trim(),
    license: metadata[CommonsMetadata.License]?.value ?? "",
  };
}

function serial<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function fetchUpstream<T>(url: string): Promise<T | null> {
  return serial(() =>
    fetchJson<T>(url, FETCH_TIMEOUT_STANDARD_MS, { headers: UPSTREAM_HEADERS }),
  );
}

async function summaryArticle(title: string): Promise<EncyclopediaArticle | null> {
  const summary = await fetchUpstream<SummaryResponse>(
    `${WikipediaEndpoint.Summary}${encodeURIComponent(title)}`,
  );
  return summary ? articleFromSummary(summary) : null;
}

async function lookupArticle(query: string): Promise<EncyclopediaArticle | null> {
  const search = await fetchUpstream<SearchResponse>(
    `${WikipediaEndpoint.Search}${encodeURIComponent(query)}`,
  );
  const title = search ? titleFromSearch(search) : null;
  return title ? summaryArticle(title) : null;
}

async function lookupVesselArticle(imo: number): Promise<EncyclopediaArticle | null> {
  const search = await fetchUpstream<SearchResponse>(`${WikidataEndpoint.Search}${imo}`);
  const id = search ? titleFromSearch(search) : null;
  if (!id) return null;
  const entity = await fetchUpstream<EntityResponse>(`${WikidataEndpoint.Entity}${id}`);
  const title = entity ? titleFromEntity(entity, id) : null;
  return title ? summaryArticle(title) : null;
}

async function lookupVesselPhoto(imo: number): Promise<EncyclopediaPhoto | null> {
  const category = encodeURIComponent(`deepcat:"IMO ${imo}"`);
  const url = `${CommonsEndpoint.Photo}&iiextmetadatafilter=${CommonsMetadata.Artist}|${CommonsMetadata.License}&gsrsearch=${category}`;
  const found = await fetchUpstream<CommonsResponse>(url);
  return found ? photoFromCommons(found) : null;
}

async function lookupVessel(imo: number): Promise<EncyclopediaVesselAnswer> {
  return { article: await lookupVesselArticle(imo), photo: await lookupVesselPhoto(imo) };
}

function typeTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(TOKEN_BREAK)
    .filter((token) => token.length >= EncyclopediaMatch.MinTokenLength)
    .flatMap((token) => [token, ...(token.match(TYPE_NUMBER) ?? [])]);
}

export function acceptsArticle(article: EncyclopediaArticle, query: string): boolean {
  const title = article.title.toLowerCase();
  if (title.startsWith(EncyclopediaReject.ListPrefix)) return false;
  const haystack = title.split(TOKEN_BREAK).join("");
  return typeTokens(query).some((token) => haystack.includes(token));
}

export function typeQueries(query: EncyclopediaTypeQuery): string[] {
  const named = `${query.manufacturer ?? ""} ${query.model ?? ""}`.trim();
  const candidates = new Set([query.description?.trim() ?? "", query.model?.trim() ?? "", named]);
  return [...candidates].filter((candidate) => candidate.length > 0);
}

async function lookupAircraftType(
  query: EncyclopediaTypeQuery,
): Promise<EncyclopediaArticle | null> {
  for (const candidate of typeQueries(query)) {
    const article = await lookupArticle(candidate);
    if (article && acceptsArticle(article, candidate)) return article;
  }
  return null;
}

function remember<T>(key: string, value: T): T {
  if (cache.size >= EncyclopediaCachePolicy.MaxEntries) {
    const oldest = cache.keys().next();
    if (!oldest.done) cache.delete(oldest.value);
  }
  cache.set(key, { value, fetchedAt: Date.now() });
  return value;
}

async function cached<T>(key: string, lookup: () => Promise<T>): Promise<T | null> {
  const hit = cache.get(key);
  const known = (hit?.value ?? null) as T | null;
  const now = Date.now();
  if (hit && now - hit.fetchedAt < EncyclopediaCachePolicy.TtlMs) return known;
  if (now < refusedUntil) return known;
  try {
    return remember(key, await lookup());
  } catch (err) {
    if (err instanceof UpstreamRefusal) refusedUntil = Date.now() + err.retryAfterMs;
    logger.warn(`📚 Encyclopedia: ${errorMessage(err)}`);
    return known;
  }
}

export function getAircraftTypeArticle(
  query: EncyclopediaTypeQuery,
): Promise<EncyclopediaArticle | null> {
  const candidates = typeQueries(query);
  if (candidates.length === 0) return Promise.resolve(null);
  const key = `${EncyclopediaRoute.AircraftType}?${candidates.join("|")}`.toLowerCase();
  return cached(key, () => lookupAircraftType(query));
}

export async function getVesselEncyclopedia(imo: number): Promise<EncyclopediaVesselAnswer> {
  const answer = await cached(`${EncyclopediaRoute.Vessel}?${imo}`, () => lookupVessel(imo));
  return answer ?? NO_VESSEL_ANSWER;
}

export function __resetEncyclopediaCacheForTests(): void {
  cache.clear();
  refusedUntil = 0;
}
