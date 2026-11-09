// Черновик ученика в приложении — та же модель, что на сайте (lib/sketch.ts):
// мировые координаты листа шириной WORLD_W, элементы рисунка, прилипание к
// чертежу. Отличия: геометрия чертежа читается из SVG-строки (на сайте —
// из DOM), а хранение — в AsyncStorage.

import AsyncStorage from "@react-native-async-storage/async-storage";

export const WORLD_W = 360;
export const DIAGRAM_BOX = { x: 16, y: 16, w: 328, h: 230 };

export type Pt = [number, number];

export type SketchItem =
  | { t: "stroke"; pts: number[]; c: string; w: number; hl?: boolean }
  | { t: "line"; a: Pt; b: Pt; c: string; w: number }
  | { t: "circle"; o: Pt; r: number; c: string; w: number }
  | { t: "text"; p: Pt; s: string; c: string }
  | { t: "dot"; p: Pt; c: string }
  | { t: "tick"; p: Pt; ang: number; n: 1 | 2; c: string }
  | { t: "right"; p: Pt; u: Pt; v: Pt; c: string }
  | { t: "arc"; p: Pt; u: Pt; v: Pt; c: string };

export type SketchDoc = { v: 1; items: SketchItem[]; h: number; ts: number };

// ---------------------------------------------------------------- векторы

export const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
export const add = (a: Pt, b: Pt): Pt => [a[0] + b[0], a[1] + b[1]];
export const mul = (a: Pt, k: number): Pt => [a[0] * k, a[1] * k];
export const len = (a: Pt) => Math.hypot(a[0], a[1]);
export const dist = (a: Pt, b: Pt) => len(sub(a, b));
export const norm = (a: Pt): Pt => {
  const l = len(a) || 1;
  return [a[0] / l, a[1] / l];
};
const dot2 = (a: Pt, b: Pt) => a[0] * b[0] + a[1] * b[1];

/** Проекция точки на отрезок: ближайшая точка отрезка и параметр 0..1. */
export function projectOnSegment(p: Pt, a: Pt, b: Pt): { q: Pt; t: number; d: number } {
  const ab = sub(b, a);
  const l2 = dot2(ab, ab) || 1;
  const t = Math.max(0, Math.min(1, dot2(sub(p, a), ab) / l2));
  const q = add(a, mul(ab, t));
  return { q, t, d: dist(p, q) };
}

/** Проекция на прямую (без обрезки по концам) — основание высоты. */
export function projectOnLine(p: Pt, a: Pt, b: Pt): Pt {
  const ab = sub(b, a);
  const t = dot2(sub(p, a), ab) / (dot2(ab, ab) || 1);
  return add(a, mul(ab, t));
}

// ------------------------------------------------------ геометрия чертежа

export type Geometry = { vertices: Pt[]; segments: [Pt, Pt][]; centers: Pt[] };
export const emptyGeometry = (): Geometry => ({ vertices: [], segments: [], centers: [] });

function pushVertex(list: Pt[], p: Pt) {
  if (!list.some((v) => dist(v, p) < 3)) list.push(p);
}

/**
 * Достаёт вершины и стороны из SVG-строки чертежа (многоугольники, линии,
 * ломаные, пути без кривых) — координаты в единицах viewBox, toWorld
 * переводит их на лист. Короткие отрезки (засечки, значки углов) не берём.
 * На сайте то же делает extractGeometry по DOM (lib/sketch.ts).
 */
