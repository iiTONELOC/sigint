export type RenderContext2D =
  | CanvasRenderingContext2D
  | OffscreenCanvasRenderingContext2D;

export type Projected = {
  x: number;
  y: number;
  z: number;
};

export type Pt = {
  x: number;
  y: number;
};

export type ProjFn = (lat: number, lon: number) => Projected;

export type HorizonCircle = Readonly<{
  gcx: number;
  gcy: number;
  gr: number;
}>;

export type LandColors = Readonly<{
  coastFill: string;
  coast: string;
}>;
