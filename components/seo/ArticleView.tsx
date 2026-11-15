import SeoShell, { SeoCta } from "@/components/seo/SeoShell";
import { EGE_TASKS } from "@/lib/seo/ege-content";
import { articleUrl, relatedArticles, SECTION_INFO, type Article, type Block } from "@/lib/seo/articles";

const BASE = "https://planimetrika.online";

function BlockView({ b }: { b: Block }) {
  switch (b.t) {
    case "h2":
      return <h2 className="mb-3 mt-8 font-display text-[21px] font-black text-ink">{b.text}</h2>;
    case "p":
      return <p className="my-3 text-[16px] leading-relaxed text-ink">{b.text}</p>;
    case "list": {
      const Tag = b.ordered ? "ol" : "ul";
      return (
        <Tag className={`my-3 space-y-2 pl-5 text-[16px] leading-relaxed text-ink ${b.ordered ? "list-decimal" : "list-disc"}`}>
          {b.items.map((x) => (
            <li key={x}>{x}</li>
          ))}
        </Tag>
      );
    }
    case "formulas":
      return (
        <dl className="my-3 divide-y divide-line-soft overflow-hidden rounded-2xl border border-line-soft bg-white">
          {b.items.map(([name, f]) => (
            <div key={name + f} className="grid gap-1 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] sm:gap-4">
              <dt className="text-[14px] font-bold text-ink-soft">{name}</dt>
              <dd className="break-words text-[17px] font-bold tracking-wide text-ink">{f}</dd>
            </div>
          ))}
        </dl>
      );
    case "table":
      return (
        <div className="my-3 overflow-x-auto rounded-2xl border border-line-soft bg-white">
          <table className="w-full min-w-[480px] text-left text-[14px]">
            <thead className="bg-pine-light/60">
              <tr>
                {b.head.map((h, i) => (
                  <th key={i} className="px-3 py-2 font-extrabold text-ink">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {b.rows.map((r, i) => (
                <tr key={i}>
                  {r.map((c, j) => (
                    <td key={j} className={`px-3 py-2 ${j === 0 ? "font-bold text-ink" : "text-ink"}`}>
                      {c}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    case "note":
      return <p className="my-4 rounded-2xl border-l-4 border-pine bg-pine-light/50 px-4 py-3 text-[15px] leading-relaxed text-ink">{b.text}</p>;
  }
}

function Cta({ a }: { a: Article }) {
  const kind = SECTION_INFO[a.section].cta;
  if (kind === "student")
    return (
      <SeoCta
        title="Закрепи на задачах — по 10 минут в день"
        text="Короткие уроки, задачи с мгновенной проверкой и разбором, «Мои ошибки» и пробники в формате ЕГЭ. Начать можно бесплатно."
        goal={`seo_article_${a.slug}`}
      />
    );
  const tutor = kind === "tutor";
  return (
    <section className="my-8 rounded-[24px] bg-pine-dark p-6 text-white">
      <h2 className="font-display text-[22px] font-black leading-tight">
        {tutor ? "Расписание, оплаты, домашка и отчёты — в одном кабинете" : "Видеть подготовку ребёнка без лишних вопросов"}
      </h2>
      <p className="mt-2 text-[15px] text-white/85">
        {tutor
          ? "Планиметрика считает баланс оплат, напоминает ученикам о домашке и родителям об оплате, проверяет первую часть сама. До 3 учеников — бесплатно."
          : "Если репетитор ребёнка работает в Планиметрике, вы видите неделю занятий, домашние задания, пробники, отчёты после уроков и оплату — в приложении и по воскресеньям в Telegram."}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={tutor ? `/register/teacher?ym=seo_article_${a.slug}` : "/roditelyam"}
          className="inline-flex h-12 items-center rounded-2xl bg-white px-5 text-[15px] font-black text-pine-darker hover:bg-pine-light"
        >
          {tutor ? "Попробовать бесплатно" : "Как это выглядит"}
        </a>
        <a
          href={tutor ? "/repetitoram" : "/register?ym=seo_parent"}
          className="inline-flex h-12 items-center rounded-2xl border-2 border-white/40 px-5 text-[15px] font-black text-white hover:border-white"
        >
          {tutor ? "Подробнее" : "Ученику — начать бесплатно"}
        </a>
      </div>
    </section>
  );
}

export default function ArticleView({ a }: { a: Article }) {
  const info = SECTION_INFO[a.section];
  const url = `${BASE}${articleUrl(a)}`;
  const crumbs =
    a.section === "formuly" || a.section === "sovety"
      ? [{ href: "/ege", label: "ЕГЭ по математике" }, { href: "/stati", label: info.label }, { label: a.title }]
      : [{ href: info.base, label: info.label }, { href: "/stati", label: "Статьи" }, { label: a.title }];
  const tasks = EGE_TASKS.filter((t) => a.egeNumbers?.includes(t.n));
  const related = relatedArticles(a);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "Article",
      headline: a.h1,
      description: a.description,
      mainEntityOfPage: url,
      inLanguage: "ru",
      publisher: { "@type": "Organization", name: "Планиметрика", url: BASE },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: crumbs.map((c, i) => ({ "@type": "ListItem", position: i + 1, name: c.label, item: c.href ? `${BASE}${c.href}` : url })),
    },
    ...(a.faq?.length
      ? [
          {
            "@context": "https://schema.org",
            "@type": "FAQPage",
            mainEntity: a.faq.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
          },
        ]
      : []),
  ];

  return (
    <SeoShell crumbs={crumbs}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
      <article className="max-w-3xl">
        <h1 className="font-display text-[28px] font-black leading-tight text-ink sm:text-[36px]">{a.h1}</h1>
        <p className="mt-3 text-[17px] leading-relaxed text-ink-soft">{a.lead}</p>
        {tasks.length > 0 && (
          <p className="mt-4 flex flex-wrap gap-1.5">
            {tasks.map((t) => (
              <a key={t.n} href={`/ege/${t.slug}`} className="rounded-pill bg-pine-light px-3 py-1 text-[13px] font-extrabold text-pine-dark hover:bg-pine-mint">
                Задание №{t.n}
              </a>
            ))}
          </p>
        )}
        {a.blocks.map((b, i) => (
          <BlockView key={i} b={b} />
        ))}
        {a.faq && a.faq.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 font-display text-[21px] font-black text-ink">Частые вопросы</h2>
            <div className="space-y-2">
              {a.faq.map((f) => (
                <details key={f.q} className="rounded-2xl border border-line-soft bg-white p-4">
                  <summary className="cursor-pointer font-extrabold text-ink">{f.q}</summary>
                  <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{f.a}</p>
                </details>
              ))}
            </div>
          </section>
        )}
      </article>
      <Cta a={a} />
      {related.length > 0 && (
        <section>
          <h2 className="mb-3 font-display text-[19px] font-black text-ink">Читайте также</h2>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
            {related.map((r) => (
              <a key={r.slug} href={articleUrl(r)} className="min-w-0 rounded-2xl border border-line-soft bg-white p-4 hover:border-pine">
                <span className="block text-[12px] font-extrabold uppercase text-ink-soft">{SECTION_INFO[r.section].label}</span>
                <span className="mt-1 block font-extrabold text-ink">{r.title}</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </SeoShell>
  );
}

/** Метаданные статьи для generateMetadata. */
export function articleMetadata(a: Article) {
  const title = `${a.h1} — Планиметрика`;
  const url = articleUrl(a);
  return {
    title,
    description: a.description,
    alternates: { canonical: url },
    openGraph: { type: "article" as const, locale: "ru_RU", siteName: "Планиметрика", url, title, description: a.description },
  };
}
