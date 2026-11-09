import type { Metadata } from "next";
import { notFound } from "next/navigation";
import SeoShell, { SeoCta } from "@/components/seo/SeoShell";
import { EGE_TASKS, EGE_TOPICS } from "@/lib/seo/ege-content";
import { getTopicStats, type TopicStats } from "@/lib/seo/ege-data";
import { pluralRu } from "@/lib/pluralize";

export const revalidate = 86400;
export const dynamicParams = false;

export function generateStaticParams() {
  return EGE_TOPICS.map((t) => ({ slug: t.slug }));
}

const find = (slug: string) => EGE_TOPICS.find((t) => t.slug === slug);

export async function generateMetadata(props: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await props.params;
  const t = find(slug);
  if (!t) return {};
  const title = `${t.h1} — Планиметрика`;
  return {
    title,
    description: t.metaDescription,
    alternates: { canonical: `/ege/tema/${t.slug}` },
    openGraph: { type: "article", locale: "ru_RU", siteName: "Планиметрика", url: `/ege/tema/${t.slug}`, title, description: t.metaDescription },
  };
}

export default async function EgeTopicPage(props: { params: Promise<{ slug: string }> }) {
  const { slug } = await props.params;
  const t = find(slug);
  if (!t) notFound();
  let stats: TopicStats | null = null;
  try {
    stats = await getTopicStats(t.topicTitle);
  } catch {}
  const tasks = EGE_TASKS.filter((x) => t.egeNumbers.includes(x.n));

  return (
    <SeoShell crumbs={[{ href: "/ege", label: "Задания ЕГЭ" }, { label: t.topicTitle }]}>
      <h1 className="font-display text-[28px] font-black leading-tight text-ink sm:text-[36px]">{t.h1}</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">{t.intro}</p>
      {stats && stats.problems > 0 && (
        <p className="mt-3 inline-flex rounded-pill bg-pine-light px-3 py-1.5 text-[13px] font-extrabold text-pine-dark">
          {stats.problems} {pluralRu(stats.problems, ["задача", "задачи", "задач"])} с проверкой и разбором ·{" "}
          {stats.chapters.reduce((n, c) => n + c.skills.length, 0)} уроков
        </p>
      )}

      <section className="mt-8">
        <h2 className="mb-3 font-display text-[21px] font-black text-ink">Главное в теме</h2>
        <ul className="space-y-2">
          {t.keyIdeas.map((x) => (
            <li key={x} className="flex gap-2.5 text-[15px] leading-relaxed text-ink">
              <span aria-hidden>📌</span>
              <span>{x}</span>
            </li>
          ))}
        </ul>
      </section>

      {tasks.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-[21px] font-black text-ink">Где встречается на ЕГЭ</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {tasks.map((x) => (
              <a key={x.n} href={`/ege/${x.slug}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line-soft bg-white p-3.5 hover:border-pine">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-pine-light font-black text-pine-dark">{x.n}</span>
                <span className="font-extrabold text-ink">{x.title}</span>
              </a>
            ))}
          </div>
        </section>
      )}

      {stats && stats.chapters.length > 0 && (
        <section className="mt-8">
          <h2 className="mb-3 font-display text-[21px] font-black text-ink">Программа темы в Планиметрике</h2>
          <div className="space-y-3">
            {stats.chapters.map((c) => (
              <div key={c.title} className="rounded-2xl border border-line-soft bg-white p-4">
                <h3 className="font-extrabold text-ink">{c.title}</h3>
                <ul className="mt-2 flex flex-wrap gap-1.5">
                  {c.skills.map((s) => (
                    <li key={s} className="rounded-pill bg-grid px-2.5 py-1 text-[13px] font-bold text-ink-soft">
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>
      )}

      <SeoCta
        title={`Пройди тему «${t.topicTitle}» шаг за шагом`}
        text="Каждый урок — короткая теория и задачи с мгновенной проверкой. Ошибки сохраняются, чтобы к ним вернуться, а решённое возвращается на повторение."
        goal="seo_topic_cta"
      />
    </SeoShell>
  );
}
