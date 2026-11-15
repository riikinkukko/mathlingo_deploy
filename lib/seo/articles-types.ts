/**
 * Статьи для поиска (SEO): шпаргалки и советы ученикам (/ege/formuly/*,
 * /ege/sovety/*), статьи родителям (/roditelyam/*) и репетиторам
 * (/repetitoram/*). Простой текст, без разметки; формулы — обычными символами
 * (sin²α, √x, π), чтобы их видел и поисковик, и читатель без загрузки шрифтов.
 */

export type ArticleSection = "formuly" | "sovety" | "roditelyam" | "repetitoram";

export type Block =
  | { t: "h2"; text: string }
  | { t: "p"; text: string }
  | { t: "list"; items: string[]; ordered?: boolean }
  /** Формулы: название — формула. */
  | { t: "formulas"; items: [string, string][] }
  | { t: "table"; head: string[]; rows: string[][] }
  /** Выделенная плашка: важное замечание или совет. */
  | { t: "note"; text: string };

export interface Article {
  section: ArticleSection;
  slug: string;
  /** Короткое название для списков и хлебных крошек */
  title: string;
  h1: string;
  /** Описание для поисковика (до ~160 символов) */
  description: string;
  lead: string;
  blocks: Block[];
  faq?: { q: string; a: string }[];
  /** Номера заданий ЕГЭ — ссылки на /ege/zadanie-N */
  egeNumbers?: number[];
  /** Слаги статей «читайте также» */
  related?: string[];
}

export const SECTION_INFO: Record<ArticleSection, { base: string; label: string; cta: "student" | "parent" | "tutor" }> = {
  formuly: { base: "/ege/formuly", label: "Формулы для ЕГЭ", cta: "student" },
  sovety: { base: "/ege/sovety", label: "Как готовиться к ЕГЭ", cta: "student" },
  roditelyam: { base: "/roditelyam", label: "Родителям", cta: "parent" },
  repetitoram: { base: "/repetitoram", label: "Репетиторам", cta: "tutor" },
};
