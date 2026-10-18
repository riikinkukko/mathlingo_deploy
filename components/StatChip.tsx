"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Чип статистики в шапке ученика (серия / опыт / энергия). По нажатию —
 * маленькая подсказка, что это за число, и ссылка, где узнать подробнее.
 * Раньше это были немые <span>: «⚡ 40» рядом с «🔋 1» никто не мог расшифровать.
 */
export default function StatChip({
  label,
  className,
  children,
  title,
  text,
  href,
  linkLabel,
  size = "md",
}: {
  /** Доступное имя, например «Опыт: 40 XP». */
  label: string;
  className: string;
  children: React.ReactNode;
  /** Заголовок подсказки. */
  title: string;
  /** Одна-две фразы пояснения. */
  text: string;
  href?: string;
  linkLabel?: string;
  size?: "md" | "sm";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: PointerEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        aria-label={label}
        title={label}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1 rounded-pill font-black transition active:scale-95 ${
          size === "sm" ? "h-9 px-3 text-[13px]" : "h-9 px-2.5 text-[14px]"
        } ${className}`}
      >
        {children}
      </button>
      {open && (
        <div
          role="dialog"
          aria-label={title}
          className="absolute right-0 top-full z-50 mt-2 w-60 animate-slide-up-fade rounded-2xl border border-line bg-white p-3.5 text-left shadow-soft"
        >
          <p className="font-display text-[14px] font-black text-ink">{title}</p>
          <p className="mt-1 text-[13px] leading-snug text-ink-soft">{text}</p>
          {href && (
            <a href={href} className="mt-2 inline-block text-[13px] font-extrabold text-pine-dark underline-offset-2 hover:underline">
              {linkLabel ?? "Подробнее"} →
            </a>
          )}
        </div>
      )}
    </div>
  );
}
