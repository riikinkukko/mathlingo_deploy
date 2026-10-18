"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { startMockAction, type StartMockState } from "@/app/actions-mock";
import { MOCK_MODES, type MockMode } from "@/lib/mock-exam";
import { IconLock } from "../icons";
import { pluralRu } from "@/lib/pluralize";

export interface VariantCard {
  variant: number;
  locked: boolean;
  /** лучший тестовый балл за полный вариант */
  best: number | null;
  /** сколько раз решал */
  tries: number;
}

const MODE_ORDER: MockMode[] = ["full", "part1", "free"];

export default function VariantPicker({ variants, upgradeHref }: { variants: VariantCard[]; upgradeHref: string }) {
  const [open, setOpen] = useState<number | null>(null);
  const [mode, setMode] = useState<MockMode>("full");
  const [state, action, pending] = useActionState<StartMockState, FormData>(startMockAction, null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open !== null && !d.open) d.showModal();
    if (open === null && d.open) d.close();
  }, [open]);

  return (
    <>
      <ul className="grid grid-cols-4 gap-2 sm:grid-cols-5">
        {variants.map((v) => (
          <li key={v.variant}>
            {v.locked ? (
              <a
                href={upgradeHref}
                aria-label={`Вариант ${v.variant} — в Pro`}
                className="flex h-full flex-col items-center rounded-2xl border border-dashed border-line bg-white/60 px-1 py-2.5 text-ink-soft transition hover:border-amber"
              >
                <span className="font-display text-2xl font-black leading-none">{v.variant}</span>
                <span className="mt-1.5 flex items-center gap-1 text-[11px] font-bold">
                  <IconLock className="h-3 w-3" /> Pro
                </span>
              </a>
            ) : (
              <button
                type="button"
                onClick={() => {
                  setMode("full");
                  setOpen(v.variant);
                }}
                aria-label={`Вариант ${v.variant}${v.best != null ? `, лучший результат ${v.best}` : ""}`}
                className={`flex h-full w-full flex-col items-center rounded-2xl border px-1 py-2.5 transition hover:border-pine focus-visible:border-pine ${
                  v.best != null ? "border-pine-light bg-pine-light/50" : "border-line-soft bg-white"
                }`}
              >
                <span className="font-display text-2xl font-black leading-none text-ink">{v.variant}</span>
                <span className={`mt-1.5 text-[11px] font-bold ${v.best != null ? "text-pine-dark" : "text-ink-soft"}`}>
                  {v.best != null ? `${v.best} ${pluralRu(v.best, ["балл", "балла", "баллов"])}` : v.tries > 0 ? "начат" : "вариант"}
                </span>
              </button>
            )}
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(null)}
        className="w-[min(32rem,calc(100vw-2rem))] rounded-3xl bg-white p-0 text-ink shadow-2xl backdrop:bg-ink/40"
      >
        {open !== null && (
          <form action={action} className="p-5 sm:p-6">
            <input type="hidden" name="variant" value={open} />
            <input type="hidden" name="mode" value={mode} />
            <h2 className="font-display text-xl font-black">Вариант {open}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              Ответы не проверяются до сдачи — как на экзамене. Всё сохраняется само: можно закрыть вкладку и
              продолжить позже, даже с другого устройства.
            </p>
            <fieldset className="mt-4 space-y-2">
              <legend className="sr-only">Режим</legend>
              {MODE_ORDER.map((m) => {
                const info = MOCK_MODES[m];
                const checked = mode === m;
                return (
                  <label
                    key={m}
                    className={`flex cursor-pointer gap-3 rounded-2xl border-2 p-3.5 transition ${
                      checked ? "border-pine bg-pine-light/50" : "border-line-soft hover:border-line"
                    }`}
                  >
                    <input
                      type="radio"
                      name="mode-pick"
                      value={m}
                      checked={checked}
                      onChange={() => setMode(m)}
                      className="mt-1 h-4 w-4 accent-[#12804F]"
                    />
                    <span>
                      <span className="block font-black">{info.title}</span>
                      <span className="block text-[13px] text-ink-soft">{info.hint}</span>
                    </span>
                  </label>
                );
              })}
            </fieldset>
            {state?.error && <p className="mt-3 text-sm font-bold text-coral">{state.error}</p>}
            <div className="mt-5 flex gap-2">
              <button type="button" onClick={() => setOpen(null)} className="btn-secondary flex-1">
                Отмена
              </button>
              <button type="submit" disabled={pending} className="btn-primary flex-1 disabled:opacity-60">
                {pending ? "Готовим вариант…" : "Начать"}
              </button>
            </div>
          </form>
        )}
      </dialog>
    </>
  );
}