export function geometryFromSvg(svg: string, toWorld: (x: number, y: number) => Pt): Geometry {
  const g = emptyGeometry();
  const num = (tag: string, name: string) => {
    const m = new RegExp(`\\s${name}="(-?[\\d.e-]+)"`).exec(tag);
    return m ? parseFloat(m[1]) : 0;
  };
  const tags = svg.match(/<(polygon|polyline|line|path|rect|circle)\b[^>]*>/g) ?? [];
  for (const tag of tags) {
    const kind = /^<(\w+)/.exec(tag)![1];
    let pts: Pt[] = [];
    let closed = false;
    if (kind === "line") {
      pts = [toWorld(num(tag, "x1"), num(tag, "y1")), toWorld(num(tag, "x2"), num(tag, "y2"))];
    } else if (kind === "polygon" || kind === "polyline") {
      const raw = /\spoints="([^"]*)"/.exec(tag)?.[1] ?? "";
      const nums = raw.trim().split(/[\s,]+/).map(Number);
      for (let i = 0; i + 1 < nums.length; i += 2) pts.push(toWorld(nums[i], nums[i + 1]));
      closed = kind === "polygon";
    } else if (kind === "rect") {
      const x = num(tag, "x"), y = num(tag, "y"), w = num(tag, "width"), h = num(tag, "height");
      if (w < 12 || h < 12) continue;
      pts = [toWorld(x, y), toWorld(x + w, y), toWorld(x + w, y + h), toWorld(x, y + h)];
      closed = true;
    } else if (kind === "circle") {
      if (num(tag, "r") >= 12) g.centers.push(toWorld(num(tag, "cx"), num(tag, "cy")));
      continue;
    } else if (kind === "path") {
      const d = /\sd="([^"]*)"/.exec(tag)?.[1] ?? "";
      if (/[CcQqAaSsTt]/.test(d)) continue;
      const toks = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
      let cmd = "M", x = 0, y = 0, sx = 0, sy = 0;
      const runs: Pt[][] = [];
      let cur: Pt[] = [];
      for (let i = 0; i < toks.length; ) {
        const tk = toks[i];
        if (/[A-Za-z]/.test(tk)) {
          cmd = tk;
          i++;
          if (cmd === "Z" || cmd === "z") {
            if (cur.length) cur.push([sx, sy]);
            x = sx; y = sy;
          }
          continue;
        }
        const n = (k: number) => parseFloat(toks[i + k]);
        if (cmd === "M" || cmd === "m") {
          if (cur.length > 1) runs.push(cur);
          x = cmd === "m" ? x + n(0) : n(0); y = cmd === "m" ? y + n(1) : n(1);
          sx = x; sy = y; cur = [[x, y]]; i += 2;
          cmd = cmd === "m" ? "l" : "L";
        } else if (cmd === "L" || cmd === "l") {
          x = cmd === "l" ? x + n(0) : n(0); y = cmd === "l" ? y + n(1) : n(1); cur.push([x, y]); i += 2;
        } else if (cmd === "H" || cmd === "h") {
          x = cmd === "h" ? x + n(0) : n(0); cur.push([x, y]); i += 1;
        } else if (cmd === "V" || cmd === "v") {
          y = cmd === "v" ? y + n(0) : n(0); cur.push([x, y]); i += 1;
        } else i++;
      }
      if (cur.length > 1) runs.push(cur);
      for (const r of runs) {
        const w = r.map(([px, py]) => toWorld(px, py));
        for (let i = 0; i + 1 < w.length; i++) addSeg(g, w[i], w[i + 1]);
      }
      continue;
    }
    for (let i = 0; i + 1 < pts.length; i++) addSeg(g, pts[i], pts[i + 1]);
    if (closed && pts.length > 2) addSeg(g, pts[pts.length - 1], pts[0]);
  }
  return g;
}

function addSeg(g: Geometry, a: Pt, b: Pt) {
  if (dist(a, b) < 18) return;
  if (g.segments.some(([p, q]) => (dist(p, a) < 3 && dist(q, b) < 3) || (dist(p, b) < 3 && dist(q, a) < 3))) return;
  g.segments.push([a, b]);
  pushVertex(g.vertices, a);
  pushVertex(g.vertices, b);
}

/** Геометрия чертежа + то, что ученик построил сам (линии, точки, центры). */
export function withUserGeometry(base: Geometry, items: SketchItem[]): Geometry {
  const g: Geometry = { vertices: [...base.vertices], segments: [...base.segments], centers: [...base.centers] };
  for (const it of items) {
    if (it.t === "line" && dist(it.a, it.b) >= 18) {
      g.segments.push([it.a, it.b]);
      pushVertex(g.vertices, it.a);
      pushVertex(g.vertices, it.b);
    } else if (it.t === "dot") pushVertex(g.vertices, it.p);
    else if (it.t === "circle") g.centers.push(it.o);
  }
  return g;
}

export type Snap = { p: Pt; kind: "vertex" | "segment" | "free"; seg?: [Pt, Pt]; t?: number };

