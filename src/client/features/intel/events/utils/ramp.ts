export type UpperBoundBand<TValue> = Readonly<{
  max: number;
  value: TValue;
}>;

export function upperBoundValue<TValue>(
  value: number,
  bands: readonly UpperBoundBand<TValue>[],
  fallback: TValue,
): TValue {
  for (const band of bands) {
    if (value <= band.max) return band.value;
  }
  return fallback;
}
