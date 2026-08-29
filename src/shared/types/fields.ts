/**
 * Optional payload fields are absent far more often than present, so a codec
 * checks the shape of what is there rather than requiring every key.
 */
export function hasOptionalFields(
  value: Readonly<Record<string, unknown>>,
  keys: readonly string[],
  matches: (candidate: unknown) => boolean,
): boolean {
  return keys.every((key) => {
    const candidate = value[key];
    return candidate === undefined || matches(candidate);
  });
}
