import Mascot from "@/components/Mascot";
import PublicFooter from "@/components/PublicFooter";

/** Каркас публичных SEO-страниц /ege/*: шапка как на лендинге, хлебные крошки, подвал. */
export default function SeoShell({
  crumbs,
  children,
}: {
  crumbs: { href?: string; label: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col bg-paper pt-[var(--app-sat)]">
      <header className="border-b border-line bg-white">
        <div className="mx-auto flex max-w-4xl items-center gap-3 px-4 py-3">
          <a href="/" className="flex items-center gap-2" aria-label="Планиметрика — на главную">
            <Mascot mood="idle" size={36} float={false} />
            <span className="text-[18px] font-black text-ink">Планиметрика</span>
          </a>
          <nav className="ml-auto flex items-center gap-1">
            <a href="/ege" className="hidden h-10 items-center rounded-xl px-3 text-[15px] font-bold text-ink-soft hover:text-ink sm:inline-flex">
              Задания ЕГЭ
            </a>
            <a
              href="/login"
              className="inline-flex h-10 items-center rounded-xl border-2 border-line bg-white px-4 text-[15px] font-black text-ink hover:border-pine"
            >
              Войти
            </a>
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-4xl flex-1 px-4 py-6">
        <nav aria-label="Навигация" className="mb-4 text-[13px] font-bold text-ink-soft">
          <ol className="flex flex-wrap items-center gap-1.5">
            {crumbs.map((c, i) => (
              <li key={c.label} className="flex items-center gap-1.5">
                {i > 0 && <span aria-hidden>›</span>}
                {c.href ? (
                  <a href={c.href} className="hover:text-pine">
                    {c.label}
                  </a>
                ) : (
                  <span className="text-ink">{c.label}</span>
                )}
              </li>
            ))}
          </ol>
        </nav>
        {children}
      </main>
      <PublicFooter />
    </div>
  );
}

/** Призыв начать — одинаковый на всех SEO-страницах. */
export function SeoCta({ title, text, goal }: { title: string; text: string; goal: string }) {
  return (
    <section className="my-8 rounded-[24px] bg-pine-dark p-6 text-white">
      <h2 className="font-display text-[22px] font-black leading-tight">{title}</h2>
      <p className="mt-2 text-[15px] text-white/85">{text}</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <a
          href={`/register?ym=${goal}`}
          className="inline-flex h-12 items-center rounded-2xl bg-white px-5 text-[15px] font-black text-pine-darker hover:bg-pine-light"
        >
          Начать бесплатно
        </a>
        <a
          href="/register/teacher"
          className="inline-flex h-12 items-center rounded-2xl border-2 border-white/40 px-5 text-[15px] font-black text-white hover:border-white"
        >
          Я репетитор
        </a>
      </div>
    </section>
  );
}
