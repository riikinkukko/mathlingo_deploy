"use client";

import { useRef, useState } from "react";
import { fileToJpeg } from "@/lib/image-compress";
import { saveMockPhotoAction } from "@/app/actions-mock";

/**
 * Фото решения задания второй части: снять, переснять, убрать. Сохраняется
 * на сервере сразу — фото не потеряется, даже если закрыть вкладку.
 */
export default function PhotoSlot({
  mockId,
  problemId,
  n,
  image,
  onChange,
  disabled = false,
  compact = false,
}: {
  mockId: string;
  problemId: string;
  n: number;
  image: string | null;
  onChange: (img: string | null) => void;
  disabled?: boolean;
  compact?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function pick(file: File | undefined) {
    if (!file) return;
    setError(null);
    setBusy(true);
    const url = await fileToJpeg(file);
    if (!url) {
      setBusy(false);
      setError("Не получилось обработать фото — попробуй другое");
      return;
    }
    const res = await saveMockPhotoAction(mockId, problemId, url);
    setBusy(false);
    if ("error" in res) setError(res.error);
    else onChange(url);
  }

  async function remove() {
    setBusy(true);
    const res = await saveMockPhotoAction(mockId, problemId, null);
    setBusy(false);
    if ("error" in res) setError(res.error);
    else onChange(null);
  }

  const input = (
    <input
      ref={inputRef}
      type="file"
      accept="image/*"
      capture="environment"
      className="hidden"
      onChange={(e) => {
        void pick(e.target.files?.[0]);
        e.target.value = "";
      }}
    />
  );

  if (compact) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-line-soft bg-white p-2.5">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-xl bg-paper font-display font-black text-ink">
          {image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={image} alt={`Фото решения задания ${n}`} className="h-full w-full object-cover" />
          ) : (
            n
          )}
        </span>
        <span className="min-w-0 flex-1 text-[13px] font-bold text-ink">
          Задание {n}
          <span className={`block text-[12px] font-semibold ${image ? "text-pine-dark" : "text-ink-soft"}`}>
            {busy ? "Сохраняем…" : image ? "Фото приложено" : "Фото нет"}
          </span>
          {error && <span className="block text-[12px] text-coral">{error}</span>}
        </span>
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="rounded-pill border-2 border-line px-3 py-1.5 text-[12px] font-black text-ink-soft transition hover:border-pine hover:text-pine disabled:opacity-50"
        >
          {image ? "Переснять" : "Сфотографировать"}
        </button>
        {input}
      </div>
    );
  }

  return (
    <div>
      {image ? (
        <div className="overflow-hidden rounded-2xl border border-line bg-white">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={`Фото решения задания ${n}`} className="max-h-80 w-full object-contain" />
          <div className="flex gap-2 border-t border-line-soft p-2">
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => inputRef.current?.click()}
              className="btn-secondary flex-1 !py-2 !text-[12px]"
            >
              Переснять
            </button>
            <button
              type="button"
              disabled={disabled || busy}
              onClick={() => void remove()}
              className="btn-secondary flex-1 !py-2 !text-[12px]"
            >
              Убрать
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || busy}
          onClick={() => inputRef.current?.click()}
          className="flex h-14 w-full items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-line bg-white text-[14px] font-extrabold text-ink-soft transition hover:border-pine hover:text-pine disabled:opacity-50"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M3 8a2 2 0 0 1 2-2h2l2-2h6l2 2h2a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
            <circle cx="12" cy="13" r="3.5" />
          </svg>
          {busy ? "Сохраняем фото…" : "Сфотографировать решение"}
        </button>
      )}
      {error && <p className="mt-1.5 text-sm font-semibold text-coral">{error}</p>}
      {input}
    </div>
  );
}
