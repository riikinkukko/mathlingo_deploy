"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { MAX_IMAGE_DATA_URL } from "@/lib/image-data";

/**
 * Разметка фото решения репетитором: обвести ошибку, поставить ✓ / ✗ / ?,
 * подписать. Одним пальцем (или мышью) — рисуем, двумя — двигаем и
 * увеличиваем. Результат — JPEG (фото + пометки), его увидит ученик.
 */

type Pt = [number, number];
type Item =
  | { t: "pen"; color: string; pts: Pt[] }
  | { t: "stamp"; kind: "ok" | "bad" | "ask"; at: Pt }
  | { t: "text"; color: string; at: Pt; text: string };

type Tool = "red" | "green" | "ok" | "bad" | "ask" | "text";

const RED = "#E2474C";
const GREEN = "#13A35E";
const AMBER = "#E39A1E";

function drawItem(ctx: CanvasRenderingContext2D, it: Item, u: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  if (it.t === "pen") {
    ctx.strokeStyle = it.color;
    ctx.lineWidth = u * 1.1;
    ctx.beginPath();
    it.pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    if (it.pts.length === 1) ctx.lineTo(it.pts[0][0] + 0.1, it.pts[0][1]);
    ctx.stroke();
    return;
  }
  if (it.t === "stamp") {
    const [x, y] = it.at;
    const r = u * 5;
    ctx.lineWidth = u * 1.4;
    if (it.kind === "ok") {
      ctx.strokeStyle = GREEN;
      ctx.beginPath();
      ctx.moveTo(x - r, y);
      ctx.lineTo(x - r * 0.25, y + r * 0.75);
      ctx.lineTo(x + r, y - r * 0.8);
      ctx.stroke();
    } else if (it.kind === "bad") {
      ctx.strokeStyle = RED;
      ctx.beginPath();
      ctx.moveTo(x - r * 0.8, y - r * 0.8);
      ctx.lineTo(x + r * 0.8, y + r * 0.8);
      ctx.moveTo(x + r * 0.8, y - r * 0.8);
      ctx.lineTo(x - r * 0.8, y + r * 0.8);
      ctx.stroke();
    } else {
      ctx.strokeStyle = AMBER;
      ctx.fillStyle = AMBER;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.stroke();
      ctx.font = `900 ${r * 1.4}px Nunito, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", x, y + r * 0.08);
    }
    return;
  }
  // Текст: белая подложка, чтобы читался поверх тетради в клетку.
  const size = u * 8.5;
  ctx.font = `800 ${size}px Nunito, system-ui, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  const w = ctx.measureText(it.text).width;
  const pad = size * 0.3;
  ctx.fillStyle = "rgba(255,255,255,0.88)";
  ctx.fillRect(it.at[0] - pad, it.at[1] - size * 0.7, w + pad * 2, size * 1.4);
  ctx.fillStyle = it.color;
  ctx.fillText(it.text, it.at[0], it.at[1]);
}

export default function ImageMarkup({
  src,
  initialItems,
  onDone,
  onCancel,
}: {
  src: string;
  initialItems?: Item[];
  onDone: (dataUrl: string, items: Item[]) => void;
  onCancel: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const areaRef = useRef<HTMLDivElement>(null);
  const imgRef = useRef<HTMLImageElement | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);
  const [items, setItems] = useState<Item[]>(initialItems ?? []);
  const [tool, setTool] = useState<Tool>("red");
  const [view, setView] = useState({ x: 0, y: 0, z: 1 });
  const [textAt, setTextAt] = useState<Pt | null>(null);
  const [textValue, setTextValue] = useState("");
  const [saving, setSaving] = useState(false);
  const drawing = useRef<Item | null>(null);
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const pinch = useRef<{ d: number; cx: number; cy: number; v: { x: number; y: number; z: number } } | null>(null);
  const unit = useRef(4);
  // Значок и текст ставим по отпусканию пальца — если это был щипок, не ставим.
  const tap = useRef<Pt | null>(null);

  // Загрузка фото (тот же домен — canvas не «испачкан», toDataURL работает).
  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      imgRef.current = img;
      const c = canvasRef.current!;
      c.width = img.naturalWidth;
      c.height = img.naturalHeight;
      unit.current = Math.max(img.naturalWidth, img.naturalHeight) / 260;
      setReady(true);
    };
    img.onerror = () => setError(true);
    img.src = src;
  }, [src]);

  const redraw = useCallback(
    (extra?: Item | null) => {
      const c = canvasRef.current;
      const img = imgRef.current;
      if (!c || !img) return;
      const ctx = c.getContext("2d")!;
      ctx.drawImage(img, 0, 0);
      for (const it of items) drawItem(ctx, it, unit.current);
      if (extra) drawItem(ctx, extra, unit.current);
    },
    [items]
  );
  useEffect(() => {
    if (ready) redraw();
  }, [ready, redraw]);

  // Блокируем прокрутку страницы под полноэкранным редактором.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  function toImage(clientX: number, clientY: number): Pt {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return [((clientX - r.left) / r.width) * c.width, ((clientY - r.top) / r.height) * c.height];
  }

  function areaPoint(e: { clientX: number; clientY: number }) {
    const r = areaRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: React.PointerEvent) {
    if (!ready || textAt) return;
    (e.target as Element).setPointerCapture?.(e.pointerId);
    pointers.current.set(e.pointerId, areaPoint(e));
    if (pointers.current.size === 2) {
      // Второй палец — это жест масштаба, а не рисунок: начатый штрих отменяем.
      drawing.current = null;
      tap.current = null;
      redraw();
      const [a, b] = [...pointers.current.values()];
      pinch.current = { d: Math.hypot(a.x - b.x, a.y - b.y), cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, v: view };
      return;
    }
    if (pointers.current.size > 2) return;
    const p = toImage(e.clientX, e.clientY);
    if (tool === "red" || tool === "green") {
      drawing.current = { t: "pen", color: tool === "red" ? RED : GREEN, pts: [p] };
      redraw(drawing.current);
    } else {
      tap.current = p;
    }
  }

  function onPointerMove(e: React.PointerEvent) {
    if (!pointers.current.has(e.pointerId)) return;
    pointers.current.set(e.pointerId, areaPoint(e));
    if (pinch.current && pointers.current.size >= 2) {
      const [a, b] = [...pointers.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      const cx = (a.x + b.x) / 2;
      const cy = (a.y + b.y) / 2;
      const s = pinch.current;
      const z = Math.min(5, Math.max(1, (s.v.z * d) / Math.max(1, s.d)));
      // Точка под пальцами остаётся на месте + сдвиг центра жеста.
      const x = cx - ((s.cx - s.v.x) * z) / s.v.z;
      const y = cy - ((s.cy - s.v.y) * z) / s.v.z;
      setView(z === 1 ? { x: 0, y: 0, z: 1 } : { x, y, z });
      return;
    }
    const cur = drawing.current;
    if (cur && cur.t === "pen") {
      const p = toImage(e.clientX, e.clientY);
      const last = cur.pts[cur.pts.length - 1];
      if (Math.hypot(p[0] - last[0], p[1] - last[1]) < unit.current * 0.3) return;
      cur.pts.push(p);
      redraw(cur);
    }
  }

  function onPointerUp(e: React.PointerEvent) {
    pointers.current.delete(e.pointerId);
    if (pointers.current.size < 2) pinch.current = null;
    const cur = drawing.current;
    if (cur && pointers.current.size === 0) {
      drawing.current = null;
      setItems((prev) => [...prev, cur]);
    }
    const p = tap.current;
    if (p && pointers.current.size === 0) {
      tap.current = null;
      if (tool === "text") {
        setTextAt(p);
        setTextValue("");
      } else if (tool === "ok" || tool === "bad" || tool === "ask") {
        const kind = tool;
        setItems((prev) => [...prev, { t: "stamp", kind, at: p }]);
      }
    }
  }

  function placeText() {
    const text = textValue.trim().slice(0, 80);
    if (text && textAt) setItems((prev) => [...prev, { t: "text", color: RED, at: textAt, text }]);
    setTextAt(null);
    setTextValue("");
  }

  async function finish() {
    const c = canvasRef.current;
    if (!c) return;
    setSaving(true);
    redraw();
    // Подбираем качество (а если не хватает — уменьшаем размер), чтобы JPEG
    // влез в лимит хранения: иначе сервер молча не сохранил бы пометки.
    let url = "";
    let src: HTMLCanvasElement = c;
    for (let scale = 1; scale >= 0.5 && !url; scale -= 0.25) {
      if (scale < 1) {
        src = document.createElement("canvas");
        src.width = Math.round(c.width * scale);
        src.height = Math.round(c.height * scale);
        src.getContext("2d")!.drawImage(c, 0, 0, src.width, src.height);
      }
      for (const q of [0.85, 0.75, 0.62, 0.5]) {
        const u = src.toDataURL("image/jpeg", q);
        if (u.length <= MAX_IMAGE_DATA_URL) {
          url = u;
          break;
        }
      }
    }
    setSaving(false);
    if (!url) {
      alertTooBig();
      return;
    }
    onDone(url, items);
  }

  const [tooBig, setTooBig] = useState(false);
  function alertTooBig() {
    setTooBig(true);
  }

  const tools: { id: Tool; label: string; icon: React.ReactNode }[] = [
    { id: "red", label: "Красная ручка", icon: <span className="h-6 w-6 rounded-full" style={{ background: RED }} /> },
    { id: "green", label: "Зелёная ручка", icon: <span className="h-6 w-6 rounded-full" style={{ background: GREEN }} /> },
    { id: "ok", label: "Галочка — верно", icon: <span className="text-[22px] font-black" style={{ color: GREEN }}>✓</span> },
    { id: "bad", label: "Крестик — ошибка", icon: <span className="text-[22px] font-black" style={{ color: RED }}>✗</span> },
    { id: "ask", label: "Вопрос — непонятно", icon: <span className="text-[20px] font-black" style={{ color: AMBER }}>?</span> },
    { id: "text", label: "Текст", icon: <span className="text-[17px] font-black text-ink">Aa</span> },
  ];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-ink" role="dialog" aria-label="Разметка решения">
      <header className="flex h-14 shrink-0 items-center gap-2 bg-white px-2">
        <button
          type="button"
          onClick={onCancel}
          aria-label="Закрыть без сохранения"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <p className="flex-1 font-display text-[16px] font-black text-ink">Разметка</p>
        <button
          type="button"
          onClick={() => setItems((prev) => prev.slice(0, -1))}
          disabled={items.length === 0}
          aria-label="Отменить последнюю пометку"
          className="flex h-11 w-11 items-center justify-center rounded-xl text-ink-soft disabled:opacity-30"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
        </button>
        <button
          type="button"
          onClick={finish}
          disabled={!ready || saving}
          className="h-11 rounded-xl bg-pine px-4 text-[15px] font-black text-white disabled:opacity-50"
        >
          {saving ? "…" : "Готово"}
        </button>
      </header>

      <div
        ref={areaRef}
        className="relative flex-1 touch-none overflow-hidden"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {error ? (
          <p className="p-6 text-center text-sm font-bold text-white">Не удалось загрузить фото.</p>
        ) : (
          <div
            className="flex h-full w-full origin-top-left items-center justify-center p-3"
            style={{ transform: `translate(${view.x}px, ${view.y}px) scale(${view.z})` }}
          >
            <canvas
              ref={canvasRef}
              aria-label="Фото решения с пометками"
              className={`max-h-full max-w-full bg-white shadow-lg ${tool === "text" ? "cursor-text" : "cursor-crosshair"}`}
            />
          </div>
        )}
        {!ready && !error && <p className="absolute inset-x-0 top-1/2 text-center text-sm font-bold text-white/70">Загружаем фото…</p>}
        {view.z > 1 && (
          <button
            type="button"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setView({ x: 0, y: 0, z: 1 })}
            className="absolute right-3 top-3 h-9 rounded-pill bg-white/90 px-3 text-[12px] font-black text-ink"
          >
            {Math.round(view.z * 100)}% · сбросить
          </button>
        )}
        {ready && items.length === 0 && view.z === 1 && (
          <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-[12px] font-bold text-white/80">
            Обведите ошибку или поставьте значок · двумя пальцами — увеличить
          </p>
        )}
      </div>

      {textAt && (
        <div className="absolute inset-x-0 top-14 z-10 flex gap-2 bg-white p-3 shadow-lg">
          <input
            autoFocus
            value={textValue}
            onChange={(e) => setTextValue(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && placeText()}
            maxLength={80}
            placeholder="Текст пометки"
            aria-label="Текст пометки"
            className="input flex-1"
          />
          <button type="button" onClick={placeText} className="h-12 rounded-xl bg-pine px-4 font-black text-white">
            OK
          </button>
          <button type="button" onClick={() => setTextAt(null)} className="h-12 rounded-xl px-3 font-bold text-ink-soft">
            Отмена
          </button>
        </div>
      )}

      {tooBig && (
        <p role="alert" className="bg-coral-light px-4 py-2 text-center text-[13px] font-bold text-coral-text">
          Не получилось сохранить пометки: фото слишком большое. Уберите часть пометок или напишите комментарий текстом.
        </p>
      )}

      <nav aria-label="Инструменты разметки" className="flex shrink-0 justify-center gap-1.5 bg-white px-2 pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
        {tools.map((t) => (
          <button
            key={t.id}
            type="button"
            aria-label={t.label}
            aria-pressed={tool === t.id}
            onClick={() => setTool(t.id)}
            className={`flex h-12 w-12 items-center justify-center rounded-2xl transition ${
              tool === t.id ? "bg-pine-light ring-2 ring-pine" : "bg-paper"
            }`}
          >
            {t.icon}
          </button>
        ))}
      </nav>
    </div>
  );
}

export type MarkupItem = Item;