/** Прилипание: сначала к вершинам и центрам, затем к сторонам. r — радиус в мировых единицах. */
export function snapPoint(p: Pt, g: Geometry, r: number): Snap {
  let best: Snap = { p, kind: "free" };
  let bd = r;
  for (const v of [...g.vertices, ...g.centers]) {
    const d = dist(v, p);
    if (d < bd) {
      bd = d;
      best = { p: v, kind: "vertex" };
    }
  }
  if (best.kind === "vertex") return best;
  bd = r * 0.8;
  for (const s of g.segments) {
    const pr = projectOnSegment(p, s[0], s[1]);
    if (pr.d < bd) {
      bd = pr.d;
      best = { p: pr.q, kind: "segment", seg: s, t: pr.t };
    }
  }
  return best;
}

export function nearestSegment(p: Pt, g: Geometry, r: number) {
  let best: { seg: [Pt, Pt]; q: Pt; t: number } | null = null;
  let bd = r;
  for (const s of g.segments) {
    const pr = projectOnSegment(p, s[0], s[1]);
    if (pr.d < bd) {
      bd = pr.d;
      best = { seg: s, q: pr.q, t: pr.t };
    }
  }
  return best;
}

export function nearestVertex(p: Pt, g: Geometry, r: number): Pt | null {
  let best: Pt | null = null;
  let bd = r;
  for (const v of g.vertices) {
    const d = dist(v, p);
    if (d < bd) {
      bd = d;
      best = v;
    }
  }
  return best;
}

/** Две стороны при вершине V, между которыми лежит направление на точку тапа. */
export function cornerAt(v: Pt, tap: Pt, g: Geometry): { u: Pt; w: Pt } | null {
  const dirs: Pt[] = [];
  for (const [a, b] of g.segments) {
    if (dist(a, v) < 3) dirs.push(norm(sub(b, a)));
    else if (dist(b, v) < 3) dirs.push(norm(sub(a, b)));
  }
  if (dirs.length < 2) return null;
  const ang = (d: Pt) => Math.atan2(d[1], d[0]);
  const sorted = dirs.map((d) => ({ d, a: ang(d) })).sort((x, y) => x.a - y.a);
  const ta = ang(sub(tap, v));
  for (let i = 0; i < sorted.length; i++) {
    const a1 = sorted[i], a2 = sorted[(i + 1) % sorted.length];
    let span = a2.a - a1.a;
    if (span <= 0) span += Math.PI * 2;
    let rel = ta - a1.a;
    if (rel < 0) rel += Math.PI * 2;
    if (rel <= span && span < Math.PI * 1.999) return { u: a1.d, w: a2.d };
  }
  return { u: sorted[0].d, w: sorted[1].d };
}

/** Угол между отрезками в градусах (0..90). */
export function angleBetween(d1: Pt, d2: Pt) {
  const c = Math.abs(dot2(norm(d1), norm(d2)));
  return (Math.acos(Math.min(1, c)) * 180) / Math.PI;
}

/** Высота / медиана / биссектриса из вершины V к стороне PQ. */
export function cevian(kind: "height" | "median" | "bisector", v: Pt, p: Pt, q: Pt): Pt {
  if (kind === "median") return mul(add(p, q), 0.5);
  if (kind === "height") return projectOnLine(v, p, q);
  const dp = dist(v, p), dq = dist(v, q);
  return add(p, mul(sub(q, p), dp / (dp + dq || 1)));
}

// ------------------------------------------------------------- отрисовка

/** Сглаженный путь по точкам (квадратичные кривые через середины). */
export function strokePath(pts: number[]): string {
  const n = pts.length / 2;
  if (n === 0) return "";
  if (n === 1) return `M${pts[0]} ${pts[1]}l0.01 0`;
  let d = `M${pts[0].toFixed(1)} ${pts[1].toFixed(1)}`;
  for (let i = 1; i < n - 1; i++) {
    const x = pts[i * 2], y = pts[i * 2 + 1];
    const mx = (x + pts[i * 2 + 2]) / 2, my = (y + pts[i * 2 + 3]) / 2;
    d += `Q${x.toFixed(1)} ${y.toFixed(1)} ${mx.toFixed(1)} ${my.toFixed(1)}`;
  }
  d += `L${pts[(n - 1) * 2].toFixed(1)} ${pts[(n - 1) * 2 + 1].toFixed(1)}`;
  return d;
}

