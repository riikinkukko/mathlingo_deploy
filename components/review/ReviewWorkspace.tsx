"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { reviewAttemptAction } from "@/app/actions";
import DiagramRenderer from "@/components/diagrams/DiagramRenderer";
import { criteriaFor } from "@/lib/ege-criteria";
import { defaultDecisionForScore, maxPointsForTask, scoreLabel } from "@/lib/ege-points";
import { MAX_IMAGE_DATA_URL } from "@/lib/image-data";
import { submittedLabel, type ReviewItem } from "@/lib/review-item";
import {
  type MarkItem,
  type Pt,
  type StampKind,
  MARK_BLUE,
  MARK_GREEN,
  MARK_INK,
  MARK_RED,
  MARK_WIDTHS,
  bboxIntersects,
  clearReviewDraft,
  drawItem,
  hitItem,
  itemSvg,
  loadReviewDraft,
  pruneReviewDrafts,
  rotateItemCW,
  saveReviewDraft,
  translateItem,
  unionBBox,
  unitFor,
} from "@/lib/review-markup";

/**
 * Проверка решений на весь экран — с теми же удобствами, что у черновика ученика.
 *  • Фото решения во весь экран: один палец (мышь, стилус) — пометки, два
 *    пальца — двигать и приближать, короткий тап двумя пальцами — отменить.
 *    Ладонь не рисует; режим «пишу стилусом» — палец только двигает фото.
 *  • Ручка, маркер, овал «обвести ошибку», значки ✓ ✗ ?, подписи, ластик,
 *    выбор (двигать, удалять), отменить / вернуть, поворот фото.
 *  • Рядом — условие, эталон, критерии ФИПИ (тап по критерию = балл),
 *    комментарий с готовыми фразами, «Одобрить» / «На доработку».
 *  • После решения сразу открывается следующая работа очереди.
 *  • Незаконченная проверка (пометки, баллы, комментарий) сохраняется на
 *    устройстве — можно закрыть и вернуться.
 *  • Компьютер: Ctrl+колесо — масштаб, колесо — прокрутка, пробел + мышь —
 *    двигать фото; клавиши инструментов, 0–4 — баллы, Ctrl+Enter — сохранить.
 */

type Tool = "select" | "pen" | "oval" | "text" | "stamp" | "eraser";
type View = { x: number; y: number; z: number };
type Decision = "approved" | "needs_revision";
type Live =
  | { t: "stroke"; pts: number[] }
  | { t: "line"; a: Pt; b: Pt }
  | { t: "oval"; a: Pt; b: Pt }
  | null;
type Photo = { url: string; w: number; h: number; source: CanvasImageSource };

const COLORS = [
  { hex: MARK_RED, label: "Красный" },
  { hex: MARK_GREEN, label: "Зелёный" },
  { hex: MARK_BLUE, label: "Синий" },
  { hex: MARK_INK, label: "Чёрный" },
];
const WIDTH_LABELS = ["Тонкая", "Средняя", "Толстая"];
const STAMPS: { k: StampKind; label: string; key: string }[] = [
  { k: "ok", label: "Верно", key: "G" },
  { k: "bad", label: "Ошибка", key: "X" },
  { k: "ask", label: "Непонятно", key: "Q" },
];
const QUICK_PHRASES = [
  "Нет обоснования",
  "Вычислительная ошибка",
  "Не записан ответ",
  "Не рассмотрен случай",
  "Нужен чертёж",
  "Отличное решение!",
];
const MAX_Z = 8;
const MARGIN = 16;

function readFlag(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}
function writeFlag(key: string, v: string) {
  try {
    localStorage.setItem(key, v);
  } catch {
    /* приватный режим */
  }
}

/** Повернуть картинку на rot × 90° по часовой стрелке (canvas). */
function rotated(img: HTMLImageElement, rot: number): HTMLCanvasElement {
  const r = ((rot % 4) + 4) % 4;
  const w = img.naturalWidth, h = img.naturalHeight;
  const c = document.createElement("canvas");
  c.width = r % 2 ? h : w;
  c.height = r % 2 ? w : h;
  const ctx = c.getContext("2d")!;
  ctx.translate(c.width / 2, c.height / 2);
  ctx.rotate((r * Math.PI) / 2);
  ctx.drawImage(img, -w / 2, -h / 2);
  return c;
}

// ======================================================================
// Очередь работ

export default function ReviewWorkspace({
  items,
  startIndex = 0,
  onClose,
}: {
  items: ReviewItem[];
  startIndex?: number;
  /** checked — сколько работ проверено за сеанс (если > 0, страницу стоит обновить). */
  onClose: (checked: number) => void;
}) {
  const [queue, setQueue] = useState(items);
  const [idx, setIdx] = useState(Math.min(Math.max(0, startIndex), Math.max(0, items.length - 1)));
  const [checked, setChecked] = useState(0);
  const [toast, setToast] = useState<string | null>(null);
  const current = queue[idx];

  useEffect(() => {
    pruneReviewDrafts();
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  // Заранее грузим фото следующей работы — переход без ожидания.
  useEffect(() => {
    const next = queue[idx + 1];
    if (next?.hasImage) new Image().src = `/api/attempt-image/${next.attemptId}`;
  }, [queue, idx]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2200);
    return () => clearTimeout(t);
  }, [toast]);

  const close = () => onClose(checked);

  const node = (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white text-ink" style={{ paddingTop: "var(--app-sat)" }} role="dialog" aria-label="Проверка решения">
      {current ? (
        <Work
          key={current.attemptId}
          review={current}
          pos={idx}
          total={queue.length}
          onPrev={idx > 0 ? () => setIdx(idx - 1) : undefined}
          onNext={idx < queue.length - 1 ? () => setIdx(idx + 1) : undefined}
          onClose={close}
          onDecided={(label) => {
            setChecked((c) => c + 1);
            setToast(queue.length > 1 ? `${label} — открыта следующая работа` : label);
            setQueue((q) => q.filter((r) => r.attemptId !== current.attemptId));
            setIdx((i) => Math.max(0, Math.min(i, queue.length - 2)));
          }}
        />
      ) : (
        <div className="flex flex-1 flex-col items-center justify-center p-8 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-full bg-pine-light text-3xl font-black text-pine-dark">✓</span>
          <p className="mt-4 font-display text-2xl font-black">Все работы проверены</p>
          <p className="mt-1 text-sm text-ink-soft">
            {checked > 0 ? `За этот заход: ${checked}. Ученики уже получили уведомления.` : "В очереди ничего не осталось."}
          </p>
          <button type="button" onClick={close} className="btn-primary mt-6 min-w-48">
            Закрыть
          </button>
        </div>
      )}
      {toast && (
        <div role="status" className="pointer-events-none absolute left-1/2 top-[calc(var(--app-sat)+64px)] z-20 -translate-x-1/2 whitespace-nowrap rounded-pill bg-pine-strong px-4 py-2 text-[13px] font-extrabold text-white shadow-lg">
          {toast}
        </div>
      )}
    </div>
  );
  return typeof document !== "undefined" ? createPortal(node, document.body) : null;
}

// ======================================================================
// Одна работа

