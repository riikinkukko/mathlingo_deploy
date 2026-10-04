"use client";

import { useState } from "react";
import { ymGoal } from "@/lib/ym";

/** «Пригласите коллегу»: личная ссылка, «Поделиться» и счётчик пришедших. */
export default function ReferralCard({
  url,
  bonusDays,
  joined,
  rewarded,
}: {
  url: string;
  bonusDays: number;
  joined: number;
  rewarded: number;
}) {
  const [copied, setCopied] = useState(false);

  async function share() {
    ymGoal("referral_share");
    const text = `Веду учеников в Планиметрике: расписание, домашки и проверка заданий ЕГЭ в одном месте. По моей ссылке — +${bonusDays} дней к тарифу после первой оплаты.`;
    try {
      if (navigator.share) {
        await navigator.share({ title: "Планиметрика", text, url });
        return;
      }
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* меню закрыли */
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* нет доступа к буферу */
    }
  }

  return (
    <section id="invite" className="card mt-6 scroll-mt-24 p-5">
      <h2 className="font-display text-lg font-black text-ink">Пригласите коллегу — +{bonusDays} дней вам обоим</h2>
      <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">
        Отправьте ссылку другому репетитору. Когда он впервые оплатит тариф, вам и ему добавится по {bonusDays} дней. Если вы
        сейчас не платите — дни добавятся к пробному «Профи».
      </p>
      <div className="mt-3 flex items-center gap-2 rounded-xl border border-line bg-paper px-3 py-2">
        <span className="min-w-0 flex-1 truncate font-mono text-[13px] text-ink">{url}</span>
        <button type="button" onClick={copy} className="shrink-0 text-[13px] font-black text-pine-dark hover:underline">
          {copied ? "Скопировано" : "Копировать"}
        </button>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={share}
          className="h-11 rounded-xl bg-pine px-5 text-[14px] font-black text-white shadow-[0_3px_0_#0E5E3A] hover:bg-pine-dark"
        >
          Отправить ссылку
        </button>
        {joined > 0 && (
          <p className="text-[13px] font-bold text-ink-soft">
            Пришли по ссылке: {joined}
            {rewarded > 0 ? `, оплатили: ${rewarded}` : ""}
          </p>
        )}
      </div>
    </section>
  );
}
