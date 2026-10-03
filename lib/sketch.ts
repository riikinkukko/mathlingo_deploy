// Черновик ученика: модель рисунка, геометрия (прилипание к чертежу),
// сглаживание, хранение по задаче и снимок для репетитора.
//
// Все координаты — «мировые»: лист шириной WORLD_W единиц (= CSS px при
// масштабе 1), высота растёт по мере надобности. Масштаб и сдвиг экрана
// к миру не относятся, поэтому рисунок не съезжает при повороте телефона.

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
 * Достаёт вершины и стороны из SVG чертежа (многоугольники, линии, ломаные,
 * пути без кривых) и переводит их в мировые координаты через toWorld.
 * Короткие отрезки (засечки, значки углов) отбрасываются — к ним не липнем.
 */
export function extractGeometry(svg: SVGSVGElement, toWorld: (x: number, y: number) => Pt): Geometry {
  const g = emptyGeometry();
  const els = svg.querySelectorAll("polygon, polyline, line, path, rect, circle");
  els.forEach((node) => {
    const el = node as SVGGraphicsElement;
    const m = el.getScreenCTM();
    if (!m) return;
    const scr = (x: number, y: number): Pt => {
      const pt = new DOMPoint(x, y).matrixTransform(m);
      return toWorld(pt.x, pt.y);
    };
    let pts: Pt[] = [];
    let closed = false;
    const tag = el.tagName.toLowerCase();
    if (tag === "line") {
      const l = el as SVGLineElement;
      pts = [scr(l.x1.baseVal.value, l.y1.baseVal.value), scr(l.x2.baseVal.value, l.y2.baseVal.value)];
    } else if (tag === "polygon" || tag === "polyline") {
      const list = (el as SVGPolygonElement).points;
      for (let i = 0; i < list.numberOfItems; i++) pts.push(scr(list.getItem(i).x, list.getItem(i).y));
      closed = tag === "polygon";
    } else if (tag === "rect") {
      const r = el as SVGRectElement;
      const x = r.x.baseVal.value, y = r.y.baseVal.value, w = r.width.baseVal.value, h = r.height.baseVal.value;
      if (w < 12 || h < 12) return;
      pts = [scr(x, y), scr(x + w, y), scr(x + w, y + h), scr(x, y + h)];
      closed = true;
    } else if (tag === "circle") {
      const c = el as SVGCircleElement;
      if (c.r.baseVal.value >= 12) g.centers.push(scr(c.cx.baseVal.value, c.cy.baseVal.value));
      return;
    } else if (tag === "path") {
      const d = el.getAttribute("d") || "";
      if (/[CcQqAaSsTt]/.test(d)) return; // кривые — дуги углов и т. п.
      const toks = d.match(/[MmLlHhVvZz]|-?\d*\.?\d+(?:e-?\d+)?/g) || [];
      let cmd = "M", x = 0, y = 0, sx = 0, sy = 0;
      const raw: Pt[][] = [];
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
          if (cur.length > 1) raw.push(cur);
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
      if (cur.length > 1) raw.push(cur);
      for (const r of raw) {
        const w = r.map(([px, py]) => scr(px, py));
        for (let i = 0; i + 1 < w.length; i++) addSeg(g, w[i], w[i + 1]);
      }
      return;
    }
    for (let i = 0; i + 1 < pts.length; i++) addSeg(g, pts[i], pts[i + 1]);
    if (closed && pts.length > 2) addSeg(g, pts[pts.length - 1], pts[0]);
  });
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
const MAX_DOCS = 60;

export function loadSketch(problemId: string): SketchDoc | null {
  try {
    const raw = localStorage.getItem(KEY(problemId));
    if (!raw) return null;
    const d = JSON.parse(raw) as SketchDoc;
    return d && d.v === 1 && Array.isArray(d.items) ? d : null;
  } catch {
    return null;
  }
}

export function saveSketch(problemId: string, items: SketchItem[], h: number) {
  try {
    if (items.length === 0) {
      localStorage.removeItem(KEY(problemId));
      return;
    }
    const doc: SketchDoc = { v: 1, items, h, ts: Date.now() };
    const s = JSON.stringify(doc);
    if (s.length > 500_000) return; // огромный рисунок не храним, чтобы не забить память
    localStorage.setItem(KEY(problemId), s);
    pruneSketches();
  } catch {
    // память браузера недоступна или переполнена — черновик просто не сохранится
  }
}

function pruneSketches() {
  const keys: { k: string; ts: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith("pm-sketch:v1:")) continue;
    try {
      keys.push({ k, ts: JSON.parse(localStorage.getItem(k) || "{}").ts || 0 });
    } catch {
      keys.push({ k, ts: 0 });
    }
  }
  if (keys.length <= MAX_DOCS) return;
  keys.sort((a, b) => a.ts - b.ts).slice(0, keys.length - MAX_DOCS).forEach(({ k }) => localStorage.removeItem(k));
}

export function hasSavedSketch(problemId: string): boolean {
  return !!loadSketch(problemId)?.items.length;
}

// ----------------------------------------------------- снимок для репетитора

/**
 * Снимок черновика в JPEG (data URL) — для вопроса репетитору. diagramSvg —
 * SVG чертежа задачи (берём из карточки), кладём его туда же, где он стоит
 * на листе. Обрезаем по высоте содержимого.
 */
export async function renderSketchJpeg(doc: SketchDoc, diagramSvg: SVGSVGElement | null): Promise<string | null> {
  try {
    const bottom = Math.max(diagramSvg ? DIAGRAM_BOX.y + DIAGRAM_BOX.h : 0, contentBottom(doc.items)) + 24;
    const H = Math.min(Math.max(bottom, 220), 1600);
    let diagram = "";
    if (diagramSvg) {
      const clone = diagramSvg.cloneNode(true) as SVGSVGElement;
      clone.removeAttribute("class");
      clone.setAttribute("x", String(DIAGRAM_BOX.x));
      clone.setAttribute("y", String(DIAGRAM_BOX.y));
      clone.setAttribute("width", String(DIAGRAM_BOX.w));
      clone.setAttribute("height", String(DIAGRAM_BOX.h));
      diagram = new XMLSerializer().serializeToString(clone);
    }
    const svg =
      `<svg xmlns="http://www.w3.org/2000/svg" width="${WORLD_W}" height="${H}" viewBox="0 0 ${WORLD_W} ${H}">` +
      `<defs><pattern id="g" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#E6EFEA" stroke-width="1"/></pattern></defs>` +
      `<rect width="100%" height="100%" fill="#fff"/><rect width="100%" height="100%" fill="url(#g)"/>` +
      diagram +
      doc.items.map(itemMarkup).join("") +
      `</svg>`;
    const img = new Image();
    img.src = "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
    await img.decode();
    const scale = 2;
    const canvas = document.createElement("canvas");
    canvas.width = WORLD_W * scale;
    canvas.height = H * scale;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let q = 0.82;
    let url = canvas.toDataURL("image/jpeg", q);
    while (url.length > 600_000 && q > 0.4) {
      q -= 0.15;
      url = canvas.toDataURL("image/jpeg", q);
    }
    return url.length <= 600_000 ? url : null;
  } catch {
    return null;
  }
}