function Work({
  review,
  pos,
  total,
  onPrev,
  onNext,
  onClose,
  onDecided,
}: {
  review: ReviewItem;
  pos: number;
  total: number;
  onPrev?: () => void;
  onNext?: () => void;
  onClose: () => void;
  onDecided: (label: string) => void;
}) {
  const id = review.attemptId;
  const draft = useMemo(() => (typeof window !== "undefined" ? loadReviewDraft(id) : null), [id]);
  const desktop = useMemo(() => typeof window !== "undefined" && window.matchMedia("(pointer: fine)").matches, []);

  // ---------------------------------------------------- пометки и история
  const [items, setItems] = useState<MarkItem[]>(draft?.items ?? []);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const past = useRef<MarkItem[][]>([]);
  const future = useRef<MarkItem[][]>([]);
  const [selected, setSelected] = useState<number[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const commit = useCallback((next: MarkItem[]) => {
    past.current.push(itemsRef.current);
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    setItems(next);
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(itemsRef.current);
    setSelected([]);
    setItems(prev);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(itemsRef.current);
    setSelected([]);
    setItems(next);
  }, []);

  // ---------------------------------------------------- оценка
  const maxPoints = maxPointsForTask(review.problem.egeTaskNumber);
  const criteria = criteriaFor(review.problem.egeTaskNumber);
  const [score, setScore] = useState<number | null>(draft?.score ?? null);
  const [feedback, setFeedback] = useState(draft?.feedback ?? "");
  const [saving, setSaving] = useState<Decision | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);

  // ---------------------------------------------------- фото
  const [rot, setRot] = useState(draft?.rot ?? 0);
  const [photo, setPhoto] = useState<Photo | null>(null);
  const [photoError, setPhotoError] = useState(false);
  const original = useRef<HTMLImageElement | null>(null);

  useEffect(() => {
    if (!review.hasImage) return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      if (cancelled) return;
      original.current = img;
      showRotated(img, rot);
    };
    img.onerror = () => !cancelled && setPhotoError(true);
    img.src = `/api/attempt-image/${id}`;
    return () => {
      cancelled = true;
    };
    // Поворот применяется отдельно (rotate), здесь только первая загрузка.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, review.hasImage]);

  // Повёрнутое фото показываем через blob-ссылку; старую освобождаем.
  const blobUrl = useRef<string | null>(null);
  function setBlob(url: string | null) {
    if (blobUrl.current) URL.revokeObjectURL(blobUrl.current);
    blobUrl.current = url;
  }
  useEffect(() => () => setBlob(null), []);

  function showRotated(img: HTMLImageElement, r: number) {
    if (!(r % 4)) {
      setBlob(null);
      setPhoto({ url: img.src, w: img.naturalWidth, h: img.naturalHeight, source: img });
      return;
    }
    const c = rotated(img, r);
    c.toBlob((b) => {
      if (!b) return;
      const url = URL.createObjectURL(b);
      setBlob(url);
      setPhoto({ url, w: c.width, h: c.height, source: c });
    }, "image/png");
  }

  function rotate() {
    const img = original.current;
    if (!img || !photo) return;
    // Пометки поворачиваются вместе с фото; историю начинаем заново.
    setItems((list) => list.map((it) => rotateItemCW(it, photo.h)));
    past.current = [];
    future.current = [];
    setSelected([]);
    const r = (rot + 1) % 4;
    setRot(r);
    touched.current = false;
    showRotated(img, r);
  }

  // Черновик проверки — на устройстве, чтобы закрыть и вернуться без потерь.
  // Пишем с задержкой, а при закрытии работы — сразу (если её не сохранили на сервер).
  const latest = useRef({ items, rot, score, feedback });
  latest.current = { items, rot, score, feedback };
  const submitted = useRef(false);
  useEffect(() => {
    const t = setTimeout(() => saveReviewDraft(id, latest.current), 350);
    return () => clearTimeout(t);
  }, [id, items, rot, score, feedback]);
  useEffect(
    () => () => {
      if (!submitted.current) saveReviewDraft(id, latest.current);
    },
    [id]
  );

  // ---------------------------------------------------- вид
  const viewportRef = useRef<HTMLDivElement>(null);
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const touched = useRef(false);

  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setVp({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setVp({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const W = photo?.w ?? 1, H = photo?.h ?? 1;
  const u = unitFor(W, H);
  const base = photo && vp.w ? Math.min((vp.w - MARGIN * 2) / W, (vp.h - MARGIN * 2) / H) : 1;
  const scale = base * view.z;

  const clampView = useCallback(
    (v: View): View => {
      const z = Math.min(MAX_Z, Math.max(1, v.z));
      const s = base * z;
      const cw = W * s, ch = H * s;
      const axis = (pos: number, size: number, box: number) =>
        size <= box - MARGIN * 2 ? (box - size) / 2 : Math.min(MARGIN, Math.max(box - MARGIN - size, pos));
      return { x: axis(v.x, cw, vp.w), y: axis(v.y, ch, vp.h), z };
    },
    [base, W, H, vp.w, vp.h]
  );

  /** «По ширине»: фото во всю ширину, сверху — начало решения. */
  const fitWidth = useCallback(() => {
    const z = Math.min(MAX_Z, Math.min(vp.w - MARGIN * 2, 1100) / (W * base));
    if (z < 1.08) return false;
    setView(clampView({ x: 0, y: MARGIN, z }));
    return true;
  }, [vp.w, W, base, clampView]);

  // Пока фото не трогали — держим его в удобном положении (и после поворота экрана).
  useEffect(() => {
    if (!photo || !vp.w || touched.current) return;
    const wide = typeof window !== "undefined" && window.matchMedia("(min-width: 1024px) and (pointer: fine)").matches;
    if (!(wide && fitWidth())) setView(clampView({ x: 0, y: 0, z: 1 }));
  }, [photo, vp.w, vp.h, fitWidth, clampView]);

  function zoomAt(z: number, cx: number, cy: number) {
    const r = viewportRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const nz = Math.min(MAX_Z, Math.max(1, z));
    const wx = (cx - r.left - v.x) / (base * v.z), wy = (cy - r.top - v.y) / (base * v.z);
    touched.current = true;
    setView(clampView({ z: nz, x: cx - r.left - wx * base * nz, y: cy - r.top - wy * base * nz }));
  }

  function toPhoto(cx: number, cy: number): Pt {
    const r = viewportRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const s = base * v.z;
    return [(cx - r.left - v.x) / s, (cy - r.top - v.y) / s];
  }

  // Колесо: прокрутка; Ctrl/⌘ + колесо (и щипок на тачпаде) — масштаб под курсором.
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (e.ctrlKey || e.metaKey) {
        zoomAt(viewRef.current.z * Math.exp(-e.deltaY * 0.0025), e.clientX, e.clientY);
        return;
      }
      touched.current = true;
      setView((v) => clampView({ ...v, x: v.x - e.deltaX, y: v.y - e.deltaY }));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
    // zoomAt читает актуальный вид из refs.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [clampView]);

  // ---------------------------------------------------- инструменты
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(MARK_RED);
  const [width, setWidth] = useState<number>(MARK_WIDTHS[1]);
  const [marker, setMarker] = useState(false);
  const [stamp, setStamp] = useState<StampKind>("ok");
  const [popover, setPopover] = useState<"pen" | null>(null);
  const [stylusOnly, setStylusOnly] = useState(() => readFlag("pm-sketch-stylus") === "1");
  const [live, setLive] = useState<Live>(null);
  const liveRef = useRef<Live>(null);
  const [textEdit, setTextEdit] = useState<{ p: Pt; value: string; index: number | null } | null>(null);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const [drag, setDrag] = useState<{ from: Pt; dx: number; dy: number } | null>(null);
  const [hint, setHint] = useState(() => readFlag("pm-review-hint") !== "1");
  const [boardToast, setBoardToast] = useState<string | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const eraseStart = useRef<MarkItem[] | null>(null);
  const spaceDown = useRef(false);

  useEffect(() => {
    if (!boardToast) return;
    const t = setTimeout(() => setBoardToast(null), 1400);
    return () => clearTimeout(t);
  }, [boardToast]);

  function setLiveBoth(l: Live) {
    liveRef.current = l;
    setLive(l);
  }

  function chooseTool(t: Tool) {
    setTool(t);
    setSelected([]);
    setPopover(null);
    if (t !== "pen") setMarker(false);
  }

  function itemAt(p: Pt): number {
    const r = 10 / scale;
    const list = itemsRef.current;
    for (let i = list.length - 1; i >= 0; i--) if (hitItem(list[i], p, r, u)) return i;
    return -1;
  }

  function erase(p: Pt) {
    const r = 12 / scale;
    const list = itemsRef.current;
    const keep = list.filter((it) => !hitItem(it, p, r, u));
    if (keep.length !== list.length) {
      itemsRef.current = keep;
      setItems(keep);
    }
  }

  function startTool(p: Pt, mods: { shift: boolean }) {
    if (tool === "pen") {
      setLiveBoth(mods.shift && !marker ? { t: "line", a: p, b: p } : { t: "stroke", pts: [p[0], p[1]] });
    } else if (tool === "oval") {
      setLiveBoth({ t: "oval", a: p, b: p });
    } else if (tool === "eraser") {
      eraseStart.current = itemsRef.current;
      erase(p);
    } else if (tool === "select") {
      const sel = selectedRef.current;
      const box = unionBBox(sel.map((i) => itemsRef.current[i]).filter(Boolean), u);
      const pad = 10 / scale;
      const inBox = box && p[0] > box.x0 - pad && p[0] < box.x1 + pad && p[1] > box.y0 - pad && p[1] < box.y1 + pad;
      if (inBox) {
        setDrag({ from: p, dx: 0, dy: 0 });
        return;
      }
      const hit = itemAt(p);
      if (hit >= 0) {
        setSelected([hit]);
        setDrag({ from: p, dx: 0, dy: 0 });
      } else {
        setSelected([]);
        setMarquee({ a: p, b: p });
      }
    }
  }

  function moveTool(p: Pt, shift: boolean) {
    const l = liveRef.current;
    if (l?.t === "stroke") {
      const n = l.pts.length;
      if (Math.hypot(p[0] - l.pts[n - 2], p[1] - l.pts[n - 1]) < 1.2 / scale) return;
      if (shift && !marker) {
        setLiveBoth({ t: "line", a: [l.pts[0], l.pts[1]], b: p });
        return;
      }
      setLiveBoth({ t: "stroke", pts: [...l.pts, p[0], p[1]] });
    } else if (l?.t === "line") {
      setLiveBoth({ ...l, b: p });
    } else if (l?.t === "oval") {
      // Shift — ровный круг.
      if (shift) {
        const d = Math.max(Math.abs(p[0] - l.a[0]), Math.abs(p[1] - l.a[1]));
        setLiveBoth({ ...l, b: [l.a[0] + Math.sign(p[0] - l.a[0] || 1) * d, l.a[1] + Math.sign(p[1] - l.a[1] || 1) * d] });
      } else setLiveBoth({ ...l, b: p });
    } else if (tool === "eraser") {
      erase(p);
    } else if (tool === "select") {
      if (drag) setDrag({ ...drag, dx: p[0] - drag.from[0], dy: p[1] - drag.from[1] });
      else if (marquee) setMarquee({ ...marquee, b: p });
    }
  }

  function cancelTool() {
    setLiveBoth(null);
    setDrag(null);
    setMarquee(null);
    if (eraseStart.current) {
      setItems(eraseStart.current);
      eraseStart.current = null;
    }
  }

  function endTool(p: Pt, isTap: boolean) {
    const l = liveRef.current;
    setLiveBoth(null);
    if (l?.t === "stroke") {
      const it: MarkItem = marker ? { t: "stroke", pts: l.pts, c: color, w: width, hl: true } : { t: "stroke", pts: l.pts, c: color, w: width };
      commit([...itemsRef.current, it]);
      return;
    }
    if (l?.t === "line") {
      if (Math.hypot(l.b[0] - l.a[0], l.b[1] - l.a[1]) > 3 / scale) commit([...itemsRef.current, { t: "line", a: l.a, b: l.b, c: color, w: width }]);
      return;
    }
    if (l?.t === "oval") {
      let { a, b } = l;
      // Тап — овал стандартного размера вокруг точки.
      if (isTap || (Math.abs(b[0] - a[0]) < 4 * u && Math.abs(b[1] - a[1]) < 4 * u)) {
        a = [p[0] - 14 * u, p[1] - 7 * u];
        b = [p[0] + 14 * u, p[1] + 7 * u];
      }
      commit([...itemsRef.current, { t: "oval", a, b, c: color, w: width }]);
      return;
    }
    if (tool === "eraser") {
      if (eraseStart.current && eraseStart.current !== itemsRef.current) {
        past.current.push(eraseStart.current);
        future.current = [];
      }
      eraseStart.current = null;
      return;
    }
    if (tool === "stamp" && isTap) {
      commit([...itemsRef.current, { t: "stamp", k: stamp, p }]);
      return;
    }
    if (tool === "text" && isTap) {
      const hit = itemAt(p);
      const it = hit >= 0 ? itemsRef.current[hit] : null;
      if (it?.t === "text") setTextEdit({ p: it.p, value: it.s, index: hit });
      else setTextEdit({ p, value: "", index: null });
      return;
    }
    if (tool === "select") {
      if (drag) {
        if (Math.hypot(drag.dx, drag.dy) > 1 / scale) {
          const sel = new Set(selectedRef.current);
          commit(itemsRef.current.map((it, i) => (sel.has(i) ? translateItem(it, drag.dx, drag.dy) : it)));
        }
        setDrag(null);
      } else if (marquee) {
        const box = {
          x0: Math.min(marquee.a[0], marquee.b[0]),
          y0: Math.min(marquee.a[1], marquee.b[1]),
          x1: Math.max(marquee.a[0], marquee.b[0]),
          y1: Math.max(marquee.a[1], marquee.b[1]),
        };
        setSelected(
          itemsRef.current
            .map((it, i) => (bboxIntersects(unionBBox([it], u)!, box) ? i : -1))
            .filter((i) => i >= 0)
        );
        setMarquee(null);
      }
    }
  }

  function finishText() {
    if (!textEdit) return;
    const s = textEdit.value.trim().slice(0, 80);
    const list = itemsRef.current;
    if (textEdit.index !== null) {
      const old = list[textEdit.index];
      if (old?.t === "text") {
        if (!s) commit(list.filter((_, i) => i !== textEdit.index));
        else if (s !== old.s) commit(list.map((it, i) => (i === textEdit.index ? { ...old, s } : it)));
      }
    } else if (s) {
      commit([...list, { t: "text", p: textEdit.p, s, c: color }]);
    }
    setTextEdit(null);
  }

  function deleteSelected() {
    const sel = new Set(selectedRef.current);
    if (!sel.size) return;
    commit(itemsRef.current.filter((_, i) => !sel.has(i)));
    setSelected([]);
  }

  // ---------------------------------------------------- жесты (как в черновике)
  const pointers = useRef(new Map<number, { x: number; y: number; type: string }>());
  const mode = useRef<"idle" | "draw" | "gesture" | "pan" | "ignore">("idle");
  const drawId = useRef<number | null>(null);
  const drawStart = useRef({ t: 0, x: 0, y: 0, moved: 0 });
  const gesture = useRef<{ d: number; cx: number; cy: number; view: View; t: number; moved: number } | null>(null);

  function dismissHint() {
    if (!hint) return;
    setHint(false);
    writeFlag("pm-review-hint", "1");
  }

  function beginGesture() {
    const [a, b] = [...pointers.current.values()];
    if (!a || !b) return;
    gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: viewRef.current, t: Date.now(), moved: 0 };
    mode.current = "gesture";
    drawId.current = null;
  }

  function beginPan(e: React.PointerEvent) {
    mode.current = "pan";
    gesture.current = { d: 1, cx: e.clientX, cy: e.clientY, view: viewRef.current, t: Date.now(), moved: 0 };
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!photo || textEdit) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (popover) setPopover(null);

    if (stylusOnly && e.pointerType === "touch") {
      if (pointers.current.size >= 2) beginGesture();
      else if (mode.current === "idle") beginPan(e);
      return;
    }
    if (pointers.current.size === 1 && mode.current === "idle") {
      // Средняя кнопка мыши или пробел + мышь — двигаем фото.
      if (e.pointerType === "mouse" && (e.button === 1 || spaceDown.current)) {
        beginPan(e);
        return;
      }
      mode.current = "draw";
      drawId.current = e.pointerId;
      drawStart.current = { t: Date.now(), x: e.clientX, y: e.clientY, moved: 0 };
      startTool(toPhoto(e.clientX, e.clientY), { shift: e.shiftKey });
      return;
    }
    if (pointers.current.size === 2 && e.pointerType === "touch") {
      // Второй палец сразу после первого — жест, а не штрих.
      const fresh = Date.now() - drawStart.current.t < 260 || drawStart.current.moved < 14;
      if (mode.current === "draw" && fresh) {
        cancelTool();
        beginGesture();
        return;
      }
      if (mode.current === "pan") {
        beginGesture();
        return;
      }
    }
    // Ладонь и лишние пальцы не рисуют.
    if (mode.current === "idle") mode.current = "ignore";
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;
    if (mode.current === "draw" && e.pointerId === drawId.current) {
      drawStart.current.moved = Math.max(drawStart.current.moved, Math.hypot(e.clientX - drawStart.current.x, e.clientY - drawStart.current.y));
      moveTool(toPhoto(e.clientX, e.clientY), e.shiftKey);
    } else if (mode.current === "gesture" && gesture.current) {
      const [a, b] = [...pointers.current.values()];
      if (!a || !b) return;
      const g = gesture.current;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      g.moved = Math.max(g.moved, Math.abs(d - g.d), Math.hypot(cx - g.cx, cy - g.cy));
      const z = Math.min(MAX_Z, Math.max(1, g.view.z * (d / g.d)));
      const r = viewportRef.current!.getBoundingClientRect();
      const s0 = base * g.view.z, s1 = base * z;
      const wx = (g.cx - r.left - g.view.x) / s0, wy = (g.cy - r.top - g.view.y) / s0;
      touched.current = true;
      if (g.moved > 12) dismissHint();
      setView(clampView({ z, x: cx - r.left - wx * s1, y: cy - r.top - wy * s1 }));
    } else if (mode.current === "pan" && gesture.current) {
      const g = gesture.current;
      g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.cx, e.clientY - g.cy));
      touched.current = true;
      setView(clampView({ ...g.view, x: g.view.x + e.clientX - g.cx, y: g.view.y + e.clientY - g.cy }));
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    if (mode.current === "draw" && e.pointerId === drawId.current) {
      const isTap = drawStart.current.moved < 8 && Date.now() - drawStart.current.t < 450;
      endTool(toPhoto(e.clientX, e.clientY), isTap);
      drawId.current = null;
    }
    if (mode.current === "gesture" && gesture.current && pointers.current.size === 2) {
      const g = gesture.current;
      // Короткий тап двумя пальцами — отменить.
      if (Date.now() - g.t < 280 && g.moved < 12 && past.current.length) {
        undo();
        setBoardToast("Отменено");
      }
    }
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      mode.current = "idle";
      gesture.current = null;
    } else if (mode.current === "gesture") {
      mode.current = "ignore";
    }
  }

  // ---------------------------------------------------- сохранить проверку
  const suggested = defaultDecisionForScore(score, maxPoints);
  const fullScore = score !== null && score >= maxPoints;
  const dirty = items.length > 0 || rot !== 0;

  function exportJpeg(): string | null {
    if (!photo) return null;
    const c = document.createElement("canvas");
    c.width = photo.w;
    c.height = photo.h;
    const ctx = c.getContext("2d")!;
    ctx.fillStyle = "#fff";
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(photo.source, 0, 0, photo.w, photo.h);
    for (const it of items) drawItem(ctx, it, u);
    // Подбираем качество, а если не хватает — размер: пометки должны влезть в лимит хранения.
    for (let s = 1; s >= 0.5; s -= 0.25) {
      let src = c;
      if (s < 1) {
        src = document.createElement("canvas");
        src.width = Math.round(c.width * s);
        src.height = Math.round(c.height * s);
        src.getContext("2d")!.drawImage(c, 0, 0, src.width, src.height);
      }
      for (const q of [0.85, 0.75, 0.62, 0.5]) {
        const url = src.toDataURL("image/jpeg", q);
        if (url.length <= MAX_IMAGE_DATA_URL) return url;
      }
    }
    return null;
  }

  async function decide(decision: Decision) {
    if (saving) return;
    if (decision === "needs_revision" && fullScore) return;
    setError(null);
    setSaving(decision);
    try {
      let markup: string | null = null;
      if (dirty && photo) {
        markup = exportJpeg();
        if (!markup) {
          setError("Фото с пометками не поместилось — уберите часть пометок или напишите комментарий текстом.");
          return;
        }
      }
      const res = await reviewAttemptAction(id, decision, feedback, markup, score);
      if ("error" in res) {
        setError(res.error ?? "Не получилось сохранить");
        return;
      }
      submitted.current = true;
      clearReviewDraft(id);
      const final = fullScore ? "approved" : decision;
      onDecided(`${final === "approved" ? "Одобрено" : "На доработку"}${score !== null ? ` · ${score}/${maxPoints}` : ""}`);
    } catch {
      setError("Нет связи с сервером — проверка сохранена на устройстве, попробуйте ещё раз.");
    } finally {
      setSaving(null);
    }
  }

  // ---------------------------------------------------- клавиатура
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA";
    const mod = e.ctrlKey || e.metaKey;
    if (mod && e.key === "Enter") {
      e.preventDefault();
      void decide(suggested ?? "approved");
      return;
    }
    if (e.key === "Escape") {
      if (typing) (el as HTMLElement).blur();
      else if (sheet) setSheet(false);
      else if (selectedRef.current.length) setSelected([]);
      else if (popover) setPopover(null);
      else onClose();
      return;
    }
    if (typing) return;
    if (e.altKey && (e.key === "ArrowLeft" || e.key === "ArrowRight")) {
      e.preventDefault();
      (e.key === "ArrowLeft" ? onPrev : onNext)?.();
      return;
    }
    if (mod && e.code === "KeyZ") {
      e.preventDefault();
      if (e.shiftKey) redo();
      else undo();
      return;
    }
    if (mod && e.code === "KeyY") {
      e.preventDefault();
      redo();
      return;
    }
    if (mod && ["Equal", "NumpadAdd", "Minus", "NumpadSubtract"].includes(e.code)) {
      e.preventDefault();
      const r = viewportRef.current!.getBoundingClientRect();
      zoomAt(viewRef.current.z * (e.code === "Equal" || e.code === "NumpadAdd" ? 1.25 : 0.8), r.left + r.width / 2, r.top + r.height / 2);
      return;
    }
    if (mod && (e.code === "Digit0" || e.code === "Numpad0")) {
      e.preventDefault();
      setView(clampView({ x: 0, y: 0, z: 1 }));
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current.length) {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (mod || e.altKey) return;
    if (e.code === "Space") {
      e.preventDefault();
      spaceDown.current = true;
      return;
    }
    // Баллы — цифрами.
    const digit = /^Digit(\d)$/.exec(e.code)?.[1] ?? /^Numpad(\d)$/.exec(e.code)?.[1];
    if (digit !== undefined && Number(digit) <= maxPoints) {
      const n = Number(digit);
      setScore((s) => (s === n ? null : n));
      return;
    }
    const tools: Record<string, Tool> = { KeyV: "select", KeyP: "pen", KeyO: "oval", KeyT: "text", KeyE: "eraser" };
    if (tools[e.code]) chooseTool(tools[e.code]);
    if (e.code === "KeyH") {
      chooseTool("pen");
      setMarker(true);
    }
    const stamps: Record<string, StampKind> = { KeyG: "ok", KeyX: "bad", KeyQ: "ask" };
    if (stamps[e.code]) {
      chooseTool("stamp");
      setStamp(stamps[e.code]);
    }
    if (e.code === "KeyR") rotate();
    if (e.code === "KeyF") {
      if (viewRef.current.z > 1.05) setView(clampView({ x: 0, y: 0, z: 1 }));
      else fitWidth();
    }
  };
  useEffect(() => {
    const down = (e: KeyboardEvent) => keyRef.current(e);
    const up = (e: KeyboardEvent) => {
      if (e.code === "Space") spaceDown.current = false;
    };
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  // ---------------------------------------------------- разметка экрана
  const shown = drag
    ? items.map((it, i) => (selected.includes(i) ? translateItem(it, drag.dx, drag.dy) : it))
    : items;
  const itemsSvgHtml = useMemo(() => shown.map((it) => itemSvg(it, u)).join(""), [shown, u]);
  const liveSvg = (() => {
    if (!live) return "";
    if (live.t === "stroke")
      return itemSvg(marker ? { t: "stroke", pts: live.pts, c: color, w: width, hl: true } : { t: "stroke", pts: live.pts, c: color, w: width }, u);
    if (live.t === "line") return itemSvg({ t: "line", a: live.a, b: live.b, c: color, w: width }, u);
    return itemSvg({ t: "oval", a: live.a, b: live.b, c: color, w: width }, u);
  })();
  const selBox = tool === "select" ? unionBBox(selected.map((i) => shown[i]).filter(Boolean), u) : null;
  const pad = 6 / scale;
  const overlaySvg =
    (selBox
      ? `<rect x="${selBox.x0 - pad}" y="${selBox.y0 - pad}" width="${selBox.x1 - selBox.x0 + pad * 2}" height="${selBox.y1 - selBox.y0 + pad * 2}" rx="${6 / scale}" fill="#16B3A6" fill-opacity="0.07" stroke="#16B3A6" stroke-width="${2 / scale}" stroke-dasharray="${6 / scale} ${4 / scale}"/>`
      : "") +
    (marquee
      ? `<rect x="${Math.min(marquee.a[0], marquee.b[0])}" y="${Math.min(marquee.a[1], marquee.b[1])}" width="${Math.abs(marquee.b[0] - marquee.a[0])}" height="${Math.abs(marquee.b[1] - marquee.a[1])}" fill="#2F6FDB" fill-opacity="0.07" stroke="#2F6FDB" stroke-width="${1.5 / scale}" stroke-dasharray="${5 / scale} ${4 / scale}"/>`
      : "");

  const n = review.problem.egeTaskNumber;
  const meta = [review.fromMock ? "Пробник" : null, n ? `№${n}` : null, review.skillTitle].filter(Boolean).join(" · ");
  const iconBtn = "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-ink-soft transition hover:bg-paper disabled:opacity-30";
  const toolBtn = (active: boolean) =>
    `flex h-12 w-[44px] shrink-0 items-center justify-center rounded-[14px] transition min-[400px]:w-12 ${
      active ? "bg-pine text-white" : "bg-[#F0F6F2] text-ink-soft hover:bg-pine-light"
    }`;
  const toolHint =
    tool === "stamp"
      ? "Нажми там, где поставить значок"
      : tool === "oval"
        ? "Обведи ошибку — или просто нажми по ней"
        : tool === "text"
          ? "Нажми, где подписать; по подписи — изменить"
          : tool === "eraser"
            ? "Проведи по пометке, чтобы стереть"
            : tool === "select" && !selected.length
              ? "Нажми пометку или обведи рамкой — потом тяни"
              : null;

  const panelProps = {
    review,
    maxPoints,
    criteria,
    score,
    setScore,
    feedback,
    setFeedback,
  };

  return (
    <>
      {/* шапка */}
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line-soft px-2">
        <button type="button" onClick={onClose} aria-label="Закрыть проверку (пометки сохранятся)" title={desktop ? "Закрыть (Esc) — пометки сохранятся" : undefined} className={iconBtn}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-[16px] font-black leading-tight">{review.student.name}</p>
          <p className="truncate text-[11px] font-bold text-ink-soft">
            {review.note ? <span className={review.note.late ? "text-coral" : ""}>{review.note.text} · </span> : null}
            {meta}
          </p>
        </div>
        {total > 1 && (
          <div className="flex shrink-0 items-center">
            <button type="button" onClick={onPrev} disabled={!onPrev} aria-label="Предыдущая работа" title={desktop ? "Предыдущая (Alt+←)" : undefined} className="flex h-10 w-8 items-center justify-center rounded-xl text-ink-soft disabled:opacity-25">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
            </button>
            <span className="min-w-9 text-center text-[13px] font-black tabular-nums text-ink">
              {pos + 1}/{total}
            </span>
            <button type="button" onClick={onNext} disabled={!onNext} aria-label="Следующая работа" title={desktop ? "Следующая (Alt+→)" : undefined} className="flex h-10 w-8 items-center justify-center rounded-xl text-ink-soft disabled:opacity-25">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
            </button>
          </div>
        )}
        {review.hasImage && (
          <>
            <button
              type="button"
              onClick={undo}
              disabled={!past.current.length}
              aria-label="Отменить"
              title={desktop ? "Отменить (Ctrl+Z)" : undefined}
              className="ml-1 flex h-10 shrink-0 items-center gap-1.5 rounded-pill border-2 border-line bg-white px-2.5 text-[13px] font-extrabold text-ink transition hover:border-pine disabled:opacity-35 sm:pr-3.5"
            >
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
              <span className="hidden sm:inline">Отменить</span>
            </button>
            <button type="button" onClick={redo} disabled={!future.current.length} aria-label="Вернуть" title={desktop ? "Вернуть (Ctrl+Shift+Z)" : undefined} className={iconBtn}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
            </button>
          </>
        )}
      </header>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col">
          {/* фото */}
          <div
            ref={viewportRef}
            className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-[#E9EFEB]"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
            onPointerCancel={onPointerUp}
            style={{ cursor: !photo ? "default" : tool === "eraser" ? "cell" : tool === "select" ? "default" : tool === "text" ? "text" : "crosshair" }}
          >
            {!review.hasImage ? (
              <div className="absolute inset-0 overflow-y-auto p-4">
                <div className="mx-auto max-w-2xl rounded-[18px] border border-line-soft bg-white p-5 shadow-sm">
                  <p className="mb-2 text-[12px] font-black text-ink-soft">Решение ученика — текстом</p>
                  <p className="whitespace-pre-wrap text-[17px] leading-relaxed text-ink">{review.answer.trim() || "Ученик не приложил решение."}</p>
                </div>
              </div>
            ) : photoError ? (
              <p className="absolute inset-x-0 top-1/2 text-center text-sm font-bold text-ink-soft">Не удалось загрузить фото. Проверьте связь и откройте работу ещё раз.</p>
            ) : !photo ? (
              <p className="absolute inset-x-0 top-1/2 text-center text-sm font-bold text-ink-soft">Загружаем фото…</p>
            ) : (
              <div
                className="absolute left-0 top-0 origin-top-left bg-white shadow-[0_2px_16px_rgba(19,42,32,0.18)]"
                style={{ width: W, height: H, transform: `translate(${view.x}px, ${view.y}px) scale(${scale})` }}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={photo.url} alt="Решение ученика" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full" />
                <svg
                  className="pointer-events-none absolute left-0 top-0"
                  width={W}
                  height={H}
                  viewBox={`0 0 ${W} ${H}`}
                  dangerouslySetInnerHTML={{ __html: itemsSvgHtml + liveSvg + overlaySvg }}
                />
              </div>
            )}

            {textEdit && photo && (
              <input
                autoFocus
                value={textEdit.value}
                maxLength={80}
                onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.stopPropagation();
                    finishText();
                  }
                  if (e.key === "Escape") {
                    e.stopPropagation();
                    setTextEdit(null);
                  }
                }}
                onBlur={finishText}
                onPointerDown={(e) => e.stopPropagation()}
                aria-label="Текст пометки"
                placeholder="Подпись"
                className="absolute rounded-lg border-2 border-[#16B3A6] bg-white px-2 font-display font-extrabold outline-none"
                style={{
                  left: Math.max(8, Math.min(vp.w - 228, view.x + textEdit.p[0] * scale - 8)),
                  top: view.y + textEdit.p[1] * scale - 20,
                  width: 220,
                  height: 40,
                  fontSize: 17,
                  color,
                }}
              />
            )}

            {photo && (
              <button
                type="button"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={() => {
                  touched.current = true;
                  if (view.z > 1.05) setView(clampView({ x: 0, y: 0, z: 1 }));
                  else fitWidth();
                }}
                aria-label={view.z > 1.05 ? "Показать фото целиком" : "Фото по ширине"}
                title={desktop ? "Целиком / по ширине (F)" : undefined}
                className="absolute right-3 top-3 flex h-8 items-center gap-1.5 rounded-pill bg-ink/80 px-3 text-[12px] font-extrabold text-white"
              >
                {Math.round(view.z * 100)}%{view.z > 1.05 ? " · целиком" : ""}
              </button>
            )}

            {tool === "select" && selected.length > 0 && (
              <div
                role="toolbar"
                aria-label="Выделенное"
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute left-3 top-3 flex items-center gap-1 rounded-[16px] border border-line-soft bg-white p-1 shadow-[0_8px_24px_rgba(19,42,32,0.14)]"
              >
                <span className="px-2 text-[12px] font-extrabold text-ink-soft">Выделено: {selected.length}</span>
                <button type="button" onClick={deleteSelected} title={desktop ? "Удалить (Delete)" : undefined} className="h-9 rounded-[12px] px-3 text-[13px] font-extrabold text-coral hover:bg-coral-light">
                  Удалить
                </button>
                <button type="button" onClick={() => setSelected([])} aria-label="Снять выделение" className="flex h-9 w-9 items-center justify-center rounded-[12px] text-ink-soft hover:bg-paper">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
                </button>
              </div>
            )}

            {tool === "stamp" && photo && (
              <div
                role="radiogroup"
                aria-label="Значок"
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute left-3 top-3 flex gap-1 rounded-[16px] border border-line-soft bg-white p-1 shadow-[0_8px_24px_rgba(19,42,32,0.14)]"
              >
                {STAMPS.map((s) => (
                  <button
                    key={s.k}
                    type="button"
                    role="radio"
                    aria-checked={stamp === s.k}
                    aria-label={s.label}
                    title={desktop ? `${s.label} (${s.key})` : s.label}
                    onClick={() => setStamp(s.k)}
                    className={`flex h-10 w-12 items-center justify-center rounded-[12px] ${stamp === s.k ? "bg-pine-light ring-2 ring-pine" : ""}`}
                  >
                    <StampGlyph k={s.k} />
                  </button>
                ))}
              </div>
            )}

            {(boardToast || (photo && toolHint)) && (
              <div role="status" className="pointer-events-none absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-[14px] bg-[#0E8C82] px-3.5 py-2 text-center text-[12px] font-extrabold text-white shadow-lg">
                {boardToast ?? toolHint}
              </div>
            )}
            {hint && photo && !boardToast && !toolHint && (
              <div className="pointer-events-none absolute bottom-3 left-1/2 max-w-[92%] -translate-x-1/2 rounded-pill border border-line-soft bg-white/95 px-3.5 py-2 text-center text-[12px] font-bold text-ink-soft">
                {desktop
                  ? "Мышь — пометки · Ctrl + колесо — масштаб · пробел + мышь — двигать"
                  : stylusOnly
                    ? "Стилус — пометки, палец — двигает фото"
                    : "Один палец — пометки, два — двигать и приближать"}
              </div>
            )}

            {popover === "pen" && (
              <div
                role="dialog"
                aria-label="Цвет и толщина"
                onPointerDown={(e) => e.stopPropagation()}
                className="absolute bottom-3 right-3 flex w-[284px] flex-col gap-3 rounded-[20px] border border-line-soft bg-white p-3.5 shadow-[0_12px_32px_rgba(19,42,32,0.16)]"
              >
                <p className="text-[12px] font-black text-ink-soft">Цвет</p>
                <div className="flex gap-2.5">
                  {COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      aria-label={c.label}
                      aria-pressed={!marker && color === c.hex}
                      onClick={() => {
                        setColor(c.hex);
                        setMarker(false);
                        if (tool === "eraser" || tool === "select") setTool("pen");
                      }}
                      className="h-10 w-10 rounded-full"
                      style={{ background: c.hex, boxShadow: !marker && color === c.hex ? `0 0 0 3px #fff, 0 0 0 5px ${c.hex}` : undefined }}
                    />
                  ))}
                  <button
                    type="button"
                    aria-label="Маркер — выделить строку"
                    title={desktop ? "Маркер (H)" : undefined}
                    aria-pressed={marker}
                    onClick={() => {
                      setMarker(true);
                      setTool("pen");
                    }}
                    className={`flex h-10 w-10 items-center justify-center rounded-[12px] border bg-[#FFF6CC] ${marker ? "border-2 border-pine" : "border-line-soft"}`}
                  >
                    <MarkerIcon />
                  </button>
                </div>
                <p className="text-[12px] font-black text-ink-soft">Толщина</p>
                <div className="grid grid-cols-3 gap-2">
                  {MARK_WIDTHS.map((w, i) => (
                    <button
                      key={w}
                      type="button"
                      aria-label={WIDTH_LABELS[i]}
                      aria-pressed={width === w}
                      onClick={() => setWidth(w)}
                      className={`flex h-11 items-center justify-center rounded-[12px] border ${width === w ? "border-2 border-pine bg-pine-light/60" : "border-line-soft"}`}
                    >
                      <span className="w-9 rounded-full bg-ink" style={{ height: 2 + i * 2 }} />
                    </button>
                  ))}
                </div>
                <label className="flex items-center gap-2.5 text-[13px] font-bold text-ink-soft">
                  <input
                    type="checkbox"
                    checked={stylusOnly}
                    onChange={(e) => {
                      setStylusOnly(e.target.checked);
                      writeFlag("pm-sketch-stylus", e.target.checked ? "1" : "0");
                    }}
                    className="h-5 w-5 accent-pine"
                  />
                  Пишу стилусом — пальцем не рисовать
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      rotate();
                      setPopover(null);
                    }}
                    title={desktop ? "Повернуть (R)" : undefined}
                    className="h-11 rounded-[12px] border border-line-soft text-[13px] font-extrabold text-ink"
                  >
                    Повернуть фото
                  </button>
                  <button
                    type="button"
                    disabled={!items.length}
                    onClick={() => {
                      if (!confirmClear) {
                        setConfirmClear(true);
                        setTimeout(() => setConfirmClear(false), 3000);
                        return;
                      }
                      commit([]);
                      setConfirmClear(false);
                      setPopover(null);
                    }}
                    className="h-11 rounded-[12px] border border-coral/30 text-[13px] font-extrabold text-coral disabled:opacity-40"
                  >
                    {confirmClear ? "Точно?" : "Стереть всё"}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* инструменты */}
          {review.hasImage && (
            <nav aria-label="Инструменты" className="flex shrink-0 items-center gap-1 border-t border-line-soft px-3 pt-2.5 min-[400px]:gap-1.5 lg:pb-3" >
              <button type="button" aria-label="Выбор: двигать и удалять" title={desktop ? "Выбор (V)" : undefined} aria-pressed={tool === "select"} onClick={() => chooseTool("select")} className={toolBtn(tool === "select")}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 3l14 7-6 2-2 6z" /></svg>
              </button>
              <button type="button" aria-label={marker ? "Маркер" : "Ручка"} title={desktop ? "Ручка (P), с Shift — прямая; маркер (H)" : undefined} aria-pressed={tool === "pen"} onClick={() => chooseTool("pen")} className={toolBtn(tool === "pen")}>
                {marker && tool === "pen" ? (
                  <MarkerIcon />
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
                )}
              </button>
              <button type="button" aria-label="Обвести ошибку" title={desktop ? "Обвести (O), с Shift — круг" : undefined} aria-pressed={tool === "oval"} onClick={() => chooseTool("oval")} className={toolBtn(tool === "oval")}>
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" aria-hidden><ellipse cx="12" cy="12" rx="9.5" ry="6" /></svg>
              </button>
              <button type="button" aria-label="Значки ✓ ✗ ?" title={desktop ? "Значки: ✓ (G), ✗ (X), ? (Q)" : undefined} aria-pressed={tool === "stamp"} onClick={() => chooseTool("stamp")} className={toolBtn(tool === "stamp")}>
                <StampGlyph k={stamp} inverted={tool === "stamp"} />
              </button>
              <button type="button" aria-label="Подпись" title={desktop ? "Подпись (T)" : undefined} aria-pressed={tool === "text"} onClick={() => chooseTool("text")} className={`${toolBtn(tool === "text")} font-display text-[18px] font-black`}>
                Aa
              </button>
              <button type="button" aria-label="Ластик" title={desktop ? "Ластик (E)" : undefined} aria-pressed={tool === "eraser"} onClick={() => chooseTool("eraser")} className={toolBtn(tool === "eraser")}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21z" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>
              </button>
              <div className="flex-1" />
              <button
                type="button"
                aria-label="Цвет, толщина, поворот"
                aria-expanded={popover === "pen"}
                onClick={() => setPopover(popover === "pen" ? null : "pen")}
                className={`flex h-12 w-11 shrink-0 items-center justify-center rounded-[14px] border-2 min-[400px]:w-12 ${popover === "pen" ? "border-pine bg-pine-light/60" : "border-line bg-white"}`}
              >
                <span className="h-6 w-6 rounded-full" style={{ background: marker ? "#FFD24A" : color }} />
              </button>
            </nav>
          )}

          {/* решение — телефон и планшет */}
          <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5 lg:hidden" style={{ paddingBottom: "max(12px, var(--app-sab))" }}>
            <button
              type="button"
              onClick={() => setSheet(true)}
              aria-label="Задание, критерии и комментарий"
              className={`flex h-12 shrink-0 flex-col items-start justify-center rounded-[14px] border-2 px-3 text-left ${score !== null ? "border-ink bg-ink text-white" : "border-line bg-white text-ink"}`}
            >
              <span className="text-[15px] font-black leading-none">{score !== null ? `${score} из ${maxPoints}` : "Баллы"}</span>
              <span className={`mt-0.5 text-[10px] font-bold leading-none ${score !== null ? "text-white/70" : "text-ink-soft"}`}>
                {feedback.trim() ? "есть комментарий" : "критерии ▴"}
              </span>
            </button>
            <DecisionButtons decide={decide} saving={saving} suggested={suggested} fullScore={fullScore} score={score} maxPoints={maxPoints} compact />
          </div>
          {error && (
            <p role="alert" className="bg-coral-light px-4 py-2 text-center text-[13px] font-bold text-coral-text lg:hidden">
              {error}
            </p>
          )}
        </div>

        {/* задание, критерии, комментарий — компьютер */}
        <aside className="hidden w-[400px] shrink-0 flex-col border-l border-line-soft bg-white lg:flex xl:w-[440px]" aria-label="Оценка">
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <Panel {...panelProps} desktop />
          </div>
          <div className="border-t border-line-soft p-4">
            {error && <p role="alert" className="mb-2 text-[13px] font-bold text-coral-text">{error}</p>}
            <div className="flex gap-2">
              <DecisionButtons decide={decide} saving={saving} suggested={suggested} fullScore={fullScore} score={score} maxPoints={maxPoints} />
            </div>
            <p className="mt-2 text-center text-[11px] font-bold text-ink-soft">
              0–{maxPoints} — баллы · Ctrl+Enter — {suggested === "needs_revision" ? "на доработку" : "одобрить"}
              {dirty ? " · ученик увидит фото с пометками" : ""}
            </p>
          </div>
        </aside>
      </div>

      {/* лист с заданием и критериями — телефон */}
      {sheet && (
        <div className="fixed inset-0 z-[70] flex flex-col justify-end bg-ink/40 lg:hidden" onClick={() => setSheet(false)}>
          <div
            role="dialog"
            aria-label="Задание и оценка"
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88%] flex-col rounded-t-[26px] bg-white"
          >
            <div className="flex items-center justify-between px-4 pb-1 pt-3">
              <span className="font-display text-[17px] font-black">Оценка</span>
              <button type="button" onClick={() => setSheet(false)} className="h-10 rounded-xl px-3 text-[14px] font-extrabold text-pine-dark">
                К фото
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-3">
              <Panel {...panelProps} desktop={false} />
            </div>
            <div className="flex gap-2 border-t border-line-soft px-4 pt-3" style={{ paddingBottom: "max(14px, var(--app-sab))" }}>
              <DecisionButtons decide={decide} saving={saving} suggested={suggested} fullScore={fullScore} score={score} maxPoints={maxPoints} />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ======================================================================
// Панель оценки

function Panel({
  review,
  maxPoints,
  criteria,
  score,
  setScore,
  feedback,
  setFeedback,
  desktop,
}: {
  review: ReviewItem;
  maxPoints: number;
  criteria: { points: number; text: string }[] | null;
  score: number | null;
  setScore: (s: number | null) => void;
  feedback: string;
  setFeedback: (f: string) => void;
  desktop: boolean;
}) {
  const [condOpen, setCondOpen] = useState(desktop);
  const [solutionOpen, setSolutionOpen] = useState(false);
  const n = review.problem.egeTaskNumber;

  function addPhrase(p: string) {
    const cur = feedback.trim();
    setFeedback(cur ? `${cur}${/[.!?]$/.test(cur) ? "" : "."} ${p}` : p);
  }

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-bold text-ink-soft">
        <span>Отправлено {submittedLabel(review.submittedAt)}</span>
        {review.studentHref && (
          <a href={review.studentHref} className="text-pine-dark hover:underline">
            Карточка ученика
          </a>
        )}
      </div>

      <section>
        <button type="button" onClick={() => setCondOpen((o) => !o)} aria-expanded={condOpen} className="flex w-full items-start gap-2 text-left">
          {n && <span className="mt-0.5 shrink-0 rounded-pill bg-amber-light px-2 py-0.5 text-[11px] font-black text-amber-text">№{n}</span>}
          <span className={`min-w-0 flex-1 font-semibold text-ink ${condOpen ? "whitespace-pre-wrap" : "line-clamp-2"}`}>{review.problem.text}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`mt-0.5 shrink-0 text-ink-soft transition ${condOpen ? "rotate-180" : ""}`} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {condOpen && review.problem.diagram && (
          <div className="mx-auto mt-2 max-w-[300px]">
            <DiagramRenderer spec={review.problem.diagram} />
          </div>
        )}
      </section>

      {review.hasImage && review.answer.trim() && (
        <section className="rounded-[14px] border border-line bg-paper p-3">
          <p className="mb-1 text-[12px] font-black text-ink-soft">Ученик написал</p>
          <p className="whitespace-pre-wrap text-ink">{review.answer}</p>
        </section>
      )}

      <section>
        <button
          type="button"
          onClick={() => setSolutionOpen((o) => !o)}
          aria-expanded={solutionOpen}
          className="flex h-10 w-full items-center justify-between rounded-[12px] border border-line-soft px-3 text-[13px] font-extrabold text-pine-dark"
        >
          {solutionOpen ? "Скрыть эталон" : "Эталонное решение"}
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" className={`transition ${solutionOpen ? "rotate-180" : ""}`} aria-hidden><path d="m6 9 6 6 6-6" /></svg>
        </button>
        {solutionOpen && <p className="mt-2 whitespace-pre-wrap rounded-[12px] bg-pine-light/50 p-3 text-ink">{review.problem.solution}</p>}
      </section>

      <section>
        <p className="mb-2 text-[12px] font-black text-ink-soft">
          Баллы по критериям ФИПИ{n ? ` · №${n}` : ""} · максимум {maxPoints}
        </p>
        {criteria ? (
          <div className="space-y-1.5" role="radiogroup" aria-label="Баллы">
            {criteria.map((c) => {
              const on = score === c.points;
              return (
                <button
                  key={c.points}
                  type="button"
                  role="radio"
                  aria-checked={on}
                  onClick={() => setScore(on ? null : c.points)}
                  className={`flex w-full gap-3 rounded-[14px] border-2 p-2.5 text-left transition ${
                    on ? (c.points === maxPoints ? "border-pine-strong bg-pine-light/60" : "border-ink bg-paper") : "border-line-soft bg-white hover:border-ink-soft"
                  }`}
                >
                  <span
                    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] font-display text-[17px] font-black ${
                      on ? (c.points === maxPoints ? "bg-pine-strong text-white" : "bg-ink text-white") : "bg-paper text-ink"
                    }`}
                  >
                    {c.points}
                  </span>
                  <span className="text-[13px] leading-snug text-ink">{c.text}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Баллы">
            {Array.from({ length: maxPoints + 1 }, (_, i) => (
              <button
                key={i}
                type="button"
                role="radio"
                aria-checked={score === i}
                onClick={() => setScore(score === i ? null : i)}
                className={`h-11 min-w-11 rounded-[12px] border-2 px-3 font-display text-[16px] font-black transition ${
                  score === i ? (i === maxPoints ? "border-pine-strong bg-pine-strong text-white" : "border-ink bg-ink text-white") : "border-line-soft bg-white text-ink hover:border-ink-soft"
                }`}
              >
                {i}
              </button>
            ))}
          </div>
        )}
        <p className="mt-1.5 text-[12px] text-ink-soft">
          {score === null
            ? "Баллы необязательны — можно просто одобрить или вернуть на доработку."
            : score >= maxPoints
              ? `${scoreLabel(score, maxPoints)} — решение засчитается`
              : `${scoreLabel(score, maxPoints)} — можно вернуть на доработку или одобрить`}
        </p>
      </section>

      <section>
        <label htmlFor="review-feedback" className="mb-1.5 block text-[12px] font-black text-ink-soft">
          Комментарий ученику
        </label>
        <textarea
          id="review-feedback"
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          maxLength={2000}
          rows={3}
          placeholder="Что исправить или что получилось хорошо"
          className="input min-h-[84px] resize-y text-sm"
        />
        <div className="mt-2 flex flex-wrap gap-1.5">
          {QUICK_PHRASES.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => addPhrase(p)}
              className="rounded-pill border border-line-soft bg-white px-2.5 py-1.5 text-[12px] font-bold text-ink-soft transition hover:border-pine hover:text-pine-dark"
            >
              + {p}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}

function DecisionButtons({
  decide,
  saving,
  suggested,
  fullScore,
  score,
  maxPoints,
  compact,
}: {
  decide: (d: Decision) => void;
  saving: Decision | null;
  suggested: Decision | null;
  fullScore: boolean;
  score: number | null;
  maxPoints: number;
  compact?: boolean;
}) {
  const revisePrimary = suggested === "needs_revision";
  const h = "h-12 min-w-0 flex-1 rounded-[14px] px-2 text-[15px] font-black transition disabled:opacity-40";
  return (
    <>
      <button
        type="button"
        onClick={() => decide("needs_revision")}
        disabled={!!saving || fullScore}
        title={fullScore ? "Полный балл — решение засчитывается" : undefined}
        className={`${h} ${revisePrimary ? "bg-coral-text text-white shadow-[0_3px_0_#A3262B]" : "border-2 border-line bg-white text-ink hover:border-coral hover:text-coral"}`}
      >
        {saving === "needs_revision" ? "…" : compact ? "Доработать" : "На доработку"}
      </button>
      <button
        type="button"
        onClick={() => decide("approved")}
        disabled={!!saving}
        className={`${h} ${revisePrimary ? "border-2 border-line bg-white text-ink hover:border-pine" : "bg-pine-strong text-white shadow-[0_3px_0_#13804F]"}`}
      >
        {saving === "approved" ? "…" : score !== null && !compact ? `Одобрить · ${score}/${maxPoints}` : "Одобрить"}
      </button>
    </>
  );
}

function StampGlyph({ k, inverted }: { k: StampKind; inverted?: boolean }) {
  const color = inverted ? "#fff" : k === "ok" ? MARK_GREEN : k === "bad" ? MARK_RED : "#E39A1E";
  if (k === "ask")
    return (
      <span className="font-display text-[20px] font-black" style={{ color }}>
        ?
      </span>
    );
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {k === "ok" ? <path d="M4 12.5 9.5 18 20 6" /> : <path d="M6 6l12 12M18 6 6 18" />}
    </svg>
  );
}

function MarkerIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A6A00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="m9 11-6 6v3h9l3-3" />
      <path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" />
    </svg>
  );
}
