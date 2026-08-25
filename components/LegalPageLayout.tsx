import { ReactNode } from "react";

/**
 * Общая обёртка для всех юридических документов (/legal/*) — единый вид:
 * заголовок, дата последнего обновления, кнопка "назад", читаемая
 * типографика для длинного текста. Публичная страница (доступна без
 * авторизации — согласие нужно прочитать ДО регистрации).
 */
export default function LegalPageLayout({
  title,
  updatedAt,
  children,
}: {
  title: string;
  updatedAt: string;
  children: ReactNode;
}) {
  return (
    <div className="min-h-screen bg-paper px-4 pb-8 pt-[max(2rem,var(--safe-area-inset-top,env(safe-area-inset-top)))]">
      <div className="mx-auto max-w-2xl">
        <a
          href="/"
          className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-ink-soft transition hover:text-pine"
        >
          ← На главную
        </a>
        <div className="card p-6 sm:p-8">
          <h1 className="font-display text-2xl font-black text-ink">{title}</h1>
          <p className="mt-1 text-xs font-semibold text-ink-soft">
            Действует с {updatedAt}
          </p>
          <div className="prose-legal mt-6 space-y-4 text-sm leading-relaxed text-ink">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}
