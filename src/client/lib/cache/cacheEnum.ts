import { cacheGet } from "@/lib/cache/storageService";
import { isEnumValue, type StringEnum } from "@shared/types/enum";

export async function cacheGetEnum<TEnum extends StringEnum>(
  key: string,
  members: TEnum,
): Promise<TEnum[keyof TEnum] | null> {
  const saved = await cacheGet<unknown>(key);
  return isEnumValue(saved, members) ? saved : null;
}
