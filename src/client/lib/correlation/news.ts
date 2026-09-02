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
    linkArticle(links, activeCountries, article);
  }

  return links;
}

function linkArticle(
  links: Map<string, NewsArticle[]>,
  activeCountries: ReadonlySet<string>,
  article: NewsArticle,
): void {
  const text = `${article.title} ${article.description}`.toLowerCase();
  for (const country of activeCountries) {
    if (country.length < 3 || !text.includes(country)) continue;
    let articles = links.get(country);
    if (!articles) {
      articles = [];
      links.set(country, articles);
    }
    if (articles.length < 3) articles.push(article);
  }
}
