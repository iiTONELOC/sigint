
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
