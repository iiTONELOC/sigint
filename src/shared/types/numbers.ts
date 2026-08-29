export function isOptionalFiniteNumber(
  value: unknown,
): value is number | undefined {
  return value === undefined ||
    (typeof value === "number" && Number.isFinite(value));
}

export function optionalFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

export function firstNumber(...candidates: readonly unknown[]): number {
  for (const candidate of candidates) {
    if (typeof candidate === "number" && Number.isFinite(candidate)) {
      return candidate;
    }
  }
  return 0;
}
