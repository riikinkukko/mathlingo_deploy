import type { Metadata } from "next";
import SeoShell from "@/components/seo/SeoShell";
import { articlesIn, articleUrl, type ArticleSection } from "@/lib/seo/articles";

const TITLE = "Статьи о подготовке к ЕГЭ по математике — для учеников, родителей и репетиторов";
const DESCRIPTION =
  "Формулы для ЕГЭ по профильной математике, план подготовки, советы родителям и практика для репетиторов: учёт оплат, отчёты после урока, проверка домашки.";

export const metadata: Metadata = {
  title: `${TITLE} — Планиметрика`,
  description: DESCRIPTION,
  alternates: { canonical: "/stati" },
  openGraph: { type: "website", locale: "ru_RU", siteName: "Планиметрика", url: "/stati", title: TITLE, description: DESCRIPTION },
};

const GROUPS: { section: ArticleSection; title: string; text: string }[] = [
  { section: "formuly", title: "Формулы для ЕГЭ", text: "Шпаргалки по темам профильной математики." },
  { section: "sovety", title: "Как готовиться", text: "Стратегия на высокий балл и план на год." },
  { section: "roditelyam", title: "Родителям", text: "Как организовать подготовку и видеть, что она идёт." },
  { section: "repetitoram", title: "Репетиторам", text: "Оплаты, отчёты, домашние задания — практика без лишней рутины." },
];

export default function StatiPage() {
  return (
    <SeoShell crumbs={[{ href: "/ege", label: "ЕГЭ по математике" }, { label: "Статьи" }]}>
      <h1 className="font-display text-[28px] font-black leading-tight text-ink sm:text-[36px]">Статьи и шпаргалки</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">{DESCRIPTION}</p>
      {GROUPS.map((g) => (
        <section key={g.section} className="mt-8">
          <h2 className="font-display text-[21px] font-black text-ink">{g.title}</h2>
          <p className="mb-3 text-[14px] text-ink-soft">{g.text}</p>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {articlesIn(g.section).map((a) => (
              <a key={a.slug} href={articleUrl(a)} className="min-w-0 rounded-2xl border border-line-soft bg-white p-4 hover:border-pine">
                <span className="block font-extrabold text-ink">{a.h1}</span>
                <span className="mt-1 block text-[13px] leading-snug text-ink-soft">{a.description}</span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </SeoShell>
  );
}
