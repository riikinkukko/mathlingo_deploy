"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DiagramSpec } from "@/lib/types";
import DiagramRenderer from "./DiagramRenderer";
import { IconClose } from "../icons";

type Tool = "pen" | "line" | "eraser";
type Point = { x: number; y: number };
type Stroke = { tool: Tool; points: Point[]; color: string; width: number };

const COLORS = [
  { hex: "#132A20", label: "Чёрный" },
  { hex: "#F0555A", label: "Красный" },
  { hex: "#16B3A6", label: "Бирюзовый" },
];

export default function DiagramScratchpad({
  spec,
  onClose,
  onDirty,
}: {
  /** Необязателен — если не передан, холст открывается пустым (для задач
   * без готовой диаграммы, где ученик рисует с нуля, например тригонометрия). */
  spec?: DiagramSpec;
  onClose: () => void;
  /** Вызывается один раз при первом добавленном штрихе — родитель может
   * показать индикатор "есть пометки" на превью диаграммы. Черновик
   * остаётся эфемерным (см. README) — это просто UI-подсказка для текущей
   * сессии, не персистентное состояние. */
  onDirty?: () => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);
  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);
  const [tool, setTool] = useState<Tool>("pen");
  const [color, setColor] = useState(COLORS[0].hex);
  const drawing = useRef<{ active: boolean; points: Point[] }>({ active: false, points: [] });
  const [, forceRedraw] = useState(0); // тик для перерисовки во время активного жеста (line-превью)

  // Подгоняем canvas под реальный размер контейнера с учётом плотности
  // пикселей — иначе на retina-экранах линии будут смазанными.
  useEffect(() => {
    function resize() {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      canvas.width = rect.width * dpr;
      canvas.height = rect.height * dpr;
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.scale(dpr, dpr);
      redraw();
    }
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function getCanvasSize() {
    const container = containerRef.current;
    if (!container) return { width: 0, height: 0 };
    const rect = container.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }

  function redraw(liveStroke?: Stroke) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const { width, height } = getCanvasSize();
    ctx.clearRect(0, 0, width, height);

    const all = liveStroke ? [...strokesRef.current, liveStroke] : strokesRef.current;
    for (const s of all) {
      if (s.points.length < 2) continue;
      ctx.lineJoin = "round";
      ctx.lineCap = "round";
      ctx.lineWidth = s.width;
      if (s.tool === "eraser") {
        ctx.globalCompositeOperation = "destination-out";
        ctx.strokeStyle = "rgba(0,0,0,1)";
      } else {
        ctx.globalCompositeOperation = "source-over";
        ctx.strokeStyle = s.color;
      }
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (const p of s.points.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = "source-over";
  }

  useEffect(() => {
    redraw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [strokes]);

  function pointFromEvent(e: React.PointerEvent<HTMLCanvasElement>): Point {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = pointFromEvent(e);
    drawing.current = { active: true, points: [p] };
    forceRedraw((n) => n + 1);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current.active) return;
    const p = pointFromEvent(e);
    if (tool === "line") {
      // Прямая линия — только начальная и текущая точка, промежуточные не копим.
      drawing.current.points = [drawing.current.points[0], p];
    } else {
      drawing.current.points.push(p);
    }
    const width = tool === "eraser" ? 22 : 3;
    redraw({ tool, points: drawing.current.points, color, width });
  }

  function handlePointerUp() {
    if (!drawing.current.active) return;
    const width = tool === "eraser" ? 22 : 3;
    const points = drawing.current.points; // фиксируем ДО сброса drawing.current ниже —
    // иначе апдейтер setStrokes (вызывается React'ом асинхронно) прочитал бы
    // уже пустой массив по ссылке, а не те точки, что реально были нарисованы.
    if (points.length >= 2) {
      setStrokes((prev) => [...prev, { tool, points, color, width }]);
      onDirty?.();
    }
    drawing.current = { active: false, points: [] };
  }

  function undo() {
    setStrokes((prev) => prev.slice(0, -1));
  }

  function clearAll() {
    setStrokes([]);
  }

  const modal = (
    <div className="fixed inset-0 z-50 flex flex-col bg-ink/95">
      <div className="flex items-center justify-between px-4 py-3">
        <p className="text-sm font-bold text-white/80">Черновик — пометки не сохраняются</p>
        <button
          onClick={onClose}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/10 text-white transition hover:bg-white/20"
        >
          <IconClose className="h-5 w-5" />
        </button>
      </div>

      <div className="relative mx-auto w-full max-w-lg flex-1 px-4">
        <div ref={containerRef} className="relative h-full w-full rounded-2xl bg-white">
          <div className="absolute inset-0 p-4">
            {spec && <DiagramRenderer spec={spec} />}
          </div>
          <canvas
            ref={canvasRef}
            className="absolute inset-0 touch-none"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
          />
        </div>
      </div>

      <div className="px-4 pb-[max(1rem,var(--safe-area-inset-bottom,env(safe-area-inset-bottom)))] pt-3">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-2 rounded-2xl bg-white/10 p-2">
          <div className="flex items-center gap-1.5">
            <ToolButton active={tool === "pen"} onClick={() => setTool("pen")} label="✏️" />
            <ToolButton active={tool === "line"} onClick={() => setTool("line")} label="📏" />
            <ToolButton active={tool === "eraser"} onClick={() => setTool("eraser")} label="🧹" />
          </div>
          <div className="flex items-center gap-1.5">
            {COLORS.map((c) => (
              <button
                key={c.hex}
                onClick={() => setColor(c.hex)}
                aria-label={c.label}
                className={`h-7 w-7 rounded-full border-2 transition ${
                  color === c.hex ? "border-white scale-110" : "border-transparent opacity-70"
                }`}
                style={{ background: c.hex }}
              />
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={undo}
              disabled={strokes.length === 0}
              className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/20 disabled:opacity-30"
            >
              Отменить
            </button>
            <button
              onClick={clearAll}
              disabled={strokes.length === 0}
              className="rounded-xl bg-white/10 px-3 py-2 text-xs font-bold text-white transition hover:bg-white/20 disabled:opacity-30"
            >
              Очистить
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}

function ToolButton({ active, onClick, label }: { active: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg transition ${
        active ? "bg-pine" : "bg-white/10 hover:bg-white/20"
      }`}
    >
      {label}
    </button>
  );
}
