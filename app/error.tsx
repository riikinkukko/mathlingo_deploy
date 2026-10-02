"use client";

import { useEffect } from "react";
import Mascot from "@/components/Mascot";

/**
 * Экран ошибки вместо белой страницы. Ошибку отправляем владельцу
 * (/api/client-error → Telegram), а пользователю предлагаем повторить.
 */
export default function ErrorPage({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    try {
      void fetch("/api/client-error", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: error.message, stack: error.stack, digest: error.digest, path: location.pathname + location.search }),
        keepalive: true,
      });
    } catch {
      // нет сети — ничего страшного
    }
  }, [error]);

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center px-6 text-center">
      <Mascot mood="thinking" size={96} float={false} />
      <h1 className="mt-4 font-display text-2xl font-black text-ink">Что-то пошло не так</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        Мы уже получили сообщение об ошибке. Попробуй ещё раз — обычно помогает. Твой прогресс сохранён.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        <button type="button" onClick={() => reset()} className="btn-primary">
          Попробовать снова
        </button>
        <a href="/" className="btn-secondary">
          На главную
        </a>
      </div>
      {error.digest && <p className="mt-6 text-[11px] text-ink-soft/70">Код ошибки: {error.digest}</p>}
    </div>
  );
}
