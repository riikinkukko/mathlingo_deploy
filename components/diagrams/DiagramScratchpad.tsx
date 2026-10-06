"use client";

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DiagramSpec } from "@/lib/types";
import DiagramRenderer from "./DiagramRenderer";
import {
  WORLD_W,
  DIAGRAM_BOX,
  Pt,
  SketchItem,
  Geometry,
  emptyGeometry,
  extractGeometry,
  withUserGeometry,
  snapPoint,
  nearestSegment,
  nearestVertex,
  cornerAt,
  angleBetween,
  cevian,
  dist,
  sub,
  norm,
  itemMarkup,
  strokePath,
  hitItem,
  contentBottom,
  loadSketch,
  saveSketch,
  itemBBox,
  unionBBox,
  bboxIntersects,
  translateItem,
  snapAngle,
} from "@/lib/sketch";

/**
 * Черновик 2.0 — на весь экран, лист в клетку без краёв.
 *  • Один палец (или мышь, стилус) — рисует; два пальца — двигают и
 *    приближают лист; короткий тап двумя пальцами — отменить.
 *  • Ладонь не рисует: пока идёт штрих, другие касания игнорируются; в режиме
 *    «пишу стилусом» палец только двигает лист.
 *  • Линейка и значки прилипают к вершинам и сторонам чертежа; из вершины
 *    к стороне строятся высота, медиана, биссектриса.
 *  • Рисунок сохраняется у каждой задачи (на устройстве ученика) — закрыть
 *    черновик можно без потерь.
 *  • Поле ответа внизу — решил и ответил, не закрывая черновик.
 *  • «Выбор»: тап по фигуре или рамка — выделить; тянуть — двигать;
 *    «Копия» / «Удалить». На компьютере: Alt + перетаскивание — копия,
 *    Ctrl+C / Ctrl+V / Ctrl+D, Delete; Shift с ручкой — ровная прямая.
 *  • На компьютере Ctrl + колесо (и щипок на тачпаде) масштабируют лист,
 *    а не страницу браузера — иначе два зума накладывались друг на друга.
 */

type Tool = "pen" | "line" | "text" | "stamp" | "eraser" | "select";
type Stamp = "tick1" | "tick2" | "right" | "arc" | "circle" | "dot" | "height" | "median" | "bisector";

const COLORS = [
  { hex: "#132A20", label: "Чёрный" },
  { hex: "#E2474C", label: "Красный" },
  { hex: "#2F6FDB", label: "Синий" },
  { hex: "#0E8C82", label: "Бирюзовый" },
];
const HIGHLIGHT = "#FFD24A";
const WIDTHS = [
  { w: 2, label: "Тонкая" },
  { w: 3.5, label: "Средняя" },
  { w: 6, label: "Толстая" },
];
const STAMPS: { k: Stamp; label: string; hint: string }[] = [
  { k: "tick1", label: "Равные |", hint: "Тапни по стороне" },
  { k: "tick2", label: "Равные ||", hint: "Тапни по стороне" },
  { k: "right", label: "Прямой угол", hint: "Тапни внутри угла у вершины" },
  { k: "arc", label: "Дуга угла", hint: "Тапни внутри угла у вершины" },
  { k: "circle", label: "Окружность", hint: "Поставь центр и тяни радиус" },
  { k: "dot", label: "Точка", hint: "Тапни и подпиши букву" },
  { k: "height", label: "Высота", hint: "Тапни вершину, потом сторону" },
  { k: "median", label: "Медиана", hint: "Тапни вершину, потом сторону" },
  { k: "bisector", label: "Биссектриса", hint: "Тапни вершину, потом сторону" },
];

export type AnswerBarProps = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => Promise<"correct" | "wrong" | "other">;
  /** Развёрнутое решение — поле ответа не показываем, только «К ответу». */
  detailed: boolean;
  /** Уже решено / время вышло — отвечать нельзя. */
  disabled: boolean;
};

type View = { x: number; y: number; z: number };
type Live =
  | { t: "stroke"; pts: number[]; straight?: boolean }
  | { t: "line"; a: Pt; b: Pt; snapA?: boolean; snapB?: boolean }
  | { t: "circle"; o: Pt; r: number }
  | null;

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
    /* память недоступна */
  }
}

