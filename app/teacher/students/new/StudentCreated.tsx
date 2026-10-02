"use client";

import { useState } from "react";

/**
 * Экран «Ученик добавлен». Раньше тут был только пароль одной строкой —
 * репетитору приходилось самому собирать сообщение с адресом сайта и логином.
 * Теперь — готовый текст для мессенджера одной кнопкой и следующие шаги.
 */
export default function StudentCreated({
  name,
  email,
  password,
  studentId,
}: {
  name: string;
  email: string;
  password: string;
  studentId: string;
}) {
  const [copied, setCopied] = useState(false);
  const site = typeof window !== "undefined" ? window.location.origin : "https://planimetrika.online";
  const first = name.split(" ")[0] || name;
  const message =
    `${first}, привет! Я завёл(а) тебе аккаунт в Планиметрике — там домашка, задачи и подготовка к ЕГЭ.\n` +
    `Сайт: ${site}\nЛогин: ${email}\nПароль: ${password}\n` +
    `Есть и приложение для Android — ищи «Планиметрика» в Google Play.`;

  async function copy() {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // Буфер обмена недоступен (старый браузер/WebView) — текст виден ниже, его можно выделить.
    }
  }

  return (
    <div className="space-y-4">
      <div className="card border-pine-light bg-pine-light/30 p-5">
        <p className="font-display text-lg font-black text-pine-dark">✓ {name} — аккаунт готов</p>
        <dl className="mt-3 space-y-1.5 rounded-2xl bg-white p-3.5 text-sm">
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-ink-soft">Логин</dt>
            <dd className="min-w-0 break-all font-mono font-bold text-ink">{email}</dd>
          </div>
          <div className="flex gap-2">
            <dt className="w-16 shrink-0 text-ink-soft">Пароль</dt>
            <dd className="font-mono font-bold text-ink">{password}</dd>
          </div>
        </dl>
        <button type="button" onClick={copy} className="btn-primary mt-3 w-full">
          {copied ? "✓ Скопировано — вставьте в мессенджер" : "Скопировать приглашение для ученика"}
        </button>
        <details className="mt-2 text-xs text-ink-soft">
          <summary className="cursor-pointer py-1 font-bold">Что будет в сообщении</summary>
          <pre className="mt-1 whitespace-pre-wrap rounded-xl bg-white p-3 font-sans text-[12px] leading-relaxed text-ink">{message}</pre>
        </details>
        <p className="mt-2 text-xs text-ink-soft">Пароль больше нигде не показывается — сохраните его или отправьте сейчас.</p>
      </div>

      <div className="card p-5">
        <p className="mb-3 font-display text-[15px] font-black text-ink">Что дальше</p>
        <div className="grid gap-2">
          <a href={`/teacher/homework/new?studentId=${studentId}`} className="flex min-h-[48px] items-center justify-between rounded-2xl border border-line-soft px-4 font-extrabold text-ink hover:border-pine">
            Задать первое задание <span aria-hidden className="text-pine">→</span>
          </a>
          <a href={`/teacher/student/${studentId}#parents`} className="flex min-h-[48px] items-center justify-between rounded-2xl border border-line-soft px-4 font-extrabold text-ink hover:border-pine">
            Пригласить родителя <span aria-hidden className="text-pine">→</span>
          </a>
          <a href="/teacher/schedule" className="flex min-h-[48px] items-center justify-between rounded-2xl border border-line-soft px-4 font-extrabold text-ink hover:border-pine">
            Запланировать занятие <span aria-hidden className="text-pine">→</span>
          </a>
          <a href="/teacher/students/new" className="flex min-h-[44px] items-center justify-center text-sm font-bold text-ink-soft hover:text-pine">
            + Добавить ещё ученика
          </a>
        </div>
      </div>
    </div>
  );
}
