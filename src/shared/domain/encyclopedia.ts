export type EncyclopediaImage = Readonly<{
  src: string;
  width: number;
  height: number;
}>;

export type EncyclopediaArticle = Readonly<{
  title: string;
  extract: string;
  url: string;
  image: EncyclopediaImage | null;
}>;

export type EncyclopediaPhoto = EncyclopediaImage & Readonly<{
  credit: string;
  license: string;
  link: string;
}>;

export type EncyclopediaTypeAnswer = Readonly<{
  article: EncyclopediaArticle | null;
}>;

export type EncyclopediaVesselAnswer = Readonly<{
  article: EncyclopediaArticle | null;
  photo: EncyclopediaPhoto | null;
}>;

export enum EncyclopediaRoute {
  AircraftType = "/api/encyclopedia/aircraft-type",
  Vessel = "/api/encyclopedia/vessel",
}

export enum EncyclopediaTypeQueryKey {
  Description = "description",
  Manufacturer = "manufacturer",
  Model = "model",
}

export enum EncyclopediaVesselQueryKey {
  Imo = "imo",
  Mmsi = "mmsi",
  Name = "name",
}

export type EncyclopediaTypeQuery = Readonly<
  Partial<Record<EncyclopediaTypeQueryKey, string | undefined>>
>;

export type EncyclopediaVesselQuery = Readonly<{
  imo?: number;
  mmsi?: number;
  name?: string;
}>;

export const ENCYCLOPEDIA_TYPE_QUERY_KEYS: readonly EncyclopediaTypeQueryKey[] =
  Object.values(EncyclopediaTypeQueryKey);
