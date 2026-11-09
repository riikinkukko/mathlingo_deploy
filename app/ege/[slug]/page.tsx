import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeoShell, { SeoCta } from "@/components/seo/SeoShell";
import DiagramRenderer from "@/components/diagrams/DiagramRenderer";
import { EGE_TASKS, EGE_TOPICS } from "@/lib/seo/ege-content";
import { getAllTaskStats, getSampleProblem, PART1_LAST, pointsFor, type SampleProblem, type TaskStats } from "@/lib/seo/ege-data";
import { pluralRu } from "@/lib/pluralize";

// Страницы собираются заранее и обновляются раз в сутки (число задач, пример).
export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return EGE_TASKS.map((t) => ({ slug: t.slug }));
}

const find = (slug: string) => EGE_TASKS.find((t) => t.slug === slug);

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const t = find(slug);
  if (!t) return {};
  const title = `${t.h1} — Планиметрика`;
  return {
    title,
    description: t.metaDescription,
    alternates: { canonical: `/ege/${t.slug}` },
    openGraph: { type: "article", locale: "ru_RU", siteName: "Планиметрика", url: `/ege/${t.slug}`, title, description: t.metaDescription },
  };
}

async function safe<T>(p: Promise<T>, fallback: T): Promise<T> {
  try {
    return await p;
  } catch {
    return fallback;
  }
}

function List({ items, mark }: { items: string[]; mark: string }) {
  return (
    <ul className="space-y-2">
      {items.map((x) => (
        <li key={x} className="flex gap-2.5 text-[15px] leading-relaxed text-ink">
          <span aria-hidden className="shrink-0">
            {mark}
          </span>
          <span>{x}</span>
        </li>
      ))}
    </ul>
  );
}

