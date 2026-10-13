export function positiveInteger(text: string | null): number | undefined {
  const value = Number(text);
  return Number.isInteger(value) && value > 0 ? value : undefined;
}

export const BYTES_PER_MEBIBYTE = 1_048_576;

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