/** SVG-разметка одного элемента (для экрана и для снимка). */
export function itemMarkup(it: SketchItem): string {
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  switch (it.t) {
    case "stroke":
      return `<path d="${strokePath(it.pts)}" fill="none" stroke="${it.c}" stroke-width="${it.w}" stroke-linecap="round" stroke-linejoin="round"${it.hl ? ' stroke-opacity="0.45"' : ""}/>`;
    case "line":
      return `<line x1="${it.a[0]}" y1="${it.a[1]}" x2="${it.b[0]}" y2="${it.b[1]}" stroke="${it.c}" stroke-width="${it.w}" stroke-linecap="round"/>`;
    case "circle":
      return `<circle cx="${it.o[0]}" cy="${it.o[1]}" r="${it.r}" fill="none" stroke="${it.c}" stroke-width="${it.w}"/>`;
    case "text":
      return `<text x="${it.p[0]}" y="${it.p[1]}" fill="${it.c}" font-family="Nunito, sans-serif" font-weight="800" font-size="18" dominant-baseline="middle">${esc(it.s)}</text>`;
    case "dot":
      return `<circle cx="${it.p[0]}" cy="${it.p[1]}" r="3.5" fill="${it.c}"/>`;
    case "tick": {
      const d = [Math.cos(it.ang), Math.sin(it.ang)] as Pt;
      const nrm: Pt = [-d[1], d[0]];
      const one = (off: number) => {
        const c = add(it.p, mul(d, off));
        const a = add(c, mul(nrm, 6)), b = sub(c, mul(nrm, 6));
        return `<line x1="${a[0]}" y1="${a[1]}" x2="${b[0]}" y2="${b[1]}" stroke="${it.c}" stroke-width="2.5" stroke-linecap="round"/>`;
      };
      return it.n === 1 ? one(0) : one(-3) + one(3);
    }
    case "right": {
      const s = 11;
      const a = add(it.p, mul(it.u, s)), c = add(it.p, mul(it.v, s)), b = add(a, mul(it.v, s));
      return `<path d="M${a[0]} ${a[1]}L${b[0]} ${b[1]}L${c[0]} ${c[1]}" fill="none" stroke="${it.c}" stroke-width="2.2" stroke-linejoin="round"/>`;
    }
    case "arc": {
      const r = 20;
      const a = add(it.p, mul(it.u, r)), b = add(it.p, mul(it.v, r));
      const cross = it.u[0] * it.v[1] - it.u[1] * it.v[0];
      return `<path d="M${a[0]} ${a[1]}A${r} ${r} 0 0 ${cross > 0 ? 1 : 0} ${b[0]} ${b[1]}" fill="none" stroke="${it.c}" stroke-width="2.2"/>`;
    }
  }
}

/** Попадание в элемент (ластик удаляет элемент целиком). */
export function hitItem(it: SketchItem, p: Pt, r: number): boolean {
  switch (it.t) {
    case "stroke":
      for (let i = 0; i + 3 < it.pts.length; i += 2) {
        if (projectOnSegment(p, [it.pts[i], it.pts[i + 1]], [it.pts[i + 2], it.pts[i + 3]]).d < r + it.w / 2) return true;
      }
      return it.pts.length === 2 && dist(p, [it.pts[0], it.pts[1]]) < r;
    case "line":
      return projectOnSegment(p, it.a, it.b).d < r;
    case "circle":
      return Math.abs(dist(p, it.o) - it.r) < r;
    case "text":
      return p[0] > it.p[0] - r && p[0] < it.p[0] + it.s.length * 11 + r && Math.abs(p[1] - it.p[1]) < 12 + r;
    default:
      return dist(p, it.p) < 14 + r;
  }
}

export function contentBottom(items: SketchItem[]): number {
  let y = 0;
  for (const it of items) {
    if (it.t === "stroke") for (let i = 1; i < it.pts.length; i += 2) y = Math.max(y, it.pts[i]);
    else if (it.t === "line") y = Math.max(y, it.a[1], it.b[1]);
    else if (it.t === "circle") y = Math.max(y, it.o[1] + it.r);
    else y = Math.max(y, it.p[1] + 12);
  }
  return y;
}

// -------------------------------------------------------------- хранение


const KEY = (problemId: string) => `pm-sketch:v1:${problemId}`;
const INDEX = "pm-sketch:index";
const MAX_DOCS = 60;

export async function loadSketch(problemId: string): Promise<SketchDoc | null> {
  try {
    const raw = await AsyncStorage.getItem(KEY(problemId));
    if (!raw) return null;
    const d = JSON.parse(raw) as SketchDoc;
    return d && d.v === 1 && Array.isArray(d.items) ? d : null;
  } catch {
    return null;
  }
}

