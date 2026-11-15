import { FORMULY } from "./articles-formuly";
import { RODITELYAM, REPETITORAM, SOVETY } from "./articles-audiences";
import { SECTION_INFO, type Article, type ArticleSection } from "./articles-types";

export * from "./articles-types";

export const ARTICLES: Article[] = [...FORMULY, ...SOVETY, ...RODITELYAM, ...REPETITORAM];

export const articleUrl = (a: Pick<Article, "section" | "slug">) => `${SECTION_INFO[a.section].base}/${a.slug}`;
export const articlesIn = (section: ArticleSection) => ARTICLES.filter((a) => a.section === section);
export const findArticle = (section: ArticleSection, slug: string) => ARTICLES.find((a) => a.section === section && a.slug === slug);
/** «Читайте также»: сначала указанные вручную, иначе — соседи по разделу. */
export function relatedArticles(a: Article, n = 3): Article[] {
  const byRel = (a.related ?? []).map((s) => ARTICLES.find((x) => x.slug === s)).filter((x): x is Article => !!x);
  const rest = ARTICLES.filter((x) => x.section === a.section && x.slug !== a.slug && !byRel.includes(x));
  return [...byRel, ...rest].slice(0, n);
}
