export type StringEnum = Record<string, string>;

export function isEnumValue<TEnum extends StringEnum>(
  value: unknown,
  members: TEnum,
): value is TEnum[keyof TEnum] {
  return (
    typeof value === "string" && Object.values<string>(members).includes(value)
  );
}

export type NumberEnum = Record<string, string | number>;

// A numeric enum carries its reverse mapping in Object.values, so the value
// type is what separates a member from a member name.
export function isNumberEnumValue<TEnum extends NumberEnum>(
  value: unknown,
  members: TEnum,
): value is TEnum[keyof TEnum] {
  return typeof value === "number" && Object.values(members).includes(value);
}
