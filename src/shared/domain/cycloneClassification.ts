export enum SaffirSimpson {
  None = 0,
  Cat1 = 1,
  Cat2 = 2,
  Cat3 = 3,
  Cat4 = 4,
  Cat5 = 5,
}

export type HurricaneScale = Exclude<
  SaffirSimpson,
  SaffirSimpson.None
>;

export type MinCategory =
  | SaffirSimpson.None
  | SaffirSimpson.Cat1
  | SaffirSimpson.Cat3
  | SaffirSimpson.Cat5;

export const MIN_CATEGORY_CHOICES: readonly MinCategory[] = [
  SaffirSimpson.None,
  SaffirSimpson.Cat1,
  SaffirSimpson.Cat3,
  SaffirSimpson.Cat5,
];
