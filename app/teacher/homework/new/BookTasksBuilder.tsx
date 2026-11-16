"use client";

import { useState } from "react";
import { fileToJpeg } from "@/lib/image-compress";
import type { DraftProblem } from "./CustomProblemBuilder";

type Page = { photoId: string | null; preview: string | null; numbers: string; uploading: boolean; error: string | null };
const EMPTY_PAGE: Page = { photoId: null, preview: null, numbers: "", uploading: false, error: null };

/** «5 12», «9: 0,25», «14» → номер и ответ (без ответа — развёрнутое, проверяет репетитор). */
export function parseNumbers(text: string): { n: string; answer: string }[] {
  const out: { n: string; answer: string }[] = [];
  for (const raw of text.split(/\n|;/)) {
    const line = raw.trim();
    if (!line) continue;
    const m = /^№?\s*(\d{1,3}(?:\.\d{1,3})?[а-яa-z]?)\s*(?:[:)\-—–=.]\s*|\s+|$)(.*)$/i.exec(line);
    if (!m) continue;
    out.push({ n: m[1], answer: m[2].trim() });
  }
  return out.slice(0, 30);
}

export default function BookTasksBuilder({ onAdd, onCancel }: { onAdd: (d: DraftProblem[]) => void; onCancel: () => void }) {
  const [source, setSource] = useState("");
  const [pages, setPages] = useState<Page[]>([EMPTY_PAGE]);

  const patch = (i: number, p: Partial<Page>) => setPages((prev) => prev.map((x, j) => (j === i ? { ...x, ...p } : x)));

  async function upload(i: number, file: File | undefined) {
    if (!file) return;
    patch(i, { uploading: true, error: null });
    const data = await fileToJpeg(file, 1800, 900_000);
    if (!data) return patch(i, { uploading: false, error: "Не получилось прочитать фото — попробуйте другое." });
    try {
      const res = await fetch("/api/task-photo", { method: "POST", body: JSON.stringify({ data }) });
      const j = await res.json();
      if (!res.ok || !j.id) return patch(i, { uploading: false, error: j.error || "Не удалось загрузить фото" });
      patch(i, { uploading: false, photoId: j.id, preview: data });
    } catch {
      patch(i, { uploading: false, error: "Нет связи — попробуйте ещё раз" });
    }
  }

  const ready = pages.filter((p) => p.photoId && parseNumbers(p.numbers).length);
  const count = ready.reduce((s, p) => s + parseNumbers(p.numbers).length, 0);

  function add() {
    const src = source.trim() || "Сборник";
    const drafts: DraftProblem[] = [];
    for (const p of ready) {
      for (const { n, answer } of parseNumbers(p.numbers)) {
        const detailed = !answer;
        drafts.push({
          text: `${src} · № ${n}. Условие — на фото.`,
          answerType: detailed ? "DETAILED" : "NUMBER",
          correctAnswer: detailed ? "Решение проверяет репетитор" : answer,
          hint: "Посмотри условие на фото ещё раз и проверь вычисления.",
          explanation: detailed ? "Разбор — в комментарии репетитора." : `Ответ: ${answer}`,
          photoId: p.photoId!,
        });
      }
    }
    onAdd(drafts);
  }

  return (
    <div className="card space-y-4 p-4">
      <div>
        <p className="font-black text-ink">Задачи из сборника по фото</p>
        <p className="mt-1 text-[12px] leading-snug text-ink-soft">
          Сфотографируйте страницу (Ященко, Лысенко — любой сборник) и перечислите номера. С ответом — проверится сам, без ответа — ученик
          пришлёт решение, и вы проверите его в «Проверке решений».
        </p>
      </div>
      <div>
        <label className="label">Откуда задачи</label>
        <input className="input text-sm" value={source} onChange={(e) => setSource(e.target.value)} placeholder="Ященко 2027, вариант 14" />
      </div>

      {pages.map((p, i) => (
        <div key={i} className="rounded-2xl border border-line-soft p-3">
          <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-ink-soft">Страница {i + 1}</p>
          <div className="flex flex-col gap-3 sm:flex-row">
            <label className="flex h-32 w-full shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-xl border-2 border-dashed border-line bg-paper text-center text-[12px] font-bold text-ink-soft hover:border-pine sm:w-28">
              {p.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={p.preview} alt={`Страница ${i + 1}`} className="h-full w-full object-cover" />
              ) : p.uploading ? (
                "Загружаем…"
              ) : (
                <span>📷<br />Фото страницы</span>
              )}
              <input type="file" accept="image/*" className="sr-only" onChange={(e) => upload(i, e.target.files?.[0])} />
            </label>
            <div className="min-w-0 flex-1">
              <label className="label">Номера и ответы — по одному в строке</label>
              <textarea
                className="input min-h-[96px] resize-y font-mono text-sm"
                value={p.numbers}
                onChange={(e) => patch(i, { numbers: e.target.value })}
                placeholder={"5 12\n9 0,25\n12 -3\n14"}
              />
              <p className="mt-1 text-[11px] text-ink-soft">
                {parseNumbers(p.numbers).length
                  ? parseNumbers(p.numbers)
                      .map((x) => `№${x.n}${x.answer ? ` → ${x.answer}` : " (развёрнуто)"}`)
                      .join(" · ")
                  : "Номер, пробел, ответ. Без ответа — развёрнутое решение."}
              </p>
            </div>
          </div>
          {p.error && <p className="mt-2 text-xs font-bold text-coral">{p.error}</p>}
        </div>
      ))}

      <div className="flex flex-wrap gap-2">
        <button type="button" className="btn-secondary !text-xs" onClick={() => setPages((prev) => [...prev, EMPTY_PAGE])}>
          + Ещё страница
        </button>
        <button type="button" className="btn-primary !text-xs" disabled={!count} onClick={add}>
          {count ? `Добавить ${count} в задание` : "Добавьте фото и номера"}
        </button>
        <button type="button" className="btn-secondary !text-xs" onClick={onCancel}>
          Отмена
        </button>
      </div>
      {pages.some((p) => !p.photoId && parseNumbers(p.numbers).length) && (
        <p className="text-[11px] font-bold text-amber-dark">Страница без фото не добавится — прикрепите снимок.</p>
      )}
    </div>
  );
}
