import { test } from "node:test";
import assert from "node:assert/strict";
import { cevian, snapPoint, cornerAt, projectOnSegment, strokePath, hitItem, type Geometry, type Pt } from "../../lib/sketch";

// Треугольник A(0,0) B(0,40) C(30,0): прямой угол при A, BC = 50.
const A: Pt = [0, 0], B: Pt = [0, 40], C: Pt = [30, 0];
const g: Geometry = { vertices: [A, B, C], segments: [[A, B], [B, C], [C, A]], centers: [] };
const close = (p: Pt, q: Pt) => Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-6;

test("черновик: медиана — середина стороны, высота — основание перпендикуляра", () => {
  assert.ok(close(cevian("median", A, B, C), [15, 20]));
  const h = cevian("height", A, B, C); // высота из прямого угла на гипотенузу
  const d = [C[0] - B[0], C[1] - B[1]];
  assert.ok(Math.abs((h[0] - A[0]) * d[0] + (h[1] - A[1]) * d[1]) < 1e-6);
  assert.ok(Math.abs(Math.hypot(h[0], h[1]) - 24) < 1e-6); // 30·40/50
});

test("черновик: биссектриса делит сторону пропорционально прилежащим сторонам", () => {
  const D = cevian("bisector", A, B, C); // BD/DC = AB/AC = 40/30
  const bd = Math.hypot(D[0] - B[0], D[1] - B[1]), dc = Math.hypot(C[0] - D[0], C[1] - D[1]);
  assert.ok(Math.abs(bd / dc - 4 / 3) < 1e-6);
});

test("черновик: прилипание к вершине сильнее, чем к стороне", () => {
  assert.equal(snapPoint([1, 1], g, 5).kind, "vertex");
  const s = snapPoint([2, 20], g, 5);
  assert.equal(s.kind, "segment");
  assert.ok(close(s.p, [0, 20]));
  assert.equal(snapPoint([15, 15], g, 3).kind, "free");
});

test("черновик: угол при вершине выбирается по направлению тапа", () => {
  const c = cornerAt(A, [5, 5], g)!;
  const dirs = [c.u, c.w].map((d) => `${Math.round(d[0])},${Math.round(d[1])}`).sort();
  assert.deepEqual(dirs, ["0,1", "1,0"]);
});

test("черновик: проекция, сглаженный путь и попадание ластика", () => {
  assert.equal(projectOnSegment([10, 10], [0, 0], [20, 0]).d, 10);
  assert.match(strokePath([0, 0, 10, 10, 20, 0]), /^M0\.0 0\.0Q/);
  const stroke = { t: "stroke" as const, pts: [0, 0, 100, 0], c: "#000", w: 3 };
  assert.ok(hitItem(stroke, [50, 5], 5));
  assert.ok(!hitItem(stroke, [50, 30], 5));
});
