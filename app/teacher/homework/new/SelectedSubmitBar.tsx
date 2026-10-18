"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

/**
 * Кнопка «Назначить задание» со счётчиком выбранных задач. Пока ничего не
 * выбрано, кнопка обычная (не липкая) и неактивная: раньше липкая зелёная
 * кнопка висела поверх полей формы, а нажатие без задач молча перезагружало
 * страницу. Как только выбрана хоть одна задача (из банка или своя), панель
 * прилипает к низу экрана, чтобы не листать сотни задач до кнопки.
 */
export default function SelectedSubmitBar() {
  const ref = useRef<HTMLDivElement>(null);
  const [count, setCount] = useState(0);
  const [warn, setWarn] = useState(false);
  const countRef = useRef(0);

  useEffect(() => {
    const form = ref.current?.closest("form");
    if (!form) return;
    const recount = () => {
      const bank = form.querySelectorAll('input[name="problemIds"]:checked').length;
      let custom = 0;
      const raw = (form.querySelector('input[name="customProblems"]') as HTMLInputElement | null)?.value;
      try {
        const parsed = raw ? JSON.parse(raw) : [];
        custom = Array.isArray(parsed) ? parsed.length : 0;
      } catch {
        custom = 0;
      }
      countRef.current = bank + custom;
      setCount(bank + custom);
      if (bank + custom > 0) setWarn(false);
    };
    // Enter в поле «Название» отправил бы пустую форму — ловим на клиенте.
    const guard = (e: Event) => {
      if (countRef.current === 0) {
        e.preventDefault();
        setWarn(true);
      }
    };
    recount();
    form.addEventListener("change", recount);
    form.addEventListener("submit", guard);
    return () => {
      form.removeEventListener("change", recount);
      form.removeEventListener("submit", guard);
    };
  }, []);

  if (count === 0) {
    return (
      <div ref={ref} className="pb-4">
        <button className="btn-primary w-full sm:w-auto" type="submit" disabled>
          Назначить задание
        </button>
        <p className={`mt-2 text-[13px] ${warn ? "font-bold text-coral-text" : "text-ink-soft"}`} role={warn ? "alert" : undefined}>
          Отметьте задачи из банка выше или добавьте свою — тогда кнопка станет активной.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className="sticky bottom-[calc(64px+max(10px,var(--app-sab)))] z-20 -mx-4 border-t border-line-soft bg-paper/95 px-4 py-3 backdrop-blur lg:bottom-0"
    >
      <SubmitButton count={count} />
    </div>
  );
}

function SubmitButton({ count }: { count: number }) {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary w-full sm:w-auto" type="submit" disabled={pending}>
      {pending ? "Назначаем…" : `Назначить задание · ${count} ${plural(count)}`}
    </button>
  );
}

function plural(n: number) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return "задача";
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return "задачи";
  return "задач";
}
