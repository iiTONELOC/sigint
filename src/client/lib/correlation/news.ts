// ── News linking ────────────────────────────────────────────────────
// Matches RSS article titles/descriptions against country names from
// active clusters and anomalies. Caps at 3 articles per country.

import type { NewsArticle } from "@/features/news";
import type { Cluster } from "./clusters";

export function linkNewsToEvents(
  clusters: Cluster[],
  anomalies: Array<{ country: string }>,
  news: NewsArticle[],
): Map<string, NewsArticle[]> {
  if (news.length === 0) return new Map();

  const links = new Map<string, NewsArticle[]>();

  const activeCountries = new Set<string>();
  for (const c of clusters) activeCountries.add(c.country.toLowerCase());
  for (const a of anomalies) activeCountries.add(a.country.toLowerCase());

  for (const article of news) {
    const text = `${article.title} ${article.description}`.toLowerCase();
    for (const country of activeCountries) {
      if (country.length < 3) continue;
      if (text.includes(country)) {
        let arr = links.get(country);
        if (!arr) {
          arr = [];
          links.set(country, arr);
        }
        if (arr.length < 3) arr.push(article);
      }
    }
  }

  return links;
}
