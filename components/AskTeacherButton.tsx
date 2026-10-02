"use client";

import { useState, useTransition } from "react";
import { askTeacherAction } from "@/app/actions-questions";
import Mascot from "./Mascot";

/**
 * «Не понял — спросить репетитора»: вопрос уходит репетитору вместе с
 * условием задачи и текущим ответом ученика (в приложение и в Telegram).
 * Показывается только ученикам с репетитором.
 */
export default function AskTeacherButton({ problemId, currentAnswer }: { problemId: string; currentAnswer: string }) {
  const [open, setOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const res = await askTeacherAction(problemId, message, currentAnswer);
      if ("error" in res) {
        setError(res.error);
        return;
      }
      setSent(true);
      setOpen(false);
      setMessage("");
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-2xl text-[14px] font-extrabold text-ink-soft transition hover:text-pine-dark"
      >
        {sent ? "✓ Вопрос у репетитора — ответ придёт в уведомления" : "Не понял — спросить репетитора"}
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-ink/40 sm:items-center"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Вопрос репетитору"
            className="w-full max-w-md rounded-t-3xl bg-white p-5 pb-[max(20px,var(--app-sab))] sm:rounded-3xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center gap-3">
              <Mascot mood="thinking" size={52} float={false} />
              <div>
                <p className="font-display text-[17px] font-black text-ink">Спросить репетитора</p>
                <p className="text-[12px] text-ink-soft">
                  Он увидит условие задачи{currentAnswer.trim() ? " и твой ответ" : ""}
                </p>
              </div>
            </div>
            <label htmlFor="ask-msg" className="mb-1 block text-[13px] font-bold text-ink-soft">
              Что именно непонятно? (можно оставить пустым)
            </label>
            <textarea
              id="ask-msg"
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              maxLength={1000}
              rows={4}
              className="input resize-none text-[15px]"
              placeholder="Например: не понимаю, откуда взялся угол 130°"
            />
            {error && <p className="mt-2 text-sm font-semibold text-coral">{error}</p>}
            <div className="mt-4 grid grid-cols-2 gap-2">
              <button type="button" onClick={() => setOpen(false)} disabled={pending} className="btn-secondary !normal-case !tracking-normal">
                Отмена
              </button>
              <button type="button" onClick={send} disabled={pending} className="btn-primary !normal-case !tracking-normal">
                {pending ? "Отправляем…" : "Отправить"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
