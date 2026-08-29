export enum NewsSource {
  Reuters = "Reuters via Google",
  NewYorkTimes = "NYT World",
  Bbc = "BBC World",
  AlJazeera = "Al Jazeera",
  Guardian = "The Guardian",
  Npr = "NPR World",
}

export enum NewsPolling {
  IntervalMs = 600_000,
}

export const NEWS_LATEST_ROUTE = "/api/news/latest";
