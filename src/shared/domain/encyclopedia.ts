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

export enum EncyclopediaQuery {
  Description = "description",
  Imo = "imo",
  Manufacturer = "manufacturer",
  Model = "model",
}

export type EncyclopediaTypeKey = Exclude<EncyclopediaQuery, EncyclopediaQuery.Imo>;

export type EncyclopediaTypeQuery = Readonly<
  Partial<Record<EncyclopediaTypeKey, string | undefined>>
>;

export const ENCYCLOPEDIA_TYPE_QUERY_KEYS: readonly EncyclopediaTypeKey[] =
  Object.values(EncyclopediaQuery).filter(
    (key): key is EncyclopediaTypeKey => key !== EncyclopediaQuery.Imo,
  );
