export type PointUiQueryPolicy = Readonly<{
  searchResultLimit: number;
  datasetQueryLimit: number;
}>;

export const POINT_UI_QUERY_POLICY: PointUiQueryPolicy = {
  searchResultLimit: 15,
  datasetQueryLimit: 200,
};