export async function saveSketch(problemId: string, items: SketchItem[], h: number) {
  try {
    const idx: string[] = JSON.parse((await AsyncStorage.getItem(INDEX)) || "[]");
    const rest = idx.filter((k) => k !== problemId);
    if (items.length === 0) {
      await AsyncStorage.removeItem(KEY(problemId));
      await AsyncStorage.setItem(INDEX, JSON.stringify(rest));
      return;
    }
    const s = JSON.stringify({ v: 1, items, h, ts: Date.now() } satisfies SketchDoc);
    if (s.length > 500_000) return;
    await AsyncStorage.setItem(KEY(problemId), s);
    const next = [...rest, problemId];
    // Храним последние MAX_DOCS черновиков — память телефона не бесконечна.
    const drop = next.slice(0, Math.max(0, next.length - MAX_DOCS));
    if (drop.length) await AsyncStorage.multiRemove(drop.map(KEY));
    await AsyncStorage.setItem(INDEX, JSON.stringify(next.slice(-MAX_DOCS)));
  } catch {
    // память недоступна — черновик просто не сохранится
  }
}

// ------------------------------------------------- выделение и перемещение

export type BBox = { x0: number; y0: number; x1: number; y1: number };

/** Габариты элемента в мировых координатах (с запасом на толщину). */
export function itemBBox(it: SketchItem): BBox {
  switch (it.t) {
    case "stroke": {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      for (let i = 0; i + 1 < it.pts.length; i += 2) {
        x0 = Math.min(x0, it.pts[i]); x1 = Math.max(x1, it.pts[i]);
        y0 = Math.min(y0, it.pts[i + 1]); y1 = Math.max(y1, it.pts[i + 1]);
      }
      const h = it.w / 2;
      return { x0: x0 - h, y0: y0 - h, x1: x1 + h, y1: y1 + h };
    }
    case "line":
      return { x0: Math.min(it.a[0], it.b[0]), y0: Math.min(it.a[1], it.b[1]), x1: Math.max(it.a[0], it.b[0]), y1: Math.max(it.a[1], it.b[1]) };
    case "circle":
      return { x0: it.o[0] - it.r, y0: it.o[1] - it.r, x1: it.o[0] + it.r, y1: it.o[1] + it.r };
    case "text":
      return { x0: it.p[0], y0: it.p[1] - 12, x1: it.p[0] + it.s.length * 11, y1: it.p[1] + 12 };
    default:
      return { x0: it.p[0] - 14, y0: it.p[1] - 14, x1: it.p[0] + 14, y1: it.p[1] + 14 };
  }
}

export function unionBBox(items: SketchItem[]): BBox | null {
  if (!items.length) return null;
  return items.map(itemBBox).reduce((a, b) => ({
    x0: Math.min(a.x0, b.x0),
    y0: Math.min(a.y0, b.y0),
    x1: Math.max(a.x1, b.x1),
    y1: Math.max(a.y1, b.y1),
  }));
}

export function bboxIntersects(a: BBox, b: BBox): boolean {
  return a.x0 <= b.x1 && a.x1 >= b.x0 && a.y0 <= b.y1 && a.y1 >= b.y0;
}

/** Сдвиг элемента на (dx; dy) — новый объект, исходный не меняется. */
export function translateItem(it: SketchItem, dx: number, dy: number): SketchItem {
  const m = (p: Pt): Pt => [p[0] + dx, p[1] + dy];
  switch (it.t) {
    case "stroke":
      return { ...it, pts: it.pts.map((v, i) => (i % 2 === 0 ? v + dx : v + dy)) };
    case "line":
      return { ...it, a: m(it.a), b: m(it.b) };
    case "circle":
      return { ...it, o: m(it.o) };
    default:
      return { ...it, p: m(it.p) };
  }
}

/** Угол отрезка a→b с прилипанием к 0°/45°/90°… (в пределах tol градусов). */
export function snapAngle(a: Pt, b: Pt, stepDeg: number, tolDeg: number): Pt {
  const d = sub(b, a);
  const l = len(d);
  if (l < 1) return b;
  const ang = (Math.atan2(d[1], d[0]) * 180) / Math.PI;
  const near = Math.round(ang / stepDeg) * stepDeg;
  if (Math.abs(ang - near) > tolDeg) return b;
  const r = (near * Math.PI) / 180;
  return [a[0] + Math.cos(r) * l, a[1] + Math.sin(r) * l];
}
