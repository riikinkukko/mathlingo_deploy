// Пометки репетитора на фото решения: модель, отрисовка (SVG на экране и
// canvas для итогового JPEG), попадание, рамки, сдвиг, поворот, черновик.
//
// Координаты — пиксели фото (после поворота). Толщины и размеры задаются в
// «единицах» u = max(ширина, высота) / 260, поэтому пометка выглядит
// одинаково и на снимке 900 px, и на 3000 px.

import { strokePath } from "./sketch";

export type Pt = [number, number];
export type StampKind = "ok" | "bad" | "ask";

export type MarkItem =
  | { t: "stroke"; pts: number[]; c: string; w: number; hl?: boolean }
  | { t: "line"; a: Pt; b: Pt; c: string; w: number }
  | { t: "oval"; a: Pt; b: Pt; c: string; w: number }
  | { t: "stamp"; k: StampKind; p: Pt }
  | { t: "text"; p: Pt; s: string; c: string };

export const MARK_RED = "#E2474C";
export const MARK_GREEN = "#13A35E";
export const MARK_BLUE = "#2F6FDB";
export const MARK_INK = "#132A20";
export const MARK_AMBER = "#E39A1E";
export const MARK_HIGHLIGHT = "#FFD24A";

/** Толщины ручки в единицах фото. */
export const MARK_WIDTHS = [0.8, 1.2, 2] as const;
export const HIGHLIGHT_W = 5;
const STAMP_R = 5;
const TEXT_SIZE = 8.5;

export const unitFor = (w: number, h: number) => Math.max(w, h) / 260;

// ------------------------------------------------------------- геометрия

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1]);

function segDist(p: Pt, a: Pt, b: Pt): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy || 1;
  const t = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return dist(p, [a[0] + dx * t, a[1] + dy * t]);
}

/** Ширина подписи (приближённо: Nunito 800 ≈ 0.58 em на символ). */
export function textWidth(s: string, u: number): number {
  return s.length * TEXT_SIZE * u * 0.58;
}

export type BBox = { x0: number; y0: number; x1: number; y1: number };

export function itemBBox(it: MarkItem, u: number): BBox {
  switch (it.t) {
    case "stroke": {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i + 1 < it.pts.length; i += 2) {
        x0 = Math.min(x0, it.pts[i]); x1 = Math.max(x1, it.pts[i]);
        y0 = Math.min(y0, it.pts[i + 1]); y1 = Math.max(y1, it.pts[i + 1]);
      }
      const h = ((it.hl ? HIGHLIGHT_W : it.w) * u) / 2;
      return { x0: x0 - h, y0: y0 - h, x1: x1 + h, y1: y1 + h };
    }
    case "line":
    case "oval": {
      const h = (it.w * u) / 2;
      return {
        x0: Math.min(it.a[0], it.b[0]) - h,
        y0: Math.min(it.a[1], it.b[1]) - h,
        x1: Math.max(it.a[0], it.b[0]) + h,
        y1: Math.max(it.a[1], it.b[1]) + h,
      };
    }
    case "stamp": {
      const r = STAMP_R * u * 1.2;
      return { x0: it.p[0] - r, y0: it.p[1] - r, x1: it.p[0] + r, y1: it.p[1] + r };
    }
    case "text": {
      const s = TEXT_SIZE * u;
      return { x0: it.p[0] - s * 0.3, y0: it.p[1] - s * 0.7, x1: it.p[0] + textWidth(it.s, u) + s * 0.3, y1: it.p[1] + s * 0.7 };
    }
  }
}

export function unionBBox(list: MarkItem[], u: number): BBox | null {
  if (!list.length) return null;
  return list.map((it) => itemBBox(it, u)).reduce((a, b) => ({
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }));
}

export const bboxIntersects = (a: BBox, b: BBox) => a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;

/** Попадает ли точка в пометку (r — допуск в пикселях фото). */
export function hitItem(it: MarkItem, p: Pt, r: number, u: number): boolean {
  switch (it.t) {
    case "stroke": {
      const half = ((it.hl ? HIGHLIGHT_W : it.w) * u) / 2;
      if (it.pts.length === 2) return dist(p, [it.pts[0], it.pts[1]]) < r + half;
      for (let i = 0; i + 3 < it.pts.length; i += 2) {
        if (segDist(p, [it.pts[i], it.pts[i + 1]], [it.pts[i + 2], it.pts[i + 3]]) < r + half) return true;
      }
      return false;
    }
    case "line":
      return segDist(p, it.a, it.b) < r + (it.w * u) / 2;
    case "oval": {
      // Расстояние до эллипса считаем по нормированному радиусу.
      const cx = (it.a[0] + it.b[0]) / 2, cy = (it.a[1] + it.b[1]) / 2;
      const rx = Math.abs(it.b[0] - it.a[0]) / 2 || 1, ry = Math.abs(it.b[1] - it.a[1]) / 2 || 1;
      const k = Math.hypot((p[0] - cx) / rx, (p[1] - cy) / ry);
      return Math.abs(k - 1) * Math.min(rx, ry) < r + (it.w * u) / 2;
    }
    case "stamp":
    case "text": {
      const b = itemBBox(it, u);
      return p[0] > b.x0 - r && p[0] < b.x1 + r && p[1] > b.y0 - r && p[1] < b.y1 + r;
    }
  }
}

