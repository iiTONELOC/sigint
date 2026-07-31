export type Band<TValue> = Readonly<{ floor: number; value: TValue }>;

export function bandValue<TValue>(
  input: number,
  bands: readonly Band<TValue>[],
  fallback: TValue,
): TValue {
  for (const band of bands) {
    if (input >= band.floor) return band.value;
  }
  return fallback;
}
