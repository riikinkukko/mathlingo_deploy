"use client";

import { useTransition } from "react";
import { requestAccountDeletionAction, cancelAccountDeletionAction } from "@/app/actions";

/**
 * Требование Google Play User Data Policy для приложений с созданием
 * аккаунта — путь удаления должен быть доступен в самом приложении, не
 * только на публичной веб-странице (см. app/legal/delete-account).
 * Сознательно НЕ мгновенное удаление — ставит запрос на ручную обработку
 * (см. комментарий в app/actions.ts), с гарантированным сроком, который
 * указан в тексте ниже — тот же срок, что и на публичной странице.
 */
export default function DeleteAccountSection({ requestedAt }: { requestedAt?: string }) {
  const [isPending, startTransition] = useTransition();

  if (requestedAt) {
    const date = new Date(requestedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long" });
    return (
      <div className="mt-6 card border-2 border-coral-light p-5">
        <h2 className="mb-1 font-display text-base font-black text-ink">Удаление аккаунта</h2>
        <p className="mb-3 text-sm text-ink-soft">
          Запрос на удаление отправлен {date}. Аккаунт и связанные с ним данные
          будут удалены в течение 30 дней. Если передумали — можно отменить
          запрос в любой момент до фактического удаления.
        </p>
        <button
          type="button"
          disabled={isPending}
          onClick={() => startTransition(() => cancelAccountDeletionAction())}
          className="btn-secondary !text-xs disabled:opacity-50"
        >
          Отменить запрос
        </button>
      </div>
    );
  }

  return (
    <div className="mt-6 card p-5">
      <h2 className="mb-1 font-display text-base font-black text-ink">Удаление аккаунта</h2>
      <p className="mb-3 text-sm text-ink-soft">
        Удаление аккаунта необратимо удалит ваш профиль, историю решённых
        задач и все связанные данные. Обработка запроса занимает до 30 дней.
      </p>
      <button
        type="button"
        disabled={isPending}
        onClick={() => {
          if (window.confirm("Точно хотите запросить удаление аккаунта? Это необратимо.")) {
            startTransition(() => requestAccountDeletionAction());
          }
        }}
        className="btn-secondary !text-xs !text-coral disabled:opacity-50"
      >
        Запросить удаление аккаунта
      </button>
    </div>
  );
}
