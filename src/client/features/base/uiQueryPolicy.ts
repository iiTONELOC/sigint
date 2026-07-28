export type PointUiQueryPolicy = Readonly<{
  searchResultLimit: number;
  datasetQueryLimit: number;
  /** Candidate ceiling for a bounding box query, before the precise test. */
  bboxCandidateLimit: number;
  /** Ceiling on the distinct values a filter control offers. */
  facetValueLimit: number;
}>;

export const POINT_UI_QUERY_POLICY: PointUiQueryPolicy = {
  searchResultLimit: 15,
  datasetQueryLimit: 200,
  bboxCandidateLimit: 2000,
  facetValueLimit: 300,
};