export default function DiagramScratchpad({
  problemId,
  spec,
  problemText,
  egeNumber,
  onClose,
  onChange,
  answerBar,
}: {
  problemId: string;
  /** Нет чертежа — пустой лист (ученик рисует с нуля). */
  spec?: DiagramSpec;
  problemText?: string;
  egeNumber?: number;
  onClose: () => void;
  /** Сообщает, есть ли на листе пометки (для метки «есть пометки» в карточке). */
  onChange?: (hasItems: boolean) => void;
  answerBar?: AnswerBarProps;
}) {
  const viewportRef = useRef<HTMLDivElement>(null);
  const worldRef = useRef<HTMLDivElement>(null);
  const diagramRef = useRef<HTMLDivElement>(null);

  // --- рисунок и история
  const saved = useMemo(() => (typeof window !== "undefined" ? loadSketch(problemId) : null), [problemId]);
  const [items, setItems] = useState<SketchItem[]>(saved?.items ?? []);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const past = useRef<SketchItem[][]>([]);
  const future = useRef<SketchItem[][]>([]);
  // Счётчик версии геометрии чертежа: растёт, когда вершины/стороны извлечены из SVG.
  const [geomVersion, bump] = useState(0);
  const commit = useCallback((next: SketchItem[]) => {
    past.current.push(itemsRef.current);
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    setItems(next);
  }, []);
  // Выделение (инструмент «Выбор») — индексы в items.
  const [selected, setSelected] = useState<number[]>([]);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
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

  // --- лист
  const minH = spec ? 900 : 800;
  const [H, setH] = useState(Math.max(saved?.h ?? 0, minH));
  const [vp, setVp] = useState({ w: 0, h: 0 });
  const [view, setView] = useState<View>({ x: 0, y: 0, z: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const base = vp.w ? Math.min(vp.w / WORLD_W, 1.7) : 1;
  const scale = base * view.z;

  // --- инструменты
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0].hex);
  const [width, setWidth] = useState(WIDTHS[1].w);
  const [highlight, setHighlight] = useState(false);
  const [stamp, setStamp] = useState<Stamp>("tick1");
  const [popover, setPopover] = useState<"stamps" | "pen" | null>(null);
  const [stylusOnly, setStylusOnly] = useState(() => readFlag("pm-sketch-stylus") === "1");
  const [condOpen, setCondOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [live, setLive] = useState<Live>(null);
  const [cevianFrom, setCevianFrom] = useState<Pt | null>(null);
  const [textEdit, setTextEdit] = useState<{ p: Pt; value: string } | null>(null);
  const [confirmClear, setConfirmClear] = useState(false);
  const [answerState, setAnswerState] = useState<"idle" | "pending" | "wrong">("idle");
  // Подсказка про жесты — пока ученик ни разу сам не приблизил лист (и не
  // дольше трёх открытий). Как только приблизил — больше не показываем.
  const [hint, setHint] = useState(() => {
    const f = readFlag("pm-sketch-hint");
    return f !== "done" && Number(f || 0) < 3;
  });
  const learnedZoom = useRef(readFlag("pm-sketch-hint") === "done");
  function markZoomLearned() {
    setHint(false);
    if (learnedZoom.current) return;
    learnedZoom.current = true;
    writeFlag("pm-sketch-hint", "done");
  }
  // Мышь/тачпад — подсказки и клавиши для компьютера.
  const [desktop] = useState(
    () => typeof window !== "undefined" && !!window.matchMedia?.("(hover: hover) and (pointer: fine)").matches
  );
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const dragRef = useRef<{ start: Pt; base: SketchItem[]; sel: number[]; moved: boolean } | null>(null);
  const clipboard = useRef<SketchItem[]>([]);
  const baseGeom = useRef<Geometry>(emptyGeometry());

  const geom = useMemo(() => withUserGeometry(baseGeom.current, items), [items, vp.w, geomVersion]); // eslint-disable-line react-hooks/exhaustive-deps

  // Сохраняем рисунок (с небольшой задержкой, чтобы не писать на каждый штрих).
  useEffect(() => {
    const t = setTimeout(() => saveSketch(problemId, items, H), 300);
    onChange?.(items.length > 0);
    return () => clearTimeout(t);
  }, [items, H, problemId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Закрыли черновик сразу после штриха — сохраняем без задержки, иначе
  // последний штрих потерялся бы (таймер выше отменяется при размонтировании).
  const hRef = useRef(H);
  hRef.current = H;
  useEffect(() => () => saveSketch(problemId, itemsRef.current, hRef.current), [problemId]);

  // Лист растёт вниз, когда пишут у нижнего края.
  useEffect(() => {
    const need = contentBottom(items) + 400;
    if (need > H) setH(Math.ceil(need / 200) * 200);
  }, [items, H]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  // Прокрутка страницы под черновиком не нужна.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    if (hint && !learnedZoom.current) writeFlag("pm-sketch-hint", String(Number(readFlag("pm-sketch-hint") || 0) + 1));
    return () => {
      document.body.style.overflow = prev;
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Размер видимой области (и при повороте телефона).
  useLayoutEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      const r = el.getBoundingClientRect();
      setVp({ w: r.width, h: r.height });
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const clampView = useCallback(
    (v: View): View => {
      const s = base * v.z;
      const ww = WORLD_W * s;
      const x = ww <= vp.w ? (vp.w - ww) / 2 : Math.min(0, Math.max(vp.w - ww, v.x));
      const minY = Math.min(0, vp.h - H * s - 80);
      const y = Math.min(24, Math.max(minY, v.y));
      return { x, y, z: v.z };
    },
    [base, vp.w, vp.h, H]
  );

  useEffect(() => {
    if (vp.w) setView((v) => clampView(v));
  }, [vp.w, vp.h, clampView]);

  // Вершины и стороны чертежа — после того, как он отрисовался.
  useEffect(() => {
    if (!vp.w || !spec) return;
    const raf = requestAnimationFrame(() => {
      const svg = diagramRef.current?.querySelector("svg");
      const vpEl = viewportRef.current;
      if (!svg || !vpEl) return;
      const r = vpEl.getBoundingClientRect();
      const v = viewRef.current;
      const s = base * v.z;
      baseGeom.current = extractGeometry(svg as SVGSVGElement, (sx, sy) => [(sx - r.left - v.x) / s, (sy - r.top - v.y) / s]);
      bump((n) => n + 1);
    });
    return () => cancelAnimationFrame(raf);
  }, [vp.w, spec]); // eslint-disable-line react-hooks/exhaustive-deps

  const toWorld = useCallback(
    (clientX: number, clientY: number): Pt => {
      const r = viewportRef.current!.getBoundingClientRect();
      const v = viewRef.current;
      const s = base * v.z;
      return [(clientX - r.left - v.x) / s, (clientY - r.top - v.y) / s];
    },
    [base]
  );

  // ----------------------------------------------------------- жесты

  type P = { x: number; y: number; type: string };
  const pointers = useRef(new Map<number, P>());
  const mode = useRef<"idle" | "draw" | "gesture" | "pan" | "ignore">("idle");
  const drawId = useRef<number | null>(null);
  const drawStart = useRef({ t: 0, x: 0, y: 0, moved: 0 });
  const gestureStart = useRef<{ d: number; cx: number; cy: number; view: View; t: number; moved: number } | null>(null);
  const liveRef = useRef<Live>(null);
  const eraseHit = useRef(false);

  const snapR = 18 / scale;

  function beginGesture() {
    const ps = [...pointers.current.values()];
    if (ps.length < 2) return;
    const [a, b] = ps;
    gestureStart.current = {
      d: Math.hypot(a.x - b.x, a.y - b.y) || 1,
      cx: (a.x + b.x) / 2,
      cy: (a.y + b.y) / 2,
      view: viewRef.current,
      t: Date.now(),
      moved: 0,
    };
    mode.current = "gesture";
    liveRef.current = null;
    setLive(null);
    drawId.current = null;
    if (hint) setHint(false);
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (textEdit) return; // сначала закончи подпись
    (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY, type: e.pointerType });
    if (popover) setPopover(null);

    // Пишу стилусом: палец только двигает лист.
    if (stylusOnly && e.pointerType === "touch") {
      if (pointers.current.size >= 2) beginGesture();
      else if (mode.current === "idle") {
        mode.current = "pan";
        gestureStart.current = { d: 1, cx: e.clientX, cy: e.clientY, view: viewRef.current, t: Date.now(), moved: 0 };
      }
      return;
    }

    if (pointers.current.size === 1 && mode.current === "idle") {
      // Колесо/средняя кнопка мыши — двигаем лист.
      if (e.pointerType === "mouse" && e.button === 1) {
        mode.current = "pan";
        gestureStart.current = { d: 1, cx: e.clientX, cy: e.clientY, view: viewRef.current, t: Date.now(), moved: 0 };
        return;
      }
      mode.current = "draw";
      drawId.current = e.pointerId;
      drawStart.current = { t: Date.now(), x: e.clientX, y: e.clientY, moved: 0 };
      startTool(toWorld(e.clientX, e.clientY), { shift: e.shiftKey, alt: e.altKey });
      return;
    }

    if (pointers.current.size === 2 && e.pointerType === "touch") {
      // Второй палец сразу после первого — это жест, а не штрих.
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
    // Остальное — ладонь или лишние пальцы: не рисуют.
    if (mode.current === "idle") mode.current = "ignore";
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const p = pointers.current.get(e.pointerId);
    if (!p) return;
    p.x = e.clientX;
    p.y = e.clientY;

    if (mode.current === "draw" && e.pointerId === drawId.current) {
      drawStart.current.moved = Math.max(
        drawStart.current.moved,
        Math.hypot(e.clientX - drawStart.current.x, e.clientY - drawStart.current.y)
      );
      moveTool(toWorld(e.clientX, e.clientY), e.shiftKey);
    } else if (mode.current === "gesture" && gestureStart.current) {
      const ps = [...pointers.current.values()];
      if (ps.length < 2) return;
      const [a, b] = ps;
      const g = gestureStart.current;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      g.moved = Math.max(g.moved, Math.abs(d - g.d), Math.hypot(cx - g.cx, cy - g.cy));
      const z = Math.min(4, Math.max(1, g.view.z * (d / g.d)));
      if (Math.abs(z - g.view.z) > 0.08) markZoomLearned();
      const r = viewportRef.current!.getBoundingClientRect();
      // Точка мира под центром пальцев остаётся под ним.
      const s0 = base * g.view.z, s1 = base * z;
      const wx = (g.cx - r.left - g.view.x) / s0, wy = (g.cy - r.top - g.view.y) / s0;
      setView(clampView({ z, x: cx - r.left - wx * s1, y: cy - r.top - wy * s1 }));
    } else if (mode.current === "pan" && gestureStart.current) {
      const g = gestureStart.current;
      g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.cx, e.clientY - g.cy));
      setView(clampView({ ...g.view, x: g.view.x + e.clientX - g.cx, y: g.view.y + e.clientY - g.cy }));
    }
  }

  function onPointerUp(e: React.PointerEvent<HTMLDivElement>) {
    if (!pointers.current.has(e.pointerId)) return;
    if (mode.current === "draw" && e.pointerId === drawId.current) {
      const isTap = drawStart.current.moved < 8 && Date.now() - drawStart.current.t < 450;
      endTool(toWorld(e.clientX, e.clientY), isTap);
      drawId.current = null;
    }
    if (mode.current === "gesture" && gestureStart.current && pointers.current.size === 2) {
      const g = gestureStart.current;
      // Короткий тап двумя пальцами без движения — отменить.
      if (Date.now() - g.t < 280 && g.moved < 12) {
        undo();
        setToast("Отменено");
      }
    }
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      mode.current = "idle";
      gestureStart.current = null;
    } else if (mode.current === "gesture") {
      mode.current = "ignore"; // один палец остался после жеста — не рисуем им
    }
  }

  /** Масштаб листа вокруг точки экрана (cx; cy). */
  function zoomAt(z: number, cx: number, cy: number) {
    const r = viewportRef.current!.getBoundingClientRect();
    const v = viewRef.current;
    const nz = Math.min(4, Math.max(1, z));
    const s0 = base * v.z, s1 = base * nz;
    const wx = (cx - r.left - v.x) / s0, wy = (cy - r.top - v.y) / s0;
    setView(clampView({ z: nz, x: cx - r.left - wx * s1, y: cy - r.top - wy * s1 }));
    markZoomLearned();
  }

  // Колесо — нативный обработчик с passive: false: только так можно
  // отменить масштаб страницы браузера (Ctrl + колесо, щипок на тачпаде).
  const wheelRef = useRef<(e: WheelEvent) => void>(() => {});
  wheelRef.current = (e: WheelEvent) => {
    e.preventDefault();
    if (e.ctrlKey || e.metaKey) {
      // Тачпад шлёт маленькие шаги, колесо мыши — крупные: ограничиваем шаг.
      const step = Math.max(-50, Math.min(50, e.deltaY));
      zoomAt(viewRef.current.z * Math.exp(-step * 0.005), e.clientX, e.clientY);
    } else {
      setView((v) => clampView({ ...v, x: v.x - (e.shiftKey ? e.deltaY : e.deltaX), y: v.y - (e.shiftKey ? 0 : e.deltaY) }));
    }
  };
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => wheelRef.current(e);
    el.addEventListener("wheel", onWheel, { passive: false });
    // Ctrl + колесо над шапкой и панелями тоже не должно масштабировать страницу.
    const blockPageZoom = (e: WheelEvent) => {
      if (e.ctrlKey || e.metaKey) e.preventDefault();
    };
    window.addEventListener("wheel", blockPageZoom, { passive: false });
    // Safari: щипок на тачпаде приходит жестом, а не колесом.
    const blockGesture = (e: Event) => e.preventDefault();
    document.addEventListener("gesturestart", blockGesture);
    document.addEventListener("gesturechange", blockGesture);
    return () => {
      el.removeEventListener("wheel", onWheel);
      window.removeEventListener("wheel", blockPageZoom);
      document.removeEventListener("gesturestart", blockGesture);
      document.removeEventListener("gesturechange", blockGesture);
    };
  }, []);

  // ----------------------------------------------------------- инструменты

  function setLiveBoth(l: Live) {
    liveRef.current = l;
    setLive(l);
  }

  /** Элемент под точкой — сверху вниз (последний нарисованный — первым). */
  function itemAt(p: Pt): number {
    const r = 12 / scale;
    const cur = itemsRef.current;
    for (let i = cur.length - 1; i >= 0; i--) if (hitItem(cur[i], p, r)) return i;
    return -1;
  }

  function startTool(p: Pt, mods: { shift: boolean; alt: boolean } = { shift: false, alt: false }) {
    if (tool === "select") {
      const hit = itemAt(p);
      const cur = selectedRef.current;
      if (hit >= 0) {
        let sel = cur.includes(hit) ? cur : mods.shift ? [...cur, hit] : [hit];
        let base = itemsRef.current;
        // Alt + перетаскивание — тянем копию, оригинал остаётся на месте.
        if (mods.alt) {
          const copies = sel.map((i) => base[i]);
          commit([...base, ...copies]);
          base = itemsRef.current = [...base, ...copies];
          sel = copies.map((_, k) => base.length - copies.length + k);
          dragRef.current = { start: p, base, sel, moved: true };
        } else {
          dragRef.current = { start: p, base, sel, moved: false };
        }
        setSelected(sel);
      } else {
        dragRef.current = null;
        if (!mods.shift) setSelected([]);
        setMarquee({ a: p, b: p });
      }
      return;
    }
    if (tool === "pen") setLiveBoth({ t: "stroke", pts: [p[0], p[1]] });
    else if (tool === "line") {
      const s = snapPoint(p, geom, snapR);
      setLiveBoth({ t: "line", a: s.p, b: s.p, snapA: s.kind !== "free" });
    } else if (tool === "eraser") {
      eraseHit.current = false;
      erase(p, true);
    } else if (tool === "stamp" && stamp === "circle") {
      const s = snapPoint(p, geom, snapR);
      setLiveBoth({ t: "circle", o: s.p, r: 0 });
    }
  }

  function moveTool(p: Pt, shift = false) {
    const l = liveRef.current;
    if (tool === "select") {
      const d = dragRef.current;
      if (d) {
        const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
        if (!d.moved && Math.hypot(dx, dy) < 3 / scale) return;
        const set = new Set(d.sel);
        const next = d.base.map((it, i) => (set.has(i) ? translateItem(it, dx, dy) : it));
        // Всё перетаскивание — один шаг отмены.
        if (!d.moved) {
          d.moved = true;
          commit(next);
        } else setItems(next);
      } else if (marquee) setMarquee({ a: marquee.a, b: p });
      return;
    }
    if (tool === "pen" && l?.t === "stroke" && shift) {
      // Shift — ровная прямая от начала штриха (с прилипанием к 0°/45°/90°).
      const a: Pt = [l.pts[0], l.pts[1]];
      const b = snapAngle(a, p, 45, 4);
      setLiveBoth({ t: "stroke", pts: [a[0], a[1], b[0], b[1]], straight: true });
      return;
    }
    if (tool === "pen" && l?.t === "stroke") {
      const n = l.pts.length;
      if (Math.hypot(p[0] - l.pts[n - 2], p[1] - l.pts[n - 1]) < 1.2 / scale) return;
      setLiveBoth({ t: "stroke", pts: [...l.pts, p[0], p[1]] });
    } else if (tool === "line" && l?.t === "line") {
      const s = snapPoint(p, geom, snapR);
      // Shift у линейки — шаг 15°, если конец не прилип к чертежу.
      const b = shift && s.kind === "free" ? snapAngle(l.a, s.p, 15, 7.5) : s.p;
      setLiveBoth({ ...l, b, snapB: s.kind !== "free" });
    } else if (tool === "eraser") erase(p, false);
    else if (l?.t === "circle") setLiveBoth({ ...l, r: dist(l.o, p) });
  }

  function cancelTool() {
    setLiveBoth(null);
    setMarquee(null);
    // Второй палец сразу после первого: начатое перетаскивание откатываем.
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) undo();
  }

  const lastErase = useRef<Pt | null>(null);
  function erase(p: Pt, first: boolean) {
    const r = 10 / scale;
    // Проверяем весь путь пальца от прошлой точки, а не только точки касания:
    // при быстром движении между ними оставались нестёртые штрихи.
    const from = first || !lastErase.current ? p : lastErase.current;
    lastErase.current = p;
    const steps = Math.max(1, Math.ceil(dist(from, p) / (r / 2)));
    const probes: Pt[] = Array.from({ length: steps + 1 }, (_, i) => [from[0] + ((p[0] - from[0]) * i) / steps, from[1] + ((p[1] - from[1]) * i) / steps] as Pt);
    const cur = itemsRef.current;
    const keep = cur.filter((it) => !probes.some((q) => hitItem(it, q, r)));
    if (keep.length === cur.length) return;
    if (first || !eraseHit.current) commit(keep);
    else setItems(keep); // весь мазок ластиком — один шаг отмены
    eraseHit.current = true;
  }

  function endTool(p: Pt, isTap: boolean) {
    const l = liveRef.current;
    setLiveBoth(null);
    const c = color;
    if (tool === "select") {
      dragRef.current = null;
      if (marquee) {
        const box = {
          x0: Math.min(marquee.a[0], p[0]),
          y0: Math.min(marquee.a[1], p[1]),
          x1: Math.max(marquee.a[0], p[0]),
          y1: Math.max(marquee.a[1], p[1]),
        };
        setMarquee(null);
        if (box.x1 - box.x0 < 4 && box.y1 - box.y0 < 4) return;
        const inside = itemsRef.current.map((it, i) => (bboxIntersects(itemBBox(it), box) ? i : -1)).filter((i) => i >= 0);
        setSelected((prev) => [...new Set([...prev, ...inside])]);
      }
      return;
    }
    if (tool === "pen" && l?.t === "stroke" && l.straight) {
      const a: Pt = [l.pts[0], l.pts[1]], b: Pt = [l.pts[2], l.pts[3]];
      if (dist(a, b) < 4) return;
      commit([
        ...itemsRef.current,
        highlight ? { t: "stroke", pts: l.pts, c: HIGHLIGHT, w: 16, hl: true } : { t: "line", a, b, c, w: width },
      ]);
      return;
    }
    if (tool === "pen" && l?.t === "stroke") {
      const pts = l.pts.length >= 4 ? l.pts : [l.pts[0], l.pts[1], l.pts[0] + 0.01, l.pts[1]];
      commit([
        ...itemsRef.current,
        highlight ? { t: "stroke", pts, c: HIGHLIGHT, w: 16, hl: true } : { t: "stroke", pts, c, w: width },
      ]);
      if (hint && itemsRef.current.length > 2) setHint(false);
      return;
    }
    if (tool === "line" && l?.t === "line") {
      if (dist(l.a, l.b) < 6) return;
      const next: SketchItem[] = [...itemsRef.current, { t: "line", a: l.a, b: l.b, c, w: Math.max(2.5, width) }];
      // Из вершины точно на сторону под прямым углом — это высота: ставим значок.
      const seg = nearestSegment(l.b, geom, 2 / scale + 1);
      if (l.snapA && seg && dist(seg.seg[0], l.a) > 3 && dist(seg.seg[1], l.a) > 3) {
        const d1 = sub(l.b, l.a), d2 = sub(seg.seg[1], seg.seg[0]);
        if (Math.abs(90 - angleBetween(d1, d2)) < 5) {
          next.push(rightMark(l.b, l.a, seg.seg, c));
          setToast("Прилипло к вершине и стороне — это высота");
        } else if (Math.abs(seg.t - 0.5) < 0.04) {
          setToast("Конец на середине стороны — это медиана");
        }
      }
      commit(next);
      return;
    }
    if (tool === "text" && isTap) {
      const s = snapPoint(p, geom, snapR * 0.6);
      setTextEdit({ p: s.kind === "vertex" ? [s.p[0] + 8, s.p[1] - 14] : p, value: "" });
      return;
    }
    if (tool === "stamp") {
      if (stamp === "circle" && l?.t === "circle") {
        if (l.r > 4) commit([...itemsRef.current, { t: "circle", o: l.o, r: l.r, c, w: Math.max(2.5, width) }]);
        return;
      }
      if (isTap) placeStamp(p);
    }
  }

  function rightMark(at: Pt, from: Pt, seg: [Pt, Pt], c: string): SketchItem {
    const u = norm(sub(from, at));
    let v = norm(sub(seg[1], seg[0]));
    // значок — с той стороны основания, где ближе конец стороны
    if (dist(seg[1], at) < dist(seg[0], at)) v = [-v[0], -v[1]];
    return { t: "right", p: at, u, v, c };
  }

  function placeStamp(p: Pt) {
    const c = color;
    const all = itemsRef.current;
    const tapR = 26 / scale;
    if (stamp === "tick1" || stamp === "tick2") {
      const s = nearestSegment(p, geom, tapR);
      if (!s) return setToast("Тапни ближе к стороне");
      const d = sub(s.seg[1], s.seg[0]);
      commit([...all, { t: "tick", p: s.q, ang: Math.atan2(d[1], d[0]), n: stamp === "tick1" ? 1 : 2, c }]);
      return;
    }
    if (stamp === "right" || stamp === "arc") {
      const v = nearestVertex(p, geom, 48 / scale);
      if (!v) return setToast("Тапни внутри угла рядом с вершиной");
      const corner = cornerAt(v, p, geom);
      if (!corner) return setToast("У этой точки нет двух сторон");
      commit([...all, { t: stamp, p: v, u: corner.u, v: corner.w, c }]);
      return;
    }
    if (stamp === "dot") {
      const s = snapPoint(p, geom, snapR);
      commit([...all, { t: "dot", p: s.p, c }]);
      setTextEdit({ p: [s.p[0] + 8, s.p[1] - 14], value: "" });
      return;
    }
    // высота / медиана / биссектриса: вершина, потом сторона
    if (!cevianFrom) {
      const v = nearestVertex(p, geom, tapR);
      if (!v) return setToast("Сначала тапни вершину");
      setCevianFrom(v);
      setToast("Теперь тапни противоположную сторону");
      return;
    }
    const s = nearestSegment(p, geom, tapR);
    if (!s) return setToast("Тапни по стороне");
    if (dist(s.seg[0], cevianFrom) < 3 || dist(s.seg[1], cevianFrom) < 3) return setToast("Нужна сторона напротив вершины");
    const k = stamp as "height" | "median" | "bisector";
    const foot = cevian(k, cevianFrom, s.seg[0], s.seg[1]);
    const next: SketchItem[] = [...all, { t: "line", a: cevianFrom, b: foot, c, w: 2.5 }];
    if (k === "height") next.push(rightMark(foot, cevianFrom, s.seg, c));
    if (k === "median") {
      const d = sub(s.seg[1], s.seg[0]);
      const ang = Math.atan2(d[1], d[0]);
      next.push({ t: "tick", p: [(s.seg[0][0] + foot[0]) / 2, (s.seg[0][1] + foot[1]) / 2], ang, n: 1, c });
      next.push({ t: "tick", p: [(s.seg[1][0] + foot[0]) / 2, (s.seg[1][1] + foot[1]) / 2], ang, n: 1, c });
    }
    if (k === "bisector") {
      const u = norm(sub(s.seg[0], cevianFrom)), w = norm(sub(s.seg[1], cevianFrom)), m = norm(sub(foot, cevianFrom));
      next.push({ t: "arc", p: cevianFrom, u, v: m, c }, { t: "arc", p: cevianFrom, u: m, v: w, c });
    }
    commit(next);
    setCevianFrom(null);
    setToast(k === "height" ? "Высота построена" : k === "median" ? "Медиана построена" : "Биссектриса построена");
  }

  function finishText() {
    if (textEdit && textEdit.value.trim()) {
      commit([...itemsRef.current, { t: "text", p: textEdit.p, s: textEdit.value.trim().slice(0, 40), c: color }]);
    }
    setTextEdit(null);
  }

  function chooseTool(t: Tool) {
    setCevianFrom(null);
    if (t !== "select") setSelected([]);
    if (t === "stamp") setPopover(tool === "stamp" && popover === "stamps" ? null : "stamps");
    else setPopover(null);
    setTool(t);
  }

  // ----------------------------------------------------------- выделение

  const validSel = selected.filter((i) => i < items.length);

  function deleteSelected() {
    const set = new Set(selectedRef.current);
    if (!set.size) return;
    commit(itemsRef.current.filter((_, i) => !set.has(i)));
    setSelected([]);
  }

  /** Вставить элементы со сдвигом и выделить вставленное. */
  function pasteItems(src: SketchItem[], offset = 18) {
    if (!src.length) return;
    const copies = src.map((it) => translateItem(it, offset, offset));
    const base = itemsRef.current;
    commit([...base, ...copies]);
    setSelected(copies.map((_, k) => base.length + k));
    setTool("select");
  }

  function duplicateSelected() {
    const cur = itemsRef.current;
    pasteItems(selectedRef.current.filter((i) => i < cur.length).map((i) => cur[i]));
  }

  // Клавиши на компьютере. Раскладку не проверяем по e.key: в русской
  // раскладке Ctrl+Z приходит как «я» — смотрим на физическую клавишу (e.code).
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement | null;
    const typing = el?.tagName === "INPUT" || el?.tagName === "TEXTAREA";
    const mod = e.ctrlKey || e.metaKey;
    // Масштаб страницы браузера (Ctrl +/−/0) — масштабируем лист.
    if (mod && ["Equal", "NumpadAdd", "Minus", "NumpadSubtract", "Digit0", "Numpad0"].includes(e.code)) {
      e.preventDefault();
      const r = viewportRef.current?.getBoundingClientRect();
      if (!r) return;
      const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      if (e.code === "Digit0" || e.code === "Numpad0") setView(clampView({ x: 0, y: 0, z: 1 }));
      else zoomAt(viewRef.current.z * (e.code === "Equal" || e.code === "NumpadAdd" ? 1.25 : 0.8), cx, cy);
      return;
    }
    if (typing) return;
    if (e.key === "Escape") {
      if (selectedRef.current.length) setSelected([]);
      else onClose();
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
    if (mod && e.code === "KeyC" && selectedRef.current.length) {
      e.preventDefault();
      const cur = itemsRef.current;
      clipboard.current = selectedRef.current.filter((i) => i < cur.length).map((i) => cur[i]);
      setToast("Скопировано — Ctrl+V, чтобы вставить");
      return;
    }
    if (mod && e.code === "KeyV" && clipboard.current.length) {
      e.preventDefault();
      pasteItems(clipboard.current);
      clipboard.current = clipboard.current.map((it) => translateItem(it, 18, 18));
      return;
    }
    if (mod && e.code === "KeyD" && selectedRef.current.length) {
      e.preventDefault();
      duplicateSelected();
      return;
    }
    if (mod && e.code === "KeyA") {
      e.preventDefault();
      setTool("select");
      setSelected(itemsRef.current.map((_, i) => i));
      return;
    }
    if ((e.key === "Delete" || e.key === "Backspace") && selectedRef.current.length) {
      e.preventDefault();
      deleteSelected();
      return;
    }
    if (mod || e.altKey) return;
    // Быстрый выбор инструмента: V — выбор, P — ручка, L — линейка, T — текст, E — ластик.
    const tools: Record<string, Tool> = { KeyV: "select", KeyP: "pen", KeyL: "line", KeyT: "text", KeyE: "eraser" };
    if (tools[e.code]) chooseTool(tools[e.code]);
  };
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  async function submitAnswer() {
    if (!answerBar || answerState === "pending") return;
    setAnswerState("pending");
    const r = await answerBar.onSubmit();
    if (r === "correct") onClose();
    else setAnswerState(r === "wrong" ? "wrong" : "idle");
  }

  // ----------------------------------------------------------- разметка

  const itemsSvg = useMemo(() => items.map(itemMarkup).join(""), [items]);
  const liveSvg = (() => {
    if (!live) return "";
    if (live.t === "stroke")
      return highlight
        ? `<path d="${strokePath(live.pts)}" fill="none" stroke="${HIGHLIGHT}" stroke-opacity="0.45" stroke-width="16" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<path d="${strokePath(live.pts)}" fill="none" stroke="${color}" stroke-width="${width}" stroke-linecap="round" stroke-linejoin="round"/>`;
    if (live.t === "line") {
      const ring = (q: Pt) => `<circle cx="${q[0]}" cy="${q[1]}" r="${9 / scale}" fill="#16B3A6" fill-opacity="0.18" stroke="#16B3A6" stroke-width="${2 / scale}"/>`;
      return (
        `<line x1="${live.a[0]}" y1="${live.a[1]}" x2="${live.b[0]}" y2="${live.b[1]}" stroke="${color}" stroke-width="${Math.max(2.5, width)}" stroke-linecap="round" stroke-dasharray="${8 / scale} ${6 / scale}"/>` +
        (live.snapA ? ring(live.a) : "") +
        (live.snapB ? ring(live.b) : "")
      );
    }
    return `<circle cx="${live.o[0]}" cy="${live.o[1]}" r="${live.r}" fill="none" stroke="${color}" stroke-width="2.5" stroke-dasharray="${8 / scale} ${6 / scale}"/><circle cx="${live.o[0]}" cy="${live.o[1]}" r="3" fill="${color}"/>`;
  })();
  const selBox = tool === "select" ? unionBBox(validSel.map((i) => items[i])) : null;
  const selectSvg =
    (selBox
      ? `<rect x="${selBox.x0 - 6}" y="${selBox.y0 - 6}" width="${selBox.x1 - selBox.x0 + 12}" height="${selBox.y1 - selBox.y0 + 12}" rx="${6 / scale}" fill="#16B3A6" fill-opacity="0.06" stroke="#16B3A6" stroke-width="${2 / scale}" stroke-dasharray="${6 / scale} ${4 / scale}"/>`
      : "") +
    (marquee
      ? `<rect x="${Math.min(marquee.a[0], marquee.b[0])}" y="${Math.min(marquee.a[1], marquee.b[1])}" width="${Math.abs(marquee.b[0] - marquee.a[0])}" height="${Math.abs(marquee.b[1] - marquee.a[1])}" fill="#2F6FDB" fill-opacity="0.07" stroke="#2F6FDB" stroke-width="${1.5 / scale}" stroke-dasharray="${5 / scale} ${4 / scale}"/>`
      : "");
  const cevianSvg = cevianFrom
    ? `<circle cx="${cevianFrom[0]}" cy="${cevianFrom[1]}" r="${12 / scale}" fill="#16B3A6" fill-opacity="0.2" stroke="#16B3A6" stroke-width="${2.5 / scale}"/>`
    : "";

  const stampHint =
    tool === "stamp"
      ? STAMPS.find((s) => s.k === stamp)?.hint
      : tool === "select" && !validSel.length
        ? desktop
          ? "Кликни фигуру или обведи рамкой. Alt + перетаскивание — копия"
          : "Тапни фигуру или обведи рамкой — потом тяни"
        : null;
  const iconBtn =
    "flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] text-ink-soft transition hover:bg-paper disabled:opacity-30";
  const toolBtn = (active: boolean) =>
    `flex h-12 w-[42px] min-[400px]:w-12 shrink-0 items-center justify-center rounded-[14px] transition ${
      active ? "bg-pine text-white" : "bg-[#F0F6F2] text-ink-soft hover:bg-pine-light"
    }`;

  const modal = (
    <div className="fixed inset-0 z-[60] flex flex-col bg-white text-ink" style={{ paddingTop: "var(--app-sat)" }}>
      {/* шапка */}
      <header className="flex h-14 shrink-0 items-center gap-1 border-b border-line-soft px-2">
        <button type="button" onClick={onClose} aria-label="Свернуть черновик (пометки сохранятся)" className={iconBtn}>
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
        </button>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] font-black leading-tight">Черновик</p>
          <p className="flex items-center gap-1 truncate text-[11px] font-bold text-pine-dark">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
            <span className="truncate">{items.length ? "сохранено" : "сохраняется само"}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={undo}
          disabled={!past.current.length}
          title={desktop ? "Отменить (Ctrl+Z)" : undefined}
          className="flex h-10 shrink-0 items-center gap-1.5 rounded-pill border-2 border-line bg-white pl-2.5 pr-3.5 text-[13px] font-extrabold text-ink transition hover:border-pine disabled:opacity-35"
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>
          Отменить
        </button>
        <button type="button" onClick={redo} disabled={!future.current.length} aria-label="Вернуть" title={desktop ? "Вернуть (Ctrl+Shift+Z)" : undefined} className={iconBtn}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 14 5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg>
        </button>
      </header>

      {/* условие */}
      {problemText && (
        <button
          type="button"
          aria-expanded={condOpen}
          onClick={() => setCondOpen((o) => !o)}
          className="flex shrink-0 items-start gap-2 border-b border-line-soft bg-paper px-4 py-2.5 text-left"
        >
          {egeNumber && (
            <span className="mt-0.5 shrink-0 rounded-pill bg-amber-light px-2 py-0.5 text-[11px] font-black text-amber-text">№{egeNumber}</span>
          )}
          <span className={`min-w-0 flex-1 text-[13px] font-bold leading-snug text-ink-soft ${condOpen ? "whitespace-pre-wrap text-[15px] text-ink" : "truncate"}`}>
            {problemText}
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" className={`mt-0.5 shrink-0 text-ink-soft transition ${condOpen ? "rotate-180" : ""}`}><path d="m6 9 6 6 6-6" /></svg>
        </button>
      )}

      {/* лист */}
      <div
        ref={viewportRef}
        className="relative min-h-0 flex-1 touch-none select-none overflow-hidden bg-[#EEF4F0]"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{ cursor: tool === "eraser" ? "cell" : tool === "select" ? (dragRef.current?.moved ? "grabbing" : "default") : "crosshair" }}
      >
        <div
          ref={worldRef}
          className="absolute left-0 top-0 origin-top-left shadow-[0_0_0_1px_#DCE8E1]"
          style={{
            width: WORLD_W,
            height: H,
            transform: `translate(${view.x}px, ${view.y}px) scale(${scale})`,
            backgroundColor: "#FFFFFF",
            backgroundImage: "linear-gradient(#E6EFEA 1px, transparent 1px), linear-gradient(90deg, #E6EFEA 1px, transparent 1px)",
            backgroundSize: "22px 22px",
          }}
        >
          {spec && (
            <div
              ref={diagramRef}
              className="pointer-events-none absolute"
              style={{ left: DIAGRAM_BOX.x, top: DIAGRAM_BOX.y, width: DIAGRAM_BOX.w, height: DIAGRAM_BOX.h }}
            >
              <DiagramRenderer spec={spec} />
            </div>
          )}
          <svg
            className="pointer-events-none absolute left-0 top-0"
            width={WORLD_W}
            height={H}
            viewBox={`0 0 ${WORLD_W} ${H}`}
            dangerouslySetInnerHTML={{ __html: itemsSvg + liveSvg + cevianSvg + selectSvg }}
          />
          {textEdit && (
            <input
              autoFocus
              value={textEdit.value}
              maxLength={40}
              onChange={(e) => setTextEdit({ ...textEdit, value: e.target.value })}
              onKeyDown={(e) => {
                if (e.key === "Enter") finishText();
                if (e.key === "Escape") setTextEdit(null);
              }}
              onBlur={finishText}
              onPointerDown={(e) => e.stopPropagation()}
              aria-label="Подпись"
              placeholder="x, 30°, A…"
              className="absolute rounded-md border-2 border-[#16B3A6] bg-white/95 px-1.5 font-display font-extrabold outline-none"
              style={{ left: textEdit.p[0], top: textEdit.p[1] - 14, width: 110, height: 28, fontSize: 18, color }}
            />
          )}
        </div>

        {/* масштаб: тап — вернуть 100% */}
        <button
          type="button"
          onPointerDown={(e) => e.stopPropagation()}
          onClick={() => setView(clampView({ x: 0, y: 0, z: 1 }))}
          aria-label="Вернуть масштаб 100%"
          className="absolute right-3 top-3 flex h-8 items-center gap-1.5 rounded-pill bg-ink/80 px-3 text-[12px] font-extrabold text-white"
        >
          {Math.round(view.z * 100)}%
        </button>

        {tool === "select" && validSel.length > 0 && (
          <div
            role="toolbar"
            aria-label="Выделенное"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute left-3 top-3 flex items-center gap-1 rounded-[16px] border border-line-soft bg-white p-1 shadow-[0_8px_24px_rgba(19,42,32,0.14)]"
          >
            <span className="px-2 text-[12px] font-extrabold text-ink-soft">Выделено: {validSel.length}</span>
            <button type="button" onClick={duplicateSelected} title={desktop ? "Копия (Ctrl+D)" : undefined} className="h-9 rounded-[12px] px-3 text-[13px] font-extrabold text-pine-dark hover:bg-pine-light">
              Копия
            </button>
            <button type="button" onClick={deleteSelected} title={desktop ? "Удалить (Delete)" : undefined} className="h-9 rounded-[12px] px-3 text-[13px] font-extrabold text-coral hover:bg-coral-light">
              Удалить
            </button>
            <button type="button" onClick={() => setSelected([])} aria-label="Снять выделение" className="flex h-9 w-9 items-center justify-center rounded-[12px] text-ink-soft hover:bg-paper">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" aria-hidden><path d="M6 6l12 12M18 6 6 18" /></svg>
            </button>
          </div>
        )}

        {(toast || stampHint || cevianFrom) && (
          <div role="status" className="pointer-events-none absolute bottom-3 left-1/2 max-w-[90%] -translate-x-1/2 rounded-[14px] bg-[#0E8C82] px-3.5 py-2 text-center text-[12px] font-extrabold text-white shadow-lg">
            {toast ?? (cevianFrom ? "Теперь тапни противоположную сторону" : stampHint)}
          </div>
        )}

        {hint && !(toast || stampHint || cevianFrom) && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-pill border border-line-soft bg-white/95 px-3.5 py-2 text-[12px] font-bold text-ink-soft">
            {desktop
              ? "Мышь — пишет · Ctrl + колесо — масштаб · Shift — ровная линия"
              : stylusOnly
                ? "Стилус — пишет, палец — двигает лист"
                : "Один палец — пишешь, два — двигаешь и приближаешь"}
          </div>
        )}

        {/* значки */}
        {popover === "stamps" && (
          <div
            role="dialog"
            aria-label="Значки"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute inset-x-3 bottom-3 rounded-[20px] border border-line-soft bg-white p-3 shadow-[0_12px_32px_rgba(19,42,32,0.16)]"
          >
            <p className="mb-2 text-[11px] font-black uppercase tracking-wide text-ink-soft">Значки — потом тапни по чертежу</p>
            <div className="grid grid-cols-3 gap-2">
              {STAMPS.map((s) => (
                <button
                  key={s.k}
                  type="button"
                  aria-pressed={stamp === s.k}
                  onClick={() => {
                    setStamp(s.k);
                    setCevianFrom(null);
                    setPopover(null);
                  }}
                  className={`flex h-[58px] flex-col items-center justify-center gap-1 rounded-[14px] border text-[11px] font-bold ${
                    stamp === s.k ? "border-2 border-pine bg-pine-light/60 text-pine-dark" : "border-line-soft bg-white text-ink-soft"
                  }`}
                >
                  <StampIcon k={s.k} />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* цвет и толщина */}
        {popover === "pen" && (
          <div
            role="dialog"
            aria-label="Цвет и толщина"
            onPointerDown={(e) => e.stopPropagation()}
            className="absolute bottom-3 right-3 flex w-[272px] flex-col gap-3 rounded-[20px] border border-line-soft bg-white p-3.5 shadow-[0_12px_32px_rgba(19,42,32,0.16)]"
          >
            <p className="text-[11px] font-black uppercase tracking-wide text-ink-soft">Цвет</p>
            <div className="flex gap-2.5">
              {COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  aria-label={c.label}
                  aria-pressed={!highlight && color === c.hex}
                  onClick={() => {
                    setColor(c.hex);
                    setHighlight(false);
                  }}
                  className="h-10 w-10 rounded-full"
                  style={{ background: c.hex, boxShadow: !highlight && color === c.hex ? `0 0 0 3px #fff, 0 0 0 5px ${c.hex}` : undefined }}
                />
              ))}
              <button
                type="button"
                aria-label="Маркер"
                aria-pressed={highlight}
                onClick={() => {
                  setHighlight(true);
                  setTool("pen");
                }}
                className={`flex h-10 w-10 items-center justify-center rounded-[12px] border bg-[#FFF6CC] ${highlight ? "border-2 border-pine" : "border-line-soft"}`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#8A6A00" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" /></svg>
              </button>
            </div>
            <p className="text-[11px] font-black uppercase tracking-wide text-ink-soft">Толщина</p>
            <div className="grid grid-cols-3 gap-2">
              {WIDTHS.map((w) => (
                <button
                  key={w.w}
                  type="button"
                  aria-label={w.label}
                  aria-pressed={width === w.w}
                  onClick={() => setWidth(w.w)}
                  className={`flex h-11 items-center justify-center rounded-[12px] border ${width === w.w ? "border-2 border-pine bg-pine-light/60" : "border-line-soft"}`}
                >
                  <span className="w-9 rounded-full bg-ink" style={{ height: w.w }} />
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
              {confirmClear ? "Точно очистить? Нажми ещё раз" : "Очистить лист"}
            </button>
          </div>
        )}
      </div>

      {/* ответ */}
      {answerBar && !answerBar.disabled && (
        <div className="flex shrink-0 items-center gap-2 border-t border-line-soft bg-white px-3 pt-2.5">
          {answerBar.detailed ? (
            <button type="button" onClick={onClose} className="btn-primary h-12 w-full">
              К развёрнутому ответу
            </button>
          ) : (
            <>
              <label htmlFor="sketch-answer" className="text-[13px] font-extrabold text-ink-soft">
                Ответ
              </label>
              <input
                id="sketch-answer"
                inputMode="decimal"
                autoComplete="off"
                value={answerBar.value}
                onChange={(e) => {
                  answerBar.onChange(e.target.value);
                  if (answerState === "wrong") setAnswerState("idle");
                }}
                onKeyDown={(e) => e.key === "Enter" && submitAnswer()}
                className={`h-12 min-w-0 flex-1 rounded-[14px] border-2 px-3.5 font-display text-[20px] font-black outline-none ${
                  answerState === "wrong" ? "animate-shake border-coral bg-coral-light/40" : "border-line bg-[#F7FBF9] focus:border-pine"
                }`}
              />
              <button
                type="button"
                onClick={submitAnswer}
                disabled={!answerBar.value.trim() || answerState === "pending"}
                className="h-12 shrink-0 rounded-[14px] bg-pine px-4 text-[15px] font-black text-white shadow-[0_3px_0_#13804F] disabled:opacity-50"
              >
                {answerState === "pending" ? "…" : answerState === "wrong" ? "Ещё раз" : "Проверить"}
              </button>
            </>
          )}
        </div>
      )}

      {/* инструменты */}
      <nav aria-label="Инструменты" className="flex shrink-0 items-center gap-1 px-3 min-[400px]:gap-1.5 pt-2.5" style={{ paddingBottom: "max(14px, var(--app-sab))" }}>
        <button type="button" aria-label="Выбор: двигать и копировать" title={desktop ? "Выбор — двигать и копировать (V)" : undefined} aria-pressed={tool === "select"} onClick={() => chooseTool("select")} className={toolBtn(tool === "select")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M5 3l14 7-6 2-2 6z" /></svg>
        </button>
        <button type="button" aria-label="Ручка" title={desktop ? "Ручка (P), с Shift — ровная линия" : undefined} aria-pressed={tool === "pen"} onClick={() => chooseTool("pen")} className={toolBtn(tool === "pen")}>
          {highlight ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 11-6 6v3h9l3-3" /><path d="m22 12-4.6 4.6a2 2 0 0 1-2.8 0l-5.2-5.2a2 2 0 0 1 0-2.8L14 4" /></svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" /></svg>
          )}
        </button>
        <button type="button" aria-label="Линейка" title={desktop ? "Линейка (L), с Shift — шаг 15°" : undefined} aria-pressed={tool === "line"} onClick={() => chooseTool("line")} className={toolBtn(tool === "line")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2.5" y="8" width="19" height="8" rx="1.5" transform="rotate(-35 12 12)" /><path d="m8 15.5-1-1.5M10.5 13.8l-1.6-2.3M13 12l-1-1.5M15.5 10.3l-1.6-2.3" /></svg>
        </button>
        <button type="button" aria-label="Текст" aria-pressed={tool === "text"} onClick={() => chooseTool("text")} className={`${toolBtn(tool === "text")} font-display text-[18px] font-black`}>
          Aa
        </button>
        <button type="button" aria-label="Значки" aria-pressed={tool === "stamp"} aria-expanded={popover === "stamps"} onClick={() => chooseTool("stamp")} className={toolBtn(tool === "stamp")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 20V5" /><path d="M4 20h15" /><path d="M4 14h6v6" /></svg>
        </button>
        <button type="button" aria-label="Ластик" title={desktop ? "Ластик (E)" : undefined} aria-pressed={tool === "eraser"} onClick={() => chooseTool("eraser")} className={toolBtn(tool === "eraser")}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21z" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>
        </button>
        <div className="flex-1" />
        <button
          type="button"
          aria-label="Цвет и толщина"
          aria-expanded={popover === "pen"}
          onClick={() => setPopover(popover === "pen" ? null : "pen")}
          className={`flex h-12 w-11 shrink-0 items-center justify-center rounded-[14px] border-2 min-[400px]:w-12 ${popover === "pen" ? "border-pine bg-pine-light/60" : "border-line bg-white"}`}
        >
          <span className="h-6 w-6 rounded-full" style={{ background: highlight ? HIGHLIGHT : color }} />
        </button>
      </nav>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}

function StampIcon({ k }: { k: Stamp }) {
  const p = { width: 22, height: 22, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 2.1, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  switch (k) {
    case "tick1":
      return <svg {...p}><path d="M2 12h20" /><path d="M13 6l-2 12" stroke="#E2474C" /></svg>;
    case "tick2":
      return <svg {...p}><path d="M2 12h20" /><path d="M10 6l-2 12M16 6l-2 12" stroke="#E2474C" /></svg>;
    case "right":
      return <svg {...p}><path d="M4 3v17h17" /><path d="M4 13h7v7" /></svg>;
    case "arc":
      return <svg {...p}><path d="M3 20h18M3 20 16 5" /><path d="M11 20a8 8 0 0 0-2.4-5.7" stroke="#13804F" /></svg>;
    case "circle":
      return <svg {...p}><circle cx="12" cy="12" r="9" /><circle cx="12" cy="12" r="1.6" fill="currentColor" /></svg>;
    case "dot":
      return <svg {...p}><circle cx="9" cy="14" r="2.6" fill="currentColor" /><path d="M15 6h6M18 3v6" /></svg>;
    case "height":
      return <svg {...p}><path d="M2 20h20M12 4v16" /><path d="M12 16h4v4" /></svg>;
    case "median":
      return <svg {...p}><path d="M2 20h20M6 4l6 16" /><path d="M6 18l1 4M17 18l1 4" stroke="#E2474C" /></svg>;
    case "bisector":
      return <svg {...p}><path d="M3 20h18M3 20 15 4M3 20l18-8" /><path d="M9 20a6 6 0 0 0-1-4" stroke="#13804F" /></svg>;
  }
}
