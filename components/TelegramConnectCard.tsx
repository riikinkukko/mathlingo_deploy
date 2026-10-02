import { isTelegramConfigured, buildTelegramLinkUrl, getTelegramBotUsername } from "@/lib/telegram";
import { generateTelegramLinkCode } from "@/lib/queries";
import { disconnectTelegramAction } from "@/app/actions-telegram";
import type { User } from "@/lib/types";

/**
 * Подключение Telegram — для кабинетов репетитора и родителя (у ученика своя
 * карточка в профиле). Ссылка на бота строится на сервере при рендере, как
 * в профиле ученика: код одноразовый и перезаписывается при каждом заходе,
 * пока Telegram не подключён.
 */
export default async function TelegramConnectCard({
  user,
  returnTo,
  pitch,
  connectedNote,
  disconnected,
  children,
}: {
  user: User;
  returnTo: string;
  /** Что будет приходить — текст до подключения. */
  pitch: string;
  /** Текст после подключения. */
  connectedNote: string;
  disconnected?: boolean;
  /** Дополнительный блок (например, переключатели) — только когда подключено. */
  children?: React.ReactNode;
}) {
  const linkUrl =
    !user.telegramChatId && isTelegramConfigured()
      ? buildTelegramLinkUrl(await generateTelegramLinkCode(user.id))
      : null;
  const bot = getTelegramBotUsername();

  return (
    <section id="telegram" className="card scroll-mt-20 p-5">
      <h2 className="mb-1 font-display text-base font-black text-ink">Уведомления в Telegram</h2>
      {disconnected && <p className="mb-2 text-xs font-bold text-coral">Telegram отключён.</p>}
      {user.telegramChatId ? (
        <>
          <p className="mb-3 text-sm text-ink-soft">✅ Подключено{bot ? ` к @${bot}` : ""}. {connectedNote}</p>
          {children}
          <form action={disconnectTelegramAction} className="mt-3">
            <input type="hidden" name="returnTo" value={returnTo} />
            <button type="submit" className="btn-secondary !text-xs !text-coral">
              Отключить Telegram
            </button>
          </form>
        </>
      ) : (
        <>
          <p className="mb-3 text-sm text-ink-soft">{pitch}</p>
          {linkUrl ? (
            <>
              <a href={linkUrl} className="btn-primary !text-xs" target="_blank" rel="noopener noreferrer">
                Подключить Telegram
              </a>
              <p className="mt-2 text-[11px] text-ink-soft">
                Откроется бот — нажмите «Старт». После этого обновите эту страницу.
              </p>
            </>
          ) : (
            <p className="text-xs text-ink-soft/70">Пока недоступно.</p>
          )}
        </>
      )}
    </section>
  );
}
