// One owner for the named-entity decode that the news feed and NHC bulletin
// parsers each repeated. Covers the handful of entities that appear in those
// plain-text payloads; not a full HTML entity table.

const ENTITIES: ReadonlyArray<readonly [string, string]> = [
  ["&amp;", "&"],
  ["&lt;", "<"],
  ["&gt;", ">"],
  ["&quot;", '"'],
  ["&#39;", "'"],
  ["&nbsp;", " "],
];

/** Decode the common named HTML entities in `text`. */
export function decodeHtmlEntities(text: string): string {
  return ENTITIES.reduce((acc, [entity, char]) => acc.replaceAll(entity, char), text);
}
