"use client";

import { useActionState, useState } from "react";
import { importStudentsAction, type ImportState } from "@/app/actions-import";

const EXAMPLE = "Маша Соколова\t11\t2000\nДима Петров\tdima@mail.ru\t10\t1800\nАлина Кузнецова; 9 кл; 1500";

export default function ImportForm() {
  const [state, action, pending] = useActionState<ImportState, FormData>(importStudentsAction, null);
  const [text, setText] = useState("");
  const [copied, setCopied] = useState(false);

  if (state?.created) {
    const all = state.created.map((c) => `${c.name}\nЛогин: ${c.login}\nПароль: ${c.password}`).join("\n\n");
    return (
      <div className="space-y-4">
        <div className="card p-5" role="status">
          <h2 className="font-display text-xl font-black text-ink">Добавлено учеников: {state.created.length}</h2>
          <p className="mt-1 text-[13px] text-ink-soft">
            Логины и пароли показываются один раз — скопируйте их сейчас и перешлите ученикам или родителям.
          </p>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead>
                <tr className="text-[11px] font-black uppercase text-ink-soft">
                  <th className="py-1.5 pr-3">Ученик</th>
                  <th className="py-1.5 pr-3">Логин</th>
                  <th className="py-1.5">Пароль</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {state.created.map((c) => (
                  <tr key={c.login}>
                    <td className="py-1.5 pr-3 font-bold text-ink">{c.name}</td>
                    <td className="break-all py-1.5 pr-3 font-mono">{c.login}</td>
                    <td className="py-1.5 font-mono">{c.password}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                void navigator.clipboard?.writeText(`Вход в Планиметрику: planimetrika.online\n\n${all}`);
                setCopied(true);
              }}
            >
              {copied ? "✓ Скопировано" : "Скопировать все логины"}
            </button>
            <a href="/teacher" className="btn-secondary">
              К ученикам
            </a>
          </div>
        </div>
        {state.skipped && state.skipped.length > 0 && (
          <div className="card p-5">
            <h3 className="font-black text-ink">Не добавлены: {state.skipped.length}</h3>
            <ul className="mt-2 space-y-1 text-[13px] text-ink-soft">
              {state.skipped.map((s, i) => (
                <li key={i}>
                  <b className="text-ink">{s.name}</b> — {s.reason}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    );
  }

  const rows = state?.rows;
  const good = rows?.filter((r) => !r.error && !r.duplicate).length ?? 0;
  const dups = rows?.filter((r) => !r.error && r.duplicate).length ?? 0;
  const phones = rows?.some((r) => r.phone) ?? false;
  return (
    <form action={action} className="space-y-4">
      <textarea
        name="list"
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={8}
        className="input min-h-[180px] font-mono text-[13px]"
        placeholder={EXAMPLE}
      />
      {!rows && (
        <button type="submit" name="step" value="preview" className="btn-primary" disabled={pending || !text.trim()}>
          {pending ? "Проверяем…" : "Проверить список"}
        </button>
      )}
      {rows && (
        <div className="card p-4">
          <p className="mb-2 font-black text-ink">
            Добавим учеников: {good}
            {dups ? ` · уже есть: ${dups}` : ""}
            {rows.length - good - dups > 0 ? ` · с ошибками: ${rows.length - good - dups}` : ""}
          </p>
          {phones && (
            <p className="mb-2 text-[12px] font-bold text-ink-soft">
              Телефоны из таблицы не переносим — отдельного поля для них нет. Если нужно, запишите в заметки об ученике.
            </p>
          )}
          <div className="overflow-x-auto">
            <table className="w-full min-w-[420px] text-left text-[13px]">
              <thead>
                <tr className="text-[11px] font-black uppercase text-ink-soft">
                  <th className="py-1.5 pr-3">Имя</th>
                  <th className="py-1.5 pr-3">Email</th>
                  <th className="py-1.5 pr-3">Класс</th>
                  <th className="py-1.5">Цена</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line-soft">
                {rows.map((r) => (
                  <tr key={r.line} className={r.error ? "text-coral-text" : r.duplicate ? "text-ink-soft line-through" : ""}>
                    <td className="py-1.5 pr-3 font-bold">{r.name}</td>
                    <td className="py-1.5 pr-3">
                      {r.error ?? (r.duplicate ? <span className="no-underline">уже есть — пропустим</span> : r.email ?? <span className="text-ink-soft">выдадим логин</span>)}
                    </td>
                    <td className="py-1.5 pr-3">{r.grade ?? "—"}</td>
                    <td className="py-1.5">{r.price ? `${r.price} ₽` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {state?.room !== null && state?.room !== undefined && good > state.room && (
            <p className="mt-3 rounded-xl bg-amber-light px-3 py-2 text-[13px] font-bold text-amber-dark">
              Сейчас можно добавить ещё {state.room}: остальные не поместятся в тариф
              {state.room <= 2 ? " (или подтвердите email)" : ""}.
            </p>
          )}
          <label className="mt-4 flex items-start gap-2.5 text-[13px] leading-snug text-ink-soft">
            <input type="checkbox" name="consent" className="mt-0.5 h-4 w-4 shrink-0 accent-pine" />
            <span>
              Подтверждаю, что получил(а) согласие учеников (или их законных представителей) на обработку персональных данных
              в соответствии с{" "}
              <a href="/legal/privacy" target="_blank" className="font-bold text-pine hover:underline">
                Политикой конфиденциальности
              </a>
              .
            </span>
          </label>
          {state?.error && <p className="mt-2 text-sm font-semibold text-coral">{state.error}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button type="submit" name="step" value="create" className="btn-primary" disabled={pending || good === 0}>
              {pending ? "Добавляем…" : `Добавить ${good}`}
            </button>
            <button type="submit" name="step" value="preview" className="btn-secondary" disabled={pending}>
              Проверить заново
            </button>
          </div>
        </div>
      )}
      {!rows && state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}
    </form>
  );
}
