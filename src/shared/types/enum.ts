export type StringEnum = Record<string, string>;

export function isEnumValue<TEnum extends StringEnum>(
  value: unknown,
  members: TEnum,
): value is TEnum[keyof TEnum] {
  return (
    typeof value === "string" && Object.values<string>(members).includes(value)
  );
}
