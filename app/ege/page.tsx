import type { Metadata } from "next";
import SeoShell, { SeoCta } from "@/components/seo/SeoShell";
import { EGE_TASKS, EGE_TOPICS } from "@/lib/seo/ege-content";
import { getAllTaskStats, PART1_LAST, pointsFor, type TaskStats } from "@/lib/seo/ege-data";
import { pluralRu } from "@/lib/pluralize";

export const revalidate = 86400;

const TITLE = "Все 20 заданий ЕГЭ по профильной математике 2027 — разбор по номерам";
const DESCRIPTION =
  "Что проверяет каждое задание профильного ЕГЭ по математике: темы, баллы, частые ошибки и пример задачи с разбором. Тренируйте любой номер бесплатно.";

export const metadata: Metadata = {
  title: `${TITLE} — Планиметрика`,
  description: DESCRIPTION,
  alternates: { canonical: "/ege" },
  openGraph: { type: "website", locale: "ru_RU", siteName: "Планиметрика", url: "/ege", title: TITLE, description: DESCRIPTION },
};

function Card({ n, title, slug, stats }: { n: number; title: string; slug: string; stats?: TaskStats }) {
  const pts = pointsFor(n);
  return (
    <a href={`/ege/${slug}`} className="flex min-w-0 items-center gap-3 rounded-2xl border border-line-soft bg-white p-3.5 transition hover:border-pine">
      <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-pine-light font-display text-[18px] font-black text-pine-dark">
        {n}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-extrabold text-ink">{title}</span>
        <span className="block text-[12px] font-bold text-ink-soft">
          {pts} {pluralRu(pts, ["балл", "балла", "баллов"])}
          {stats && stats.problems > 0 ? ` · ${stats.problems} ${pluralRu(stats.problems, ["задача", "задачи", "задач"])}` : ""}
        </span>
      </span>
      <span aria-hidden className="font-black text-ink-soft">
        ›
      </span>
    </a>
  );
}

export default async function EgeHubPage() {
  let stats = new Map<number, TaskStats>();
  try {
    stats = await getAllTaskStats();
  } catch {}
  const part1 = EGE_TASKS.filter((t) => t.n <= PART1_LAST);
  const part2 = EGE_TASKS.filter((t) => t.n > PART1_LAST);
  return (
    <SeoShell crumbs={[{ label: "Задания ЕГЭ" }]}>
      <h1 className="font-display text-[28px] font-black leading-tight text-ink sm:text-[36px]">{TITLE}</h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
        В варианте ЕГЭ-2027 — 20 заданий: №1–13 с кратким ответом (по 1 баллу), №14–20 с развёрнутым решением.
        Всего 33 первичных балла, на экзамен даётся 3 часа 55 минут. Выберите номер — расскажем, что он проверяет,
        где чаще ошибаются, и покажем пример задачи с разбором.
      </p>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-[21px] font-black text-ink">Часть 1 · краткий ответ</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {part1.map((t) => (
            <Card key={t.n} n={t.n} title={t.title} slug={t.slug} stats={stats.get(t.n)} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-[21px] font-black text-ink">Часть 2 · развёрнутое решение</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {part2.map((t) => (
            <Card key={t.n} n={t.n} title={t.title} slug={t.slug} stats={stats.get(t.n)} />
          ))}
        </div>
      </section>

      <section className="mt-8">
        <h2 className="mb-3 font-display text-[21px] font-black text-ink">Темы</h2>
        <div className="flex flex-wrap gap-2">
          {EGE_TOPICS.map((x) => (
            <a
              key={x.slug}
              href={`/ege/tema/${x.slug}`}
              className="rounded-pill border border-line-soft bg-white px-3.5 py-2 text-[14px] font-extrabold text-ink hover:border-pine"
            >
              {x.topicTitle}
            </a>
          ))}
        </div>
      </section>

      <SeoCta
        title="Готовься к ЕГЭ по 10 минут в день"
        text="Путь из коротких уроков, задачи с проверкой и подсказками, «Мои ошибки», повторение и 20 пробников в формате ЕГЭ."
        goal="seo_hub_cta"
      />
    </SeoShell>
  );
}
