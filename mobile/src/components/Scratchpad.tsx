import { forwardRef, useCallback, useEffect, useMemo, useRef, useState, type ComponentRef, type ReactNode } from "react";
import {
  Keyboard,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  View,
  type GestureResponderEvent,
  type LayoutChangeEvent,
} from "react-native";
import Svg, { Circle, Line, Path, Rect, SvgXml } from "react-native-svg";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withSequence, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import * as Haptics from "expo-haptics";
import { C, F, R } from "@/theme";
import { T } from "./ui";
import { Confetti } from "./motion";
import {
  DIAGRAM_BOX,
  WORLD_W,
  angleBetween,
  bboxIntersects,
  cevian,
  contentBottom,
  cornerAt,
  dist,
  emptyGeometry,
  geometryFromSvg,
  hitItem,
  itemBBox,
  itemMarkup,
  loadSketch,
  nearestSegment,
  nearestVertex,
  norm,
  saveSketch,
  snapPoint,
  strokePath,
  sub,
  translateItem,
  unionBBox,
  withUserGeometry,
  type Geometry,
  type Pt,
  type SketchItem,
} from "@/lib/sketch";

/**
 * Черновик в приложении — как на сайте (components/diagrams/DiagramScratchpad):
 * лист в клетку на весь экран, чертёж задачи сверху.
 *  • Один палец рисует, два — двигают и приближают лист, короткий тап
 *    двумя пальцами — отменить. Второй палец во время штриха (ладонь) не
 *    рисует.
 *  • Линейка и значки прилипают к вершинам и сторонам чертежа; из вершины
 *    строятся высота, медиана, биссектриса.
 *  • Рисунок сохраняется у каждой задачи на телефоне.
 *  • Внизу — поле ответа: решил и ответил, не закрывая черновик.
 */

type Tool = "pen" | "line" | "stamp" | "text" | "eraser" | "select";
type Stamp = "tick1" | "tick2" | "right" | "arc" | "circle" | "dot" | "height" | "median" | "bisector";
type Live =
  | { t: "stroke"; pts: number[] }
  | { t: "line"; a: Pt; b: Pt; snapA: boolean; snapB: boolean }
  | { t: "circle"; o: Pt; r: number }
  | null;
type ViewT = { x: number; y: number; z: number };

const COLORS = ["#132A20", "#E2474C", "#2F6FDB", "#0E8C82"];
const HIGHLIGHT = "#FFD24A";
const WIDTHS = [2, 3.5, 6];
const STAMPS: { k: Stamp; label: string; hint: string }[] = [
  { k: "tick1", label: "Равные |", hint: "Нажми по стороне" },
  { k: "tick2", label: "Равные ||", hint: "Нажми по стороне" },
  { k: "right", label: "Прямой угол", hint: "Нажми внутри угла у вершины" },
  { k: "arc", label: "Дуга угла", hint: "Нажми внутри угла у вершины" },
  { k: "circle", label: "Окружность", hint: "Поставь центр и тяни радиус" },
  { k: "dot", label: "Точка", hint: "Нажми и подпиши букву" },
  { k: "height", label: "Высота", hint: "Нажми вершину, потом сторону" },
  { k: "median", label: "Медиана", hint: "Нажми вершину, потом сторону" },
  { k: "bisector", label: "Биссектриса", hint: "Нажми вершину, потом сторону" },
];

export type AnswerBar = {
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => Promise<"correct" | "wrong" | "other">;
  detailed: boolean;
  disabled: boolean;
};

function vbOf(svg: string): [number, number, number, number] {
  const m = /viewBox="([\d.\s-]+)"/.exec(svg);
  const v = m ? m[1].trim().split(/\s+/).map(Number) : [0, 0, 300, 200];
  return [v[0] ?? 0, v[1] ?? 0, v[2] || 300, v[3] || 200];
}

/** Где чертёж стоит на листе: вписан в DIAGRAM_BOX с сохранением пропорций. */
export function diagramPlacement(svg: string) {
  const [vx, vy, vw, vh] = vbOf(svg);
  const s = Math.min(DIAGRAM_BOX.w / vw, DIAGRAM_BOX.h / vh);
  const w = vw * s, h = vh * s;
  const x = DIAGRAM_BOX.x + (DIAGRAM_BOX.w - w) / 2;
  const y = DIAGRAM_BOX.y + (DIAGRAM_BOX.h - h) / 2;
  return { x, y, w, h, toWorld: (px: number, py: number): Pt => [x + (px - vx) * s, y + (py - vy) * s] };
}

const GRID = (h: number) =>
  `<svg viewBox="0 0 ${WORLD_W} ${h}"><defs><pattern id="g" width="22" height="22" patternUnits="userSpaceOnUse"><path d="M22 0H0V22" fill="none" stroke="#E3EEE8" stroke-width="1"/></pattern></defs><rect width="${WORLD_W}" height="${h}" fill="#fff"/><rect width="${WORLD_W}" height="${h}" fill="url(#g)"/></svg>`;

/**
 * Неподвижный лист (без жестов) — для превью «приложить черновик к вопросу»:
 * из него делается снимок JPEG.
 */
export type ViewRef = ComponentRef<typeof View>;

