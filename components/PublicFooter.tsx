/**
 * Футер для публичных (неавторизованных) страниц — реквизиты компании и
 * ссылки на все юридические документы, требуемые 152-ФЗ. НЕ подключён к
 * авторизованным разделам (/student, /teacher, /parent, /admin) — там
 * место в первую очередь для функциональности, а не для юридического
 * текста; документы всё равно остаются доступны напрямую по /legal/*.
 */
export default function PublicFooter() {
  return (
    <footer className="mt-10 border-t border-line bg-white/60 px-4 py-6 text-center">
      <div className="mx-auto max-w-3xl">
        <nav className="flex flex-wrap items-center justify-center gap-x-4 gap-y-1.5 text-xs font-semibold text-ink-soft">
          <a href="/legal/terms" className="hover:text-pine hover:underline">
            Пользовательское соглашение
          </a>
          <a href="/legal/privacy" className="hover:text-pine hover:underline">
            Политика конфиденциальности
          </a>
          <a href="/legal/consent" className="hover:text-pine hover:underline">
            Согласие на обработку ПДн
          </a>
          <a href="/legal/offer" className="hover:text-pine hover:underline">
            Публичная оферта
          </a>
          <a href="/legal/cookies" className="hover:text-pine hover:underline">
            Cookie
          </a>
          <a href="/legal/delete-account" className="hover:text-pine hover:underline">
            Удаление аккаунта
          </a>
        </nav>
        <p className="mt-3 text-[11px] leading-relaxed text-ink-soft/80">
          [ПОЛНОЕ НАИМЕНОВАНИЕ ЮРИДИЧЕСКОГО ЛИЦА / ИП] · ОГРН/ОГРНИП: [УКАЗАТЬ] ·
          ИНН: [УКАЗАТЬ]
          <br />
          [ЮРИДИЧЕСКИЙ АДРЕС] · [EMAIL ДЛЯ СВЯЗИ]
        </p>
      </div>
    </footer>
  );
}