export function translateItem(it: MarkItem, dx: number, dy: number): MarkItem {
  const m = (q: Pt): Pt => [q[0] + dx, q[1] + dy];
  switch (it.t) {
    case "stroke":
      return { ...it, pts: it.pts.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
    case "line":
    case "oval":
      return { ...it, a: m(it.a), b: m(it.b) };
    default:
      return { ...it, p: m(it.p) };
  }
}

/**
 * Поворот пометки вместе с фото на 90° по часовой стрелке.
 * h — высота фото ДО поворота: точка (x; y) переходит в (h − y; x).
 */
export function rotateItemCW(it: MarkItem, h: number): MarkItem {
  const m = (q: Pt): Pt => [h - q[1], q[0]];
  switch (it.t) {
    case "stroke": {
      const pts: number[] = [];
      for (let i = 0; i + 1 < it.pts.length; i += 2) pts.push(h - it.pts[i + 1], it.pts[i]);
      return { ...it, pts };
    }
    case "line":
    case "oval":
      return { ...it, a: m(it.a), b: m(it.b) };
    case "text":
      // Подпись остаётся горизонтальной — сдвигаем только точку привязки.
      return { ...it, p: m(it.p) };
    default:
      return { ...it, p: m(it.p) };
  }
}

// ------------------------------------------------------------- отрисовка

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function stampPaths(k: StampKind, p: Pt, u: number): { d: string; color: string } {
  const [x, y] = p;
  const r = STAMP_R * u;
  if (k === "ok") return { d: `M${x - r} ${y}L${x - r * 0.25} ${y + r * 0.75}L${x + r} ${y - r * 0.8}`, color: MARK_GREEN };
  if (k === "bad")
    return {
      d: `M${x - r * 0.8} ${y - r * 0.8}L${x + r * 0.8} ${y + r * 0.8}M${x + r * 0.8} ${y - r * 0.8}L${x - r * 0.8} ${y + r * 0.8}`,
      color: MARK_RED,
    };
  return { d: `M${x + r} ${y}A${r} ${r} 0 1 1 ${x - r} ${y}A${r} ${r} 0 1 1 ${x + r} ${y}`, color: MARK_AMBER };
}

function ovalPath(a: Pt, b: Pt): string {
  const cx = (a[0] + b[0]) / 2, cy = (a[1] + b[1]) / 2;
  const rx = Math.abs(b[0] - a[0]) / 2, ry = Math.abs(b[1] - a[1]) / 2;
  return `M${cx + rx} ${cy}A${rx} ${ry} 0 1 1 ${cx - rx} ${cy}A${rx} ${ry} 0 1 1 ${cx + rx} ${cy}`;
}

/** SVG-разметка пометки (экран). */
export function itemSvg(it: MarkItem, u: number): string {
  const cap = `stroke-linecap="round" stroke-linejoin="round" fill="none"`;
  switch (it.t) {
    case "stroke":
      return it.hl
        ? `<path d="${strokePath(it.pts)}" stroke="${MARK_HIGHLIGHT}" stroke-opacity="0.42" stroke-width="${HIGHLIGHT_W * u}" ${cap}/>`
        : `<path d="${strokePath(it.pts)}" stroke="${it.c}" stroke-width="${it.w * u}" ${cap}/>`;
    case "line":
      return `<path d="M${it.a[0]} ${it.a[1]}L${it.b[0]} ${it.b[1]}" stroke="${it.c}" stroke-width="${it.w * u}" ${cap}/>`;
    case "oval":
      return `<path d="${ovalPath(it.a, it.b)}" stroke="${it.c}" stroke-width="${it.w * u}" ${cap}/>`;
    case "stamp": {
      const { d, color } = stampPaths(it.k, it.p, u);
      const q =
        it.k === "ask"
          ? `<text x="${it.p[0]}" y="${it.p[1] + STAMP_R * u * 0.08}" fill="${color}" font-family="Nunito, system-ui, sans-serif" font-weight="900" font-size="${STAMP_R * u * 1.4}" text-anchor="middle" dominant-baseline="central">?</text>`
          : "";
      return `<path d="${d}" stroke="${color}" stroke-width="${u * 1.4}" ${cap}/>${q}`;
    }
    case "text": {
      const s = TEXT_SIZE * u;
      const w = textWidth(it.s, u);
      return (
        `<rect x="${it.p[0] - s * 0.3}" y="${it.p[1] - s * 0.7}" width="${w + s * 0.6}" height="${s * 1.4}" rx="${s * 0.25}" fill="#fff" fill-opacity="0.88"/>` +
        `<text x="${it.p[0]}" y="${it.p[1]}" fill="${it.c}" font-family="Nunito, system-ui, sans-serif" font-weight="800" font-size="${s}" dominant-baseline="central">${esc(it.s)}</text>`
      );
    }
  }
}

/** Та же пометка на canvas (итоговый JPEG, который увидит ученик). */
export function drawItem(ctx: CanvasRenderingContext2D, it: MarkItem, u: number) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.globalAlpha = 1;
  switch (it.t) {
    case "stroke":
      ctx.strokeStyle = it.hl ? MARK_HIGHLIGHT : it.c;
      ctx.globalAlpha = it.hl ? 0.42 : 1;
      ctx.lineWidth = (it.hl ? HIGHLIGHT_W : it.w) * u;
      ctx.stroke(new Path2D(strokePath(it.pts)));
      ctx.globalAlpha = 1;
      return;
    case "line":
    case "oval":
      ctx.strokeStyle = it.c;
      ctx.lineWidth = it.w * u;
      ctx.stroke(new Path2D(it.t === "line" ? `M${it.a[0]} ${it.a[1]}L${it.b[0]} ${it.b[1]}` : ovalPath(it.a, it.b)));
      return;
    case "stamp": {
      const { d, color } = stampPaths(it.k, it.p, u);
      ctx.strokeStyle = color;
      ctx.lineWidth = u * 1.4;
      ctx.stroke(new Path2D(d));
      if (it.k === "ask") {
        ctx.fillStyle = color;
        ctx.font = `900 ${STAMP_R * u * 1.4}px Nunito, system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("?", it.p[0], it.p[1] + STAMP_R * u * 0.08);
      }
      return;
    }
    case "text": {
      const s = TEXT_SIZE * u;
      ctx.font = `800 ${s}px Nunito, system-ui, sans-serif`;
      ctx.textAlign = "left";
      ctx.textBaseline = "middle";
      const w = Math.max(ctx.measureText(it.s).width, 1);
      ctx.fillStyle = "rgba(255,255,255,0.88)";
      ctx.fillRect(it.p[0] - s * 0.3, it.p[1] - s * 0.7, w + s * 0.6, s * 1.4);
      ctx.fillStyle = it.c;
      ctx.fillText(it.s, it.p[0], it.p[1]);
      return;
    }
  }
}

// ------------------------------------------------------ черновик проверки

/** Незаконченная проверка: пометки, поворот, баллы и комментарий — на устройстве репетитора. */
export type ReviewDraft = { v: 1; items: MarkItem[]; rot: number; score: number | null; feedback: string; ts: number };

const DRAFT_PREFIX = "pm-review:";
/** Событие окна: черновик проверки изменился (карточки в списке обновляют подпись). */
export const REVIEW_DRAFT_EVENT = "pm-review-draft";
function notify() {
  try {
    window.dispatchEvent(new Event(REVIEW_DRAFT_EVENT));
  } catch {
    /* вне браузера */
  }
}
const DRAFT_TTL = 21 * 86_400_000;

export function loadReviewDraft(attemptId: string): ReviewDraft | null {
  try {
    const raw = localStorage.getItem(DRAFT_PREFIX + attemptId);
    if (!raw) return null;
    const d = JSON.parse(raw) as ReviewDraft;
    if (d?.v !== 1 || !Array.isArray(d.items)) return null;
    return d;
  } catch {
    return null;
  }
}

export function saveReviewDraft(attemptId: string, d: Omit<ReviewDraft, "v" | "ts">) {
  try {
    const empty = !d.items.length && !d.rot && d.score === null && !d.feedback.trim();
    if (empty) localStorage.removeItem(DRAFT_PREFIX + attemptId);
    else localStorage.setItem(DRAFT_PREFIX + attemptId, JSON.stringify({ v: 1, ts: Date.now(), ...d }));
    notify();
  } catch {
    // Переполнено хранилище или приватный режим — проверка работает и без черновика.
  }
}

export function clearReviewDraft(attemptId: string) {
  try {
    localStorage.removeItem(DRAFT_PREFIX + attemptId);
    notify();
  } catch {
    /* нет доступа к хранилищу */
  }
}

/** Убрать черновики старше трёх недель (работы давно проверены или удалены). */
export function pruneReviewDrafts(now = Date.now()) {
  try {
    for (let i = localStorage.length - 1; i >= 0; i--) {
      const k = localStorage.key(i);
      if (!k?.startsWith(DRAFT_PREFIX)) continue;
      const d = JSON.parse(localStorage.getItem(k) || "null") as ReviewDraft | null;
      if (!d || now - d.ts > DRAFT_TTL) localStorage.removeItem(k);
    }
  } catch {
    /* нет доступа к хранилищу */
  }
}
