"use client";

import { useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createPromoAction } from "@/app/actions-promo";

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button type="submit" disabled={pending} className="h-11 rounded-xl bg-pine px-5 text-[14px] font-black text-white hover:bg-pine-dark disabled:opacity-60">
      {pending ? "Создаём…" : "Создать промокод"}
    </button>
  );
}

export default function CreatePromoForm({ appUrl }: { appUrl: string }) {
  const [state, action] = useFormState(createPromoAction, {});
  const [kind, setKind] = useState<"percent" | "days">("percent");
  const [audience, setAudience] = useState<"teacher" | "student">("teacher");
  const link = (code: string) => `${appUrl}${audience === "teacher" ? "/register/teacher" : "/register"}?promo=${code}`;

  return (
    <form key={state?.ok ?? "new"} action={action} className="card space-y-4 p-5">
      <h2 className="font-display text-lg font-black text-ink">Новый промокод</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        <div>
          <label className="label" htmlFor="code">Код</label>
          <input className="input uppercase" id="code" name="code" required placeholder="START30" autoComplete="off" />
        </div>
        <div>
          <label className="label" htmlFor="audience">Для кого</label>
          <select className="input" id="audience" name="audience" value={audience} onChange={(e) => setAudience(e.target.value as "teacher" | "student")}>
            <option value="teacher">Репетиторы</option>
            <option value="student">Ученики без репетитора</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="kind">Что даёт</label>
          <select className="input" id="kind" name="kind" value={kind} onChange={(e) => setKind(e.target.value as "percent" | "days")}>
            <option value="percent">Скидку на первую оплату</option>
            <option value="days">Дни бесплатно сразу</option>
          </select>
        </div>
        <div>
          <label className="label" htmlFor="value">{kind === "percent" ? "Скидка, %" : "Дней"}</label>
          <input className="input" id="value" name="value" type="number" min={1} max={kind === "percent" ? 90 : 365} required placeholder={kind === "percent" ? "30" : "30"} />
        </div>
        <div>
          <label className="label" htmlFor="maxUses">Лимит использований</label>
          <input className="input" id="maxUses" name="maxUses" type="number" min={1} placeholder="без лимита" />
        </div>
        <div>
          <label className="label" htmlFor="expiresAt">Действует до (включительно)</label>
          <input className="input" id="expiresAt" name="expiresAt" type="date" />
        </div>
      </div>
      <div>
        <label className="label" htmlFor="note">Заметка для себя</label>
        <input className="input" id="note" name="note" placeholder="Например: пост в канале 5 октября" />
      </div>
      <p className="text-[12px] text-ink-soft">
        {kind === "percent"
          ? "Скидка действует только на первую оплату тарифа; продления — по полной цене."
          : audience === "teacher"
            ? "Дни добавляются сразу: к оплаченному тарифу или к пробному «Профи»."
            : "Дни Pro добавляются сразу."}
      </p>
      {state?.error && <p className="rounded-lg bg-coral-light px-3 py-2 text-sm font-bold text-coral">{state.error}</p>}
      {state?.ok && (
        <p className="rounded-lg bg-pine-light px-3 py-2 text-sm text-pine-darker">
          Готово: <b>{state.ok}</b>. Ссылка с кодом: <span className="break-all font-mono text-[12px]">{link(state.ok)}</span>
        </p>
      )}
      <Submit />
    </form>
  );
}
