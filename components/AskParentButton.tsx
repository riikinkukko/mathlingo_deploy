"use client";

import { useState } from "react";
import { createPayRequestAction } from "@/app/actions-payments";
import { ymGoal } from "@/lib/ym";

/**
 * «Попросить родителя»: создаёт ссылку на оплату для взрослого и открывает
 * системное меню «Поделиться» (на компьютере — копирует ссылку).
 */
export default function AskParentButton({ className = "", tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  const [state, setState] = useState<"idle" | "busy" | "copied" | "error">("idle");
  const [url, setUrl] = useState<string | null>(null);

  async function ask() {
    setState("busy");
    ymGoal("ask_parent");
    const res = await createPayRequestAction();
    if (!res.url) {
      setState("error");
      return;
    }
    setUrl(res.url);
    const text = "Оплатишь мне подготовку к ЕГЭ по математике в Планиметрике? По ссылке всё написано, вход не нужен:";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Планиметрика", text, url: res.url });
        setState("idle");
        return;
      }
      await navigator.clipboard.writeText(`${text} ${res.url}`);
      setState("copied");
    } catch {
      setState("idle");
    }
  }

  const dark = tone === "dark";
  return (
    <div className={className}>
      <button
        type="button"
        onClick={ask}
        disabled={state === "busy"}
        className={`h-11 w-full rounded-2xl border-2 px-4 text-[14px] font-black transition disabled:opacity-60 ${
          dark ? "border-white/40 text-white hover:border-white" : "border-pine text-pine-dark hover:bg-pine-light"
        }`}
      >
        {state === "busy" ? "Готовим ссылку…" : state === "copied" ? "Ссылка скопирована — отправь родителю" : "Попросить родителя оплатить"}
      </button>
      {state === "error" && <p className="mt-2 text-[12px] font-bold text-coral">Не получилось создать ссылку. Попробуй ещё раз.</p>}
      {url && state !== "error" && (
        <p className={`mt-2 break-all text-[12px] ${dark ? "text-white/70" : "text-ink-soft"}`}>
          Ссылка для родителя: <span className="font-mono">{url}</span>
        </p>
      )}
    </div>
  );
}