export default async function EgeTaskPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const t = find(slug);
  if (!t) notFound();
  const [all, sample] = await Promise.all([
    safe(getAllTaskStats(), new Map<number, TaskStats>()),
    safe(getSampleProblem(t.n), null as SampleProblem | null),
  ]);
  const stats = all.get(t.n);
  const points = pointsFor(t.n);
  const part = t.n <= PART1_LAST ? 1 : 2;
  const topics = EGE_TOPICS.filter((x) => x.egeNumbers.includes(t.n));
  const prev = EGE_TASKS.find((x) => x.n === t.n - 1);
  const next = EGE_TASKS.find((x) => x.n === t.n + 1);

  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      mainEntity: t.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: "Задания ЕГЭ", item: "https://planimetrika.online/ege" },
        { "@type": "ListItem", position: 2, name: `Задание №${t.n}`, item: `https://planimetrika.online/ege/${t.slug}` },
      ],
    },
  ];

  return (
    <SeoShell crumbs={[{ href: "/ege", label: "Задания ЕГЭ" }, { label: `№${t.n}` }]}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article>
        <p className="text-[13px] font-black uppercase tracking-wide text-pine">
          Часть {part} · {points} {pluralRu(points, ["первичный балл", "первичных балла", "первичных баллов"])}
          {part === 1 ? " · краткий ответ" : " · развёрнутое решение"}
        </p>
        <h1 className="mt-1 font-display text-[28px] font-black leading-tight text-ink sm:text-[36px]">{t.h1}</h1>
        <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">{t.intro}</p>
        {stats && stats.problems > 0 && (
          <p className="mt-3 inline-flex rounded-pill bg-pine-light px-3 py-1.5 text-[13px] font-extrabold text-pine-dark">
            В Планиметрике {stats.problems} {pluralRu(stats.problems, ["задача", "задачи", "задач"])} этого номера с проверкой и разбором
          </p>
        )}

        <section className="mt-8">
          <h2 className="mb-3 font-display text-[21px] font-black text-ink">Что нужно знать</h2>
          <List items={t.whatToKnow} mark="📌" />
        </section>

        {sample && (
          <section className="mt-8 rounded-[20px] border border-line-soft bg-white p-5">
            <p className="text-[12px] font-black uppercase tracking-wide text-ink-soft">Пример задачи · {sample.skillTitle}</p>
            {sample.diagram && (
              <div className="mx-auto mt-3 max-w-sm">
                <DiagramRenderer spec={sample.diagram} />
              </div>
            )}
            <p className="mt-3 whitespace-pre-wrap text-[16px] leading-relaxed text-ink">{sample.text}</p>
            <details className="group mt-4 rounded-2xl bg-pine-light/50 p-4">
              <summary className="cursor-pointer list-none font-extrabold text-pine-dark">
                Показать {sample.answerType === "DETAILED" ? "решение" : "ответ и разбор"}{" "}
                <span className="inline-block transition group-open:rotate-90">›</span>
              </summary>
              {sample.answerType !== "DETAILED" && (
                <p className="mt-3 text-[15px] font-black text-ink">Ответ: {sample.correctAnswer}</p>
              )}
              <p className="mt-2 whitespace-pre-wrap text-[15px] leading-relaxed text-ink-soft">
                {sample.answerType === "DETAILED" ? sample.correctAnswer : sample.explanation}
              </p>
            </details>
          </section>
        )}

        <div className="mt-8 grid gap-6 sm:grid-cols-2">
          <section>
            <h2 className="mb-3 font-display text-[21px] font-black text-ink">Частые ошибки</h2>
            <List items={t.typicalMistakes} mark="⚠️" />
          </section>
          <section>
            <h2 className="mb-3 font-display text-[21px] font-black text-ink">Как решать увереннее</h2>
            <List items={t.tips} mark="✅" />
          </section>
        </div>

        {stats && stats.skills.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 font-display text-[21px] font-black text-ink">Уроки по этому номеру в Планиметрике</h2>
            <ul className="flex flex-wrap gap-2">
              {stats.skills.slice(0, 12).map((s) => (
                <li key={s.id} className="rounded-pill border border-line-soft bg-white px-3 py-1.5 text-[13px] font-bold text-ink">
                  {s.title}
                </li>
              ))}
            </ul>
            {topics.length > 0 && (
              <p className="mt-3 text-[14px] text-ink-soft">
                Подробнее о теме:{" "}
                {topics.map((x, i) => (
                  <span key={x.slug}>
                    {i > 0 && ", "}
                    <a href={`/ege/tema/${x.slug}`} className="font-bold text-pine-dark underline-offset-2 hover:underline">
                      {x.topicTitle}
                    </a>
                  </span>
                ))}
              </p>
            )}
          </section>
        )}

        <SeoCta
          title={`Тренируй задание №${t.n} по 10 минут в день`}
          text="Короткие уроки с теорией, задачи с мгновенной проверкой и подсказками, повторение того, что забывается, и пробники в формате ЕГЭ. Начать можно бесплатно."
          goal="seo_task_cta"
        />

        <section className="mt-8">
          <h2 className="mb-3 font-display text-[21px] font-black text-ink">Вопросы и ответы</h2>
          <div className="space-y-3">
            {t.faq.map((f) => (
              <div key={f.q} className="rounded-2xl border border-line-soft bg-white p-4">
                <h3 className="font-extrabold text-ink">{f.q}</h3>
                <p className="mt-1 text-[15px] leading-relaxed text-ink-soft">{f.a}</p>
              </div>
            ))}
          </div>
        </section>

        <nav aria-label="Другие задания" className="mt-8 flex items-center justify-between gap-3 text-[14px] font-extrabold">
          {prev ? (
            <a href={`/ege/${prev.slug}`} className="rounded-2xl border border-line-soft bg-white px-4 py-3 text-ink hover:border-pine">
              ← №{prev.n}. {prev.title}
            </a>
          ) : (
            <span />
          )}
          {next ? (
            <a href={`/ege/${next.slug}`} className="rounded-2xl border border-line-soft bg-white px-4 py-3 text-right text-ink hover:border-pine">
              №{next.n}. {next.title} →
            </a>
          ) : (
            <span />
          )}
        </nav>
      </article>
    </SeoShell>
  );
}
