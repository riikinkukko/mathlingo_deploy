"use client";

import { useEffect, useState, useTransition } from "react";
import { askTeacherAction } from "@/app/actions-questions";
import Mascot from "./Mascot";

/**
 * «Не понял — спросить репетитора»: вопрос уходит репетитору вместе с
 * условием задачи и текущим ответом ученика (в приложение и в Telegram).
 * Показывается только ученикам с репетитором.
 */
export default function AskTeacherButton({
  problemId,
  currentAnswer,
  hasSketch = false,
  getSketch,
}: {
  problemId: string;
  currentAnswer: string;
  /** На листе черновика есть пометки — предложим приложить снимок. */
  hasSketch?: boolean;
  getSketch?: () => Promise<string | null>;
}) {
  const [open, setOpen] = useState(false);
  const [sketch, setSketch] = useState<string | null>(null);
  const [attach, setAttach] = useState(true);

  // Снимок черновика готовим при открытии окна — ученик видит, что уйдёт.
  useEffect(() => {
    if (!open || !hasSketch || !getSketch) return;
    let alive = true;
    getSketch().then((s) => alive && setSketch(s));
    return () => {
      alive = false;
    };
  }, [open, hasSketch]); // eslint-disable-line react-hooks/exhaustive-deps
  const [message, setMessage] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  function send() {
    setError(null);
    start(async () => {
      const res = await askTeacherAction(problemId, message, currentAnswer, attach ? sketch : null);
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
                  Он увидит условие задачи{currentAnswer.trim() ? ", твой ответ" : ""}
                  {sketch && attach ? " и черновик" : ""}
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
            {sketch && (
              <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-2xl border border-line-soft p-2.5">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={sketch} alt="Твой черновик" className="h-14 w-20 shrink-0 rounded-[10px] border border-line-soft object-cover object-top" />
                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] font-extrabold text-ink">Прикрепить черновик</span>
                  <span className="block text-[12px] text-ink-soft">Репетитор увидит, где ты застрял</span>
                </span>
                <input
                  type="checkbox"
                  checked={attach}
                  onChange={(e) => setAttach(e.target.checked)}
                  className="h-6 w-6 shrink-0 accent-pine"
                />
              </label>
            )}
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