export const SketchSheet = forwardRef<ViewRef, { items: SketchItem[]; diagramSvg: string | null; width: number }>(function SketchSheet(
  { items, diagramSvg, width },
  ref
) {
  const H = Math.max(diagramSvg ? DIAGRAM_BOX.y + DIAGRAM_BOX.h : 0, contentBottom(items)) + 24;
  const k = width / WORLD_W;
  const place = diagramSvg ? diagramPlacement(diagramSvg) : null;
  return (
    <View ref={ref} collapsable={false} style={{ width, height: H * k, backgroundColor: "#fff" }}>
      <SvgXml xml={GRID(H)} width={width} height={H * k} style={{ position: "absolute" }} />
      {place && diagramSvg ? (
        <View style={{ position: "absolute", left: place.x * k, top: place.y * k, width: place.w * k, height: place.h * k }}>
          <SvgXml xml={diagramSvg} width="100%" height="100%" />
        </View>
      ) : null}
      <SvgXml xml={`<svg viewBox="0 0 ${WORLD_W} ${H}">${items.map(itemMarkup).join("")}</svg>`} width={width} height={H * k} style={{ position: "absolute" }} />
    </View>
  );
});

export default function Scratchpad({
  problemId,
  diagramSvg,
  problemText,
  onClose,
  onChange,
  answerBar,
}: {
  problemId: string;
  diagramSvg: string | null;
  problemText: string;
  onClose: () => void;
  onChange?: (hasSketch: boolean) => void;
  answerBar?: AnswerBar;
}) {
  const insets = useSafeAreaInsets();
  const [items, setItems] = useState<SketchItem[]>([]);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const past = useRef<SketchItem[][]>([]);
  const future = useRef<SketchItem[][]>([]);
  const [, force] = useState(0);
  const loaded = useRef(false);

  useEffect(() => {
    let alive = true;
    loadSketch(problemId).then((d) => {
      if (!alive) return;
      if (d) setItems(d.items);
      loaded.current = true;
    });
    return () => {
      alive = false;
    };
  }, [problemId]);

  // Рисунок сохраняется сам — закрыть черновик можно в любой момент.
  useEffect(() => {
    if (!loaded.current) return;
    const t = setTimeout(() => {
      saveSketch(problemId, items, contentBottom(items));
      onChange?.(items.length > 0);
    }, 300);
    return () => clearTimeout(t);
  }, [items, problemId, onChange]);

  const commit = useCallback((next: SketchItem[]) => {
    past.current.push(itemsRef.current);
    if (past.current.length > 200) past.current.shift();
    future.current = [];
    itemsRef.current = next;
    setItems(next);
  }, []);
  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(itemsRef.current);
    itemsRef.current = prev;
    setItems(prev);
    setSelected([]);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(itemsRef.current);
    itemsRef.current = next;
    setItems(next);
    setSelected([]);
  }, []);

  // ---------------------------------------------------------------- вид
  const [vp, setVp] = useState({ w: 360, h: 600 });
  const vpRef = useRef<ViewRef>(null);
  const vpOrigin = useRef({ x: 0, y: 0 });
  const [view, setView] = useState<ViewT>({ x: 0, y: 0, z: 1 });
  const viewRef = useRef(view);
  viewRef.current = view;
  const base = vp.w / WORLD_W;
  const scale = base * view.z;

  const place = useMemo(() => (diagramSvg ? diagramPlacement(diagramSvg) : null), [diagramSvg]);
  const baseGeom = useMemo<Geometry>(() => (diagramSvg && place ? geometryFromSvg(diagramSvg, place.toWorld) : emptyGeometry()), [diagramSvg, place]);
  const geom = useMemo(() => withUserGeometry(baseGeom, items), [baseGeom, items]);
  const worldH = Math.max(vp.h / base + 300, contentBottom(items) + 400, DIAGRAM_BOX.y + DIAGRAM_BOX.h + 400);

  const clampView = useCallback(
    (v: ViewT): ViewT => {
      const z = Math.min(5, Math.max(1, v.z));
      const s = base * z;
      const minX = vp.w - WORLD_W * s;
      const minY = Math.min(0, vp.h - worldH * s);
      return { z, x: Math.min(0, Math.max(minX, v.x)), y: Math.min(0, Math.max(minY, v.y)) };
    },
    [base, vp.w, vp.h, worldH]
  );

  function onLayout(e: LayoutChangeEvent) {
    const { width, height } = e.nativeEvent.layout;
    setVp({ w: width, h: height });
    vpRef.current?.measureInWindow((x, y) => (vpOrigin.current = { x, y }));
  }

  const toWorld = (pageX: number, pageY: number): Pt => {
    const v = viewRef.current;
    const s = base * v.z;
    return [(pageX - vpOrigin.current.x - v.x) / s, (pageY - vpOrigin.current.y - v.y) / s];
  };

  // --------------------------------------------------------- инструменты
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0]);
  const [width, setWidth] = useState(WIDTHS[1]);
  const [highlight, setHighlight] = useState(false);
  const [stamp, setStamp] = useState<Stamp>("tick1");
  const [popover, setPopover] = useState<"pen" | "stamps" | null>(null);
  const [live, setLive] = useState<Live>(null);
  const liveRef = useRef<Live>(null);
  const [cevianFrom, setCevianFrom] = useState<Pt | null>(null);
  const [textEdit, setTextEdit] = useState<{ p: Pt; value: string } | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const dragRef = useRef<{ start: Pt; base: SketchItem[]; sel: number[]; moved: boolean } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showText, setShowText] = useState(false);
  const snapR = 22 / scale;

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 1800);
    return () => clearTimeout(t);
  }, [toast]);

  function setLiveBoth(l: Live) {
    liveRef.current = l;
    setLive(l);
  }

  function itemAt(p: Pt): number {
    const r = 12 / scale;
    const cur = itemsRef.current;
    for (let i = cur.length - 1; i >= 0; i--) if (hitItem(cur[i], p, r)) return i;
    return -1;
  }

  const eraseHit = useRef(false);
  const lastErase = useRef<Pt | null>(null);
  function erase(p: Pt, first: boolean) {
    const r = 12 / scale;
    const from = first || !lastErase.current ? p : lastErase.current;
    lastErase.current = p;
    const steps = Math.max(1, Math.ceil(dist(from, p) / (r / 2)));
    const probes: Pt[] = Array.from({ length: steps + 1 }, (_, i) => [from[0] + ((p[0] - from[0]) * i) / steps, from[1] + ((p[1] - from[1]) * i) / steps] as Pt);
    const cur = itemsRef.current;
    const keep = cur.filter((it) => !probes.some((q) => hitItem(it, q, r)));
    if (keep.length === cur.length) return;
    if (first || !eraseHit.current) commit(keep);
    else {
      itemsRef.current = keep;
      setItems(keep);
    }
    eraseHit.current = true;
  }

  function startTool(p: Pt) {
    if (tool === "select") {
      const hit = itemAt(p);
      if (hit >= 0) {
        const sel = selected.includes(hit) ? selected : [hit];
        dragRef.current = { start: p, base: itemsRef.current, sel, moved: false };
        setSelected(sel);
      } else {
        dragRef.current = null;
        setSelected([]);
        setMarquee({ a: p, b: p });
      }
      return;
    }
    if (tool === "pen") setLiveBoth({ t: "stroke", pts: [p[0], p[1]] });
    else if (tool === "line") {
      const s = snapPoint(p, geom, snapR);
      setLiveBoth({ t: "line", a: s.p, b: s.p, snapA: s.kind !== "free", snapB: false });
    } else if (tool === "eraser") {
      eraseHit.current = false;
      erase(p, true);
    } else if (tool === "stamp" && stamp === "circle") {
      const s = snapPoint(p, geom, snapR);
      setLiveBoth({ t: "circle", o: s.p, r: 0 });
    }
  }

  function moveTool(p: Pt) {
    const l = liveRef.current;
    if (tool === "select") {
      const d = dragRef.current;
      if (d) {
        const dx = p[0] - d.start[0], dy = p[1] - d.start[1];
        if (!d.moved && Math.hypot(dx, dy) < 3 / scale) return;
        const set = new Set(d.sel);
        const next = d.base.map((it, i) => (set.has(i) ? translateItem(it, dx, dy) : it));
        if (!d.moved) {
          d.moved = true;
          commit(next);
        } else {
          itemsRef.current = next;
          setItems(next);
        }
      } else if (marquee) setMarquee({ a: marquee.a, b: p });
      return;
    }
    if (l?.t === "stroke") {
      const n = l.pts.length;
      if (Math.hypot(p[0] - l.pts[n - 2], p[1] - l.pts[n - 1]) < 1.5 / scale) return;
      setLiveBoth({ t: "stroke", pts: [...l.pts, p[0], p[1]] });
    } else if (l?.t === "line") {
      const s = snapPoint(p, geom, snapR);
      setLiveBoth({ ...l, b: s.p, snapB: s.kind !== "free" });
    } else if (l?.t === "circle") setLiveBoth({ ...l, r: dist(l.o, p) });
    else if (tool === "eraser") erase(p, false);
  }

  function cancelTool() {
    setLiveBoth(null);
    setMarquee(null);
    const d = dragRef.current;
    dragRef.current = null;
    if (d?.moved) undo();
  }

  function rightMark(at: Pt, from: Pt, seg: [Pt, Pt], c: string): SketchItem {
    const u = norm(sub(from, at));
    let v = norm(sub(seg[1], seg[0]));
    if (dist(seg[1], at) < dist(seg[0], at)) v = [-v[0], -v[1]];
    return { t: "right", p: at, u, v, c };
  }

  function placeStamp(p: Pt) {
    const c = color;
    const all = itemsRef.current;
    const tapR = 28 / scale;
    if (stamp === "tick1" || stamp === "tick2") {
      const s = nearestSegment(p, geom, tapR);
      if (!s) return setToast("Нажми ближе к стороне");
      const d = sub(s.seg[1], s.seg[0]);
      commit([...all, { t: "tick", p: s.q, ang: Math.atan2(d[1], d[0]), n: stamp === "tick1" ? 1 : 2, c }]);
      return;
    }
    if (stamp === "right" || stamp === "arc") {
      const v = nearestVertex(p, geom, 52 / scale);
      if (!v) return setToast("Нажми внутри угла рядом с вершиной");
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
    if (!cevianFrom) {
      const v = nearestVertex(p, geom, tapR);
      if (!v) return setToast("Сначала нажми вершину");
      setCevianFrom(v);
      setToast("Теперь нажми противоположную сторону");
      return;
    }
    const s = nearestSegment(p, geom, tapR);
    if (!s) return setToast("Нажми по стороне");
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
    Haptics.selectionAsync().catch(() => {});
    setToast(k === "height" ? "Высота построена" : k === "median" ? "Медиана построена" : "Биссектриса построена");
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
        setSelected(itemsRef.current.map((it, i) => (bboxIntersects(itemBBox(it), box) ? i : -1)).filter((i) => i >= 0));
      }
      return;
    }
    if (l?.t === "stroke") {
      const pts = l.pts.length >= 4 ? l.pts : [l.pts[0], l.pts[1], l.pts[0] + 0.01, l.pts[1]];
      commit([...itemsRef.current, highlight ? { t: "stroke", pts, c: HIGHLIGHT, w: 16, hl: true } : { t: "stroke", pts, c, w: width }]);
      return;
    }
    if (l?.t === "line") {
      if (dist(l.a, l.b) < 6) return;
      const next: SketchItem[] = [...itemsRef.current, { t: "line", a: l.a, b: l.b, c, w: Math.max(2.5, width) }];
      const seg = nearestSegment(l.b, geom, 2 / scale + 1);
      if (l.snapA && seg && dist(seg.seg[0], l.a) > 3 && dist(seg.seg[1], l.a) > 3) {
        const d1 = sub(l.b, l.a), d2 = sub(seg.seg[1], seg.seg[0]);
        if (Math.abs(90 - angleBetween(d1, d2)) < 5) {
          next.push(rightMark(l.b, l.a, seg.seg, c));
          setToast("Прилипло к вершине и стороне — это высота");
        } else if (Math.abs(seg.t - 0.5) < 0.04) setToast("Конец на середине стороны — это медиана");
      }
      commit(next);
      return;
    }
    if (l?.t === "circle") {
      if (l.r > 4) commit([...itemsRef.current, { t: "circle", o: l.o, r: l.r, c, w: Math.max(2.5, width) }]);
      return;
    }
    if (tool === "text" && isTap) {
      const s = snapPoint(p, geom, snapR * 0.6);
      setTextEdit({ p: s.kind === "vertex" ? [s.p[0] + 8, s.p[1] - 14] : p, value: "" });
      return;
    }
    if (tool === "stamp" && isTap) placeStamp(p);
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

  // ----------------------------------------------------------- жесты
  type Touch = { id: string; x: number; y: number };
  const touchesOf = (e: GestureResponderEvent): Touch[] =>
    e.nativeEvent.touches.map((t) => ({ id: String(t.identifier), x: t.pageX, y: t.pageY }));
  const mode = useRef<"idle" | "draw" | "gesture" | "ignore">("idle");
  const drawId = useRef<string | null>(null);
  const drawStart = useRef({ t: 0, x: 0, y: 0, moved: 0 });
  const gesture = useRef<{ d: number; cx: number; cy: number; view: ViewT; t: number; moved: number } | null>(null);

  function beginGesture(ts: Touch[]) {
    const [a, b] = ts;
    gesture.current = { d: Math.hypot(a.x - b.x, a.y - b.y) || 1, cx: (a.x + b.x) / 2, cy: (a.y + b.y) / 2, view: viewRef.current, t: Date.now(), moved: 0 };
    mode.current = "gesture";
    drawId.current = null;
  }

  function onStart(e: GestureResponderEvent) {
    const ts = touchesOf(e);
    // Где лист на экране — по первому касанию (окно черновика выезжает
    // анимацией, и замер при открытии бывает устаревшим).
    if (ts.length === 1) {
      const ne = e.nativeEvent;
      vpOrigin.current = { x: ne.pageX - ne.locationX, y: ne.pageY - ne.locationY };
    }
    if (popover) setPopover(null);
    if (textEdit) {
      finishText();
      Keyboard.dismiss();
    }
    if (ts.length === 1 && mode.current === "idle") {
      mode.current = "draw";
      drawId.current = ts[0].id;
      drawStart.current = { t: Date.now(), x: ts[0].x, y: ts[0].y, moved: 0 };
      startTool(toWorld(ts[0].x, ts[0].y));
      return;
    }
    if (ts.length >= 2) {
      // Второй палец сразу после первого — это жест, а не ладонь.
      const fresh = Date.now() - drawStart.current.t < 260 || drawStart.current.moved < 14;
      if (mode.current === "draw" && fresh) {
        cancelTool();
        beginGesture(ts);
      } else if (mode.current !== "draw") beginGesture(ts);
    }
  }

  function onMove(e: GestureResponderEvent) {
    const ts = touchesOf(e);
    if (mode.current === "draw") {
      const t = ts.find((x) => x.id === drawId.current);
      if (!t) return;
      drawStart.current.moved = Math.max(drawStart.current.moved, Math.hypot(t.x - drawStart.current.x, t.y - drawStart.current.y));
      moveTool(toWorld(t.x, t.y));
    } else if (mode.current === "gesture" && gesture.current && ts.length >= 2) {
      const [a, b] = ts;
      const g = gesture.current;
      const d = Math.hypot(a.x - b.x, a.y - b.y) || 1;
      const cx = (a.x + b.x) / 2, cy = (a.y + b.y) / 2;
      g.moved = Math.max(g.moved, Math.abs(d - g.d), Math.hypot(cx - g.cx, cy - g.cy));
      const z = Math.min(5, Math.max(1, g.view.z * (d / g.d)));
      const s0 = base * g.view.z, s1 = base * z;
      const ox = vpOrigin.current.x, oy = vpOrigin.current.y;
      const wx = (g.cx - ox - g.view.x) / s0, wy = (g.cy - oy - g.view.y) / s0;
      setView(clampView({ z, x: cx - ox - wx * s1, y: cy - oy - wy * s1 }));
    }
  }

  function onEnd(e: GestureResponderEvent) {
    const left = touchesOf(e);
    if (mode.current === "draw" && !left.some((t) => t.id === drawId.current)) {
      const ch = e.nativeEvent.changedTouches.find((t) => String(t.identifier) === drawId.current) ?? e.nativeEvent;
      const isTap = drawStart.current.moved < 8 && Date.now() - drawStart.current.t < 450;
      endTool(toWorld(ch.pageX, ch.pageY), isTap);
      drawId.current = null;
      mode.current = left.length ? "ignore" : "idle";
    } else if (mode.current === "gesture" && gesture.current && left.length < 2) {
      const g = gesture.current;
      if (Date.now() - g.t < 280 && g.moved < 12 && past.current.length) {
        undo();
        Haptics.selectionAsync().catch(() => {});
        setToast("Отменено");
      }
      gesture.current = null;
      mode.current = left.length ? "ignore" : "idle";
    }
    if (!left.length) mode.current = "idle";
  }

  // --------------------------------------------------------- ответ
  const [result, setResult] = useState<"correct" | "wrong" | null>(null);
  const [checking, setChecking] = useState(false);
  const [burst, setBurst] = useState(0);
  const shake = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shake.value }] }));
  async function submitAnswer() {
    if (!answerBar || checking) return;
    Keyboard.dismiss();
    setChecking(true);
    const r = await answerBar.onSubmit().catch(() => "other" as const);
    setChecking(false);
    if (r === "correct") {
      setResult("correct");
      setBurst((b) => b + 1);
      setTimeout(onClose, 1300);
    } else if (r === "wrong") {
      setResult("wrong");
      shake.value = withSequence(withTiming(9, { duration: 50 }), withTiming(-8, { duration: 60 }), withTiming(5, { duration: 60 }), withTiming(0, { duration: 60 }));
    }
  }

  // ------------------------------------------------------- отрисовка
  const itemsXml = useMemo(() => `<svg viewBox="0 0 ${WORLD_W} ${worldH}">${items.map(itemMarkup).join("")}</svg>`, [items, worldH]);
  const gridXml = useMemo(() => GRID(worldH), [worldH]);
  const validSel = selected.filter((i) => i < items.length);
  const selBox = tool === "select" ? unionBBox(validSel.map((i) => items[i])) : null;
  const sw = 1 / scale;
  const hint =
    tool === "stamp"
      ? cevianFrom
        ? "Теперь нажми противоположную сторону"
        : STAMPS.find((s) => s.k === stamp)!.hint
      : tool === "line"
        ? "Тяни от вершины — линейка прилипнет к чертежу"
        : tool === "text"
          ? "Нажми, где подписать"
          : tool === "eraser"
            ? "Проведи по пометке, чтобы стереть"
            : tool === "select"
              ? validSel.length
                ? "Тяни, чтобы подвинуть"
                : "Нажми пометку или обведи рамкой"
              : null;

  const ToolBtn = ({ t, label, children }: { t: Tool; label: string; children: ReactNode }) => (
    <Pressable
      accessibilityLabel={label}
      accessibilityState={{ selected: tool === t }}
      onPress={() => chooseTool(t)}
      style={{ width: 44, height: 46, borderRadius: 14, alignItems: "center", justifyContent: "center", backgroundColor: tool === t ? C.pine : "#F0F6F2" }}
    >
      {children}
    </Pressable>
  );
  const ic = (t: Tool) => (tool === t ? "#fff" : C.inkSoft);

  return (
    <Modal visible animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <View style={{ flex: 1, backgroundColor: "#fff", paddingTop: insets.top }}>
        {/* шапка */}
        <View style={{ height: 52, flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 8, borderBottomWidth: 1, borderBottomColor: C.lineSoft }}>
          <Pressable onPress={onClose} accessibilityLabel="Закрыть черновик" hitSlop={8} style={{ width: 42, height: 42, alignItems: "center", justifyContent: "center" }}>
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M6 6l12 12M18 6 6 18" stroke={C.inkSoft} strokeWidth={2.4} strokeLinecap="round" /></Svg>
          </Pressable>
          <Pressable onPress={() => setShowText((v) => !v)} style={{ flex: 1 }}>
            <T w="black" size={16}>Черновик</T>
            <T size={11} color={C.inkSoft} numberOfLines={1}>{showText ? "Скрыть условие" : "Показать условие"}</T>
          </Pressable>
          <Pressable onPress={undo} disabled={!past.current.length} accessibilityLabel="Отменить" style={{ height: 40, paddingHorizontal: 12, borderRadius: 20, borderWidth: 2, borderColor: C.line, flexDirection: "row", alignItems: "center", gap: 6, opacity: past.current.length ? 1 : 0.35 }}>
            <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="M9 14 4 9l5-5M4 9h10.5a5.5 5.5 0 0 1 0 11H11" fill="none" stroke={C.ink} strokeWidth={2.4} strokeLinecap="round" strokeLinejoin="round" /></Svg>
            <T w="extrabold" size={13}>Отменить</T>
          </Pressable>
          <Pressable onPress={redo} disabled={!future.current.length} accessibilityLabel="Вернуть" style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center", opacity: future.current.length ? 1 : 0.3 }}>
            <Svg width={18} height={18} viewBox="0 0 24 24"><Path d="m15 14 5-5-5-5M20 9H9.5a5.5 5.5 0 0 0 0 11H13" fill="none" stroke={C.ink} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </Pressable>
        </View>
        {showText ? (
          <Animated.View entering={FadeIn} exiting={FadeOut} style={{ maxHeight: 160, borderBottomWidth: 1, borderBottomColor: C.lineSoft, backgroundColor: C.paper }}>
            <ScrollView contentContainerStyle={{ padding: 12 }}>
              <T w="semibold" size={15}>{problemText}</T>
            </ScrollView>
          </Animated.View>
        ) : null}

        {/* лист */}
        <View
          ref={vpRef}
          onLayout={onLayout}
          style={{ flex: 1, overflow: "hidden", backgroundColor: "#fff" }}
          onStartShouldSetResponder={() => true}
          onMoveShouldSetResponder={() => true}
          onResponderTerminationRequest={() => false}
          onResponderStart={onStart}
          onResponderGrant={onStart}
          onResponderMove={onMove}
          onResponderEnd={onEnd}
          onResponderRelease={onEnd}
        >
          <View
            pointerEvents="none"
            style={{ position: "absolute", left: 0, top: 0, width: WORLD_W, height: worldH, transform: [{ translateX: view.x }, { translateY: view.y }, { scale }], transformOrigin: "0 0" }}
          >
            <SvgXml xml={gridXml} width={WORLD_W} height={worldH} style={{ position: "absolute" }} />
            {place && diagramSvg ? (
              <View style={{ position: "absolute", left: place.x, top: place.y, width: place.w, height: place.h }}>
                <SvgXml xml={diagramSvg} width="100%" height="100%" />
              </View>
            ) : null}
            <SvgXml xml={itemsXml} width={WORLD_W} height={worldH} style={{ position: "absolute" }} />
            <Svg width={WORLD_W} height={worldH} style={{ position: "absolute" }}>
              {live?.t === "stroke" ? (
                <Path d={strokePath(live.pts)} fill="none" stroke={highlight ? HIGHLIGHT : color} strokeOpacity={highlight ? 0.45 : 1} strokeWidth={highlight ? 16 : width} strokeLinecap="round" strokeLinejoin="round" />
              ) : null}
              {live?.t === "line" ? (
                <>
                  <Line x1={live.a[0]} y1={live.a[1]} x2={live.b[0]} y2={live.b[1]} stroke={color} strokeWidth={Math.max(2.5, width)} strokeLinecap="round" />
                  {live.snapA ? <Circle cx={live.a[0]} cy={live.a[1]} r={6 * sw * base} fill="none" stroke="#16B3A6" strokeWidth={2 * sw * base} /> : null}
                  {live.snapB ? <Circle cx={live.b[0]} cy={live.b[1]} r={6 * sw * base} fill="none" stroke="#16B3A6" strokeWidth={2 * sw * base} /> : null}
                </>
              ) : null}
              {live?.t === "circle" ? <Circle cx={live.o[0]} cy={live.o[1]} r={live.r} fill="none" stroke={color} strokeWidth={Math.max(2.5, width)} /> : null}
              {cevianFrom ? <Circle cx={cevianFrom[0]} cy={cevianFrom[1]} r={8} fill="#16B3A6" fillOpacity={0.25} stroke="#16B3A6" strokeWidth={2} /> : null}
              {selBox ? (
                <Rect x={selBox.x0 - 6} y={selBox.y0 - 6} width={selBox.x1 - selBox.x0 + 12} height={selBox.y1 - selBox.y0 + 12} rx={6} fill="#16B3A6" fillOpacity={0.07} stroke="#16B3A6" strokeWidth={1.5} strokeDasharray="6 4" />
              ) : null}
              {marquee ? (
                <Rect x={Math.min(marquee.a[0], marquee.b[0])} y={Math.min(marquee.a[1], marquee.b[1])} width={Math.abs(marquee.b[0] - marquee.a[0])} height={Math.abs(marquee.b[1] - marquee.a[1])} fill="#2F6FDB" fillOpacity={0.07} stroke="#2F6FDB" strokeWidth={1.2} strokeDasharray="5 4" />
              ) : null}
            </Svg>
          </View>

          {textEdit ? (
            <TextInput
              autoFocus
              value={textEdit.value}
              onChangeText={(v) => setTextEdit({ ...textEdit, value: v })}
              onSubmitEditing={finishText}
              onBlur={finishText}
              placeholder="Буква или подпись"
              maxLength={40}
              style={{
                position: "absolute",
                left: Math.max(8, Math.min(vp.w - 190, view.x + textEdit.p[0] * scale - 8)),
                top: Math.max(8, view.y + textEdit.p[1] * scale - 22),
                width: 180,
                height: 44,
                borderRadius: 10,
                borderWidth: 2,
                borderColor: "#16B3A6",
                backgroundColor: "#fff",
                paddingHorizontal: 10,
                fontFamily: F.extrabold,
                fontSize: 17,
                color,
              }}
            />
          ) : null}

          {tool === "select" && validSel.length ? (
            <Animated.View entering={FadeIn} style={{ position: "absolute", left: 10, top: 10, flexDirection: "row", gap: 6, backgroundColor: "#fff", borderRadius: 16, padding: 6, borderWidth: 1, borderColor: C.lineSoft }}>
              <Pressable
                onPress={() => {
                  const sel = new Set(validSel);
                  const copies = items.filter((_, i) => sel.has(i)).map((it) => translateItem(it, 16, 16));
                  commit([...items, ...copies]);
                  setSelected(copies.map((_, k) => items.length + k));
                }}
                style={{ paddingHorizontal: 12, height: 36, borderRadius: 12, justifyContent: "center", backgroundColor: C.paper }}
              >
                <T w="extrabold" size={13}>Копия</T>
              </Pressable>
              <Pressable
                onPress={() => {
                  const sel = new Set(validSel);
                  commit(items.filter((_, i) => !sel.has(i)));
                  setSelected([]);
                }}
                style={{ paddingHorizontal: 12, height: 36, borderRadius: 12, justifyContent: "center", backgroundColor: C.coralLight }}
              >
                <T w="extrabold" size={13} color={C.coralText}>Удалить</T>
              </Pressable>
            </Animated.View>
          ) : null}

          {toast || hint ? (
            <View pointerEvents="none" style={{ position: "absolute", bottom: 10, left: 0, right: 0, alignItems: "center" }}>
              <Animated.View key={toast ?? hint} entering={FadeIn.duration(160)} style={{ backgroundColor: toast ? "#0E8C82" : "rgba(19,42,32,0.78)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8, maxWidth: "90%" }}>
                <T w="extrabold" size={12} color="#fff" style={{ textAlign: "center" }}>{toast ?? hint}</T>
              </Animated.View>
            </View>
          ) : !items.length ? (
            <View pointerEvents="none" style={{ position: "absolute", bottom: 10, left: 0, right: 0, alignItems: "center" }}>
              <View style={{ backgroundColor: "rgba(255,255,255,0.95)", borderRadius: 14, borderWidth: 1, borderColor: C.lineSoft, paddingHorizontal: 14, paddingVertical: 8 }}>
                <T w="bold" size={12} color={C.inkSoft}>Один палец — рисовать · два — двигать и приближать</T>
              </View>
            </View>
          ) : null}

          {popover === "stamps" ? (
            <Animated.View entering={FadeIn.duration(150)} style={{ position: "absolute", left: 10, right: 10, bottom: 10, backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, padding: 10, flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
              {STAMPS.map((s) => (
                <Pressable
                  key={s.k}
                  onPress={() => {
                    setStamp(s.k);
                    setCevianFrom(null);
                    setPopover(null);
                  }}
                  style={{ width: "31%", height: 44, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: stamp === s.k ? 2 : 1, borderColor: stamp === s.k ? C.pine : C.lineSoft, backgroundColor: stamp === s.k ? C.pineLight : "#fff" }}
                >
                  <T w="extrabold" size={12}>{s.label}</T>
                </Pressable>
              ))}
            </Animated.View>
          ) : null}

          {popover === "pen" ? (
            <Animated.View entering={FadeIn.duration(150)} style={{ position: "absolute", right: 10, bottom: 10, width: 270, backgroundColor: "#fff", borderRadius: 20, borderWidth: 1, borderColor: C.lineSoft, padding: 14, gap: 12 }}>
              <T w="black" size={12} color={C.inkSoft}>Цвет</T>
              <View style={{ flexDirection: "row", gap: 10 }}>
                {COLORS.map((c) => (
                  <Pressable
                    key={c}
                    onPress={() => {
                      setColor(c);
                      setHighlight(false);
                      if (tool === "eraser" || tool === "select") setTool("pen");
                    }}
                    style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: c, borderWidth: !highlight && color === c ? 3 : 0, borderColor: "#fff" }}
                  >
                    {!highlight && color === c ? <View style={{ position: "absolute", top: -5, left: -5, right: -5, bottom: -5, borderRadius: 25, borderWidth: 2, borderColor: c }} /> : null}
                  </Pressable>
                ))}
                <Pressable
                  onPress={() => {
                    setHighlight(true);
                    setTool("pen");
                  }}
                  accessibilityLabel="Маркер"
                  style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: "#FFF3C4", borderWidth: 2, borderColor: highlight ? C.pine : C.lineSoft, alignItems: "center", justifyContent: "center" }}
                >
                  <T w="black" size={11} color="#8A6A00">М</T>
                </Pressable>
              </View>
              <T w="black" size={12} color={C.inkSoft}>Толщина</T>
              <View style={{ flexDirection: "row", gap: 8 }}>
                {WIDTHS.map((w) => (
                  <Pressable key={w} onPress={() => setWidth(w)} style={{ flex: 1, height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: width === w ? 2 : 1, borderColor: width === w ? C.pine : C.lineSoft }}>
                    <View style={{ width: 34, height: w, borderRadius: w, backgroundColor: C.ink }} />
                  </Pressable>
                ))}
              </View>
              <Pressable
                disabled={!items.length}
                onPress={() => {
                  commit([]);
                  setPopover(null);
                }}
                style={{ height: 42, borderRadius: 12, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: "rgba(226,71,76,0.3)", opacity: items.length ? 1 : 0.4 }}
              >
                <T w="extrabold" size={13} color={C.coralText}>Стереть всё</T>
              </Pressable>
            </Animated.View>
          ) : null}
          <Confetti burst={burst} x={vp.w / 2} y={vp.h - 40} />
        </View>

        {/* инструменты */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 8, paddingTop: 8, borderTopWidth: 1, borderTopColor: C.lineSoft }}>
          <ToolBtn t="pen" label={highlight ? "Маркер" : "Ручка"}>
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4z" fill="none" stroke={ic("pen")} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </ToolBtn>
          <ToolBtn t="line" label="Линейка">
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M4 20 20 4" stroke={ic("line")} strokeWidth={2.4} strokeLinecap="round" /><Circle cx={4} cy={20} r={2.2} fill={ic("line")} /><Circle cx={20} cy={4} r={2.2} fill={ic("line")} /></Svg>
          </ToolBtn>
          <ToolBtn t="stamp" label="Значки">
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M5 19V5h14" fill="none" stroke={ic("stamp")} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /><Path d="M5 13h6v6" fill="none" stroke={ic("stamp")} strokeWidth={2} /></Svg>
          </ToolBtn>
          <ToolBtn t="text" label="Подпись">
            <T w="black" size={17} color={ic("text")}>Aa</T>
          </ToolBtn>
          <ToolBtn t="eraser" label="Ластик">
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L11 21zM22 21H7M5 11l9 9" fill="none" stroke={ic("eraser")} strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" /></Svg>
          </ToolBtn>
          <ToolBtn t="select" label="Выбор">
            <Svg width={22} height={22} viewBox="0 0 24 24"><Path d="M5 3l14 7-6 2-2 6z" fill="none" stroke={ic("select")} strokeWidth={2.2} strokeLinejoin="round" /></Svg>
          </ToolBtn>
          <View style={{ flex: 1 }} />
          <Pressable
            accessibilityLabel="Цвет и толщина"
            onPress={() => setPopover(popover === "pen" ? null : "pen")}
            style={{ width: 46, height: 46, borderRadius: 14, borderWidth: 2, borderColor: popover === "pen" ? C.pine : C.line, alignItems: "center", justifyContent: "center" }}
          >
            <View style={{ width: 24, height: 24, borderRadius: 12, backgroundColor: highlight ? HIGHLIGHT : color }} />
          </Pressable>
        </View>

        {/* ответ */}
        <View style={{ paddingHorizontal: 10, paddingTop: 8, paddingBottom: Math.max(10, insets.bottom), flexDirection: "row", gap: 8, alignItems: "center" }}>
          {answerBar && !answerBar.detailed && !answerBar.disabled ? (
            <>
              <Animated.View style={[{ flex: 1 }, shakeStyle]}>
                <TextInput
                  value={answerBar.value}
                  onChangeText={(v) => {
                    answerBar.onChange(v);
                    setResult(null);
                  }}
                  placeholder="Ответ"
                  placeholderTextColor="#9DB5A8"
                  keyboardType="numbers-and-punctuation"
                  returnKeyType="done"
                  onSubmitEditing={submitAnswer}
                  style={{
                    height: 50,
                    borderRadius: R.input,
                    borderWidth: 2,
                    borderColor: result === "wrong" ? C.coral : result === "correct" ? C.pine : C.line,
                    paddingHorizontal: 14,
                    fontFamily: F.black,
                    fontSize: 20,
                    color: C.ink,
                    backgroundColor: result === "correct" ? C.pineLight : "#fff",
                  }}
                />
              </Animated.View>
              <Pressable
                onPress={submitAnswer}
                disabled={!answerBar.value.trim() || checking}
                style={{ height: 50, paddingHorizontal: 18, borderRadius: R.pill, backgroundColor: C.pineStrong, alignItems: "center", justifyContent: "center", opacity: answerBar.value.trim() ? 1 : 0.45 }}
              >
                <T w="extrabold" size={14} color="#fff">{checking ? "…" : result === "correct" ? "ВЕРНО!" : "ПРОВЕРИТЬ"}</T>
              </Pressable>
            </>
          ) : (
            <Pressable onPress={onClose} style={{ flex: 1, height: 50, borderRadius: R.pill, backgroundColor: C.pineStrong, alignItems: "center", justifyContent: "center" }}>
              <T w="extrabold" size={14} color="#fff">{answerBar?.detailed ? "К ОТВЕТУ" : "ГОТОВО"}</T>
            </Pressable>
          )}
        </View>
        {result === "wrong" ? (
          <Animated.View entering={FadeIn} style={{ position: "absolute", left: 0, right: 0, bottom: Math.max(10, insets.bottom) + 130, alignItems: "center" }} pointerEvents="none">
            <View style={{ backgroundColor: C.coral, borderRadius: 14, paddingHorizontal: 14, paddingVertical: 8 }}>
              <T w="extrabold" size={13} color="#fff">Пока неверно — подсказка под задачей</T>
            </View>
          </Animated.View>
        ) : null}
      </View>
    </Modal>
  );
}
