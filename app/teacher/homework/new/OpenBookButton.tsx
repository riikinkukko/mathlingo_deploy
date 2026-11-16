"use client";

/** Кнопка наверху страницы: раскрыть ручную сборку сразу на «Из сборника по фото». */
export default function OpenBookButton() {
  return (
    <button
      type="button"
      onClick={() => {
        const d = document.getElementById("manual") as HTMLDetailsElement | null;
        if (d) d.open = true;
        window.dispatchEvent(new Event("open-book-tasks"));
        setTimeout(() => document.getElementById("book-tasks")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
      }}
      className="flex min-h-[56px] w-full items-center gap-3 rounded-[20px] border border-line-soft bg-white px-4 py-3 text-left transition hover:border-pine"
    >
      <span aria-hidden className="text-2xl">📷</span>
      <span className="min-w-0 flex-1">
        <span className="block font-display text-[16px] font-black text-ink">Из сборника по фото</span>
        <span className="block text-[13px] text-ink-soft">Ященко или любой другой: фото страницы и номера с ответами</span>
      </span>
      <span aria-hidden className="text-lg font-black text-ink-soft">›</span>
    </button>
  );
}
