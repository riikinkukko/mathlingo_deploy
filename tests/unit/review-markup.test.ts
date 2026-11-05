import { test } from "node:test";
import assert from "node:assert/strict";
import {
  type MarkItem,
  hitItem,
  itemBBox,
  itemSvg,
  rotateItemCW,
  translateItem,
  unitFor,
  loadReviewDraft,
  saveReviewDraft,
  clearReviewDraft,
  pruneReviewDrafts,
} from "../../lib/review-markup";
import { toReviewItem } from "../../lib/review-item";
import type { PendingReview } from "../../lib/queries";

const u = unitFor(1200, 1600);

test("пометки: попадание по штриху, овалу, значку и подписи", () => {
  const stroke: MarkItem = { t: "stroke", pts: [100, 100, 300, 100], c: "#f00", w: 1.2 };
  assert.ok(hitItem(stroke, [200, 104], 5, u));
  assert.ok(!hitItem(stroke, [200, 160], 5, u));
  const oval: MarkItem = { t: "oval", a: [100, 100], b: [300, 200], c: "#f00", w: 1.2 };
  assert.ok(hitItem(oval, [300, 150], 5, u), "по контуру");
  assert.ok(!hitItem(oval, [200, 150], 5, u), "в центре овала — мимо (можно рисовать внутри)");
  const stamp: MarkItem = { t: "stamp", k: "ok", p: [500, 500] };
  assert.ok(hitItem(stamp, [505, 495], 2, u));
  const text: MarkItem = { t: "text", p: [100, 700], s: "знак!", c: "#f00" };
  assert.ok(hitItem(text, [120, 700], 2, u));
  assert.ok(!hitItem(text, [600, 700], 2, u));
});

test("пометки: поворот вместе с фото переводит (x; y) в (h − y; x)", () => {
  const line: MarkItem = { t: "line", a: [10, 20], b: [30, 40], c: "#000", w: 1 };
  assert.deepEqual(rotateItemCW(line, 100), { ...line, a: [80, 10], b: [60, 30] });
  const s: MarkItem = { t: "stroke", pts: [10, 20, 30, 40], c: "#000", w: 1 };
  assert.deepEqual((rotateItemCW(s, 100) as { pts: number[] }).pts, [80, 10, 60, 30]);
  // Четыре поворота возвращают на место (для квадратного фото).
  let it: MarkItem = { t: "oval", a: [10, 20], b: [50, 70], c: "#000", w: 1 };
  for (let i = 0; i < 4; i++) it = rotateItemCW(it, 100);
  assert.deepEqual(it, { t: "oval", a: [10, 20], b: [50, 70], c: "#000", w: 1 });
});

test("пометки: сдвиг и рамка", () => {
  const st: MarkItem = { t: "stamp", k: "bad", p: [100, 100] };
  assert.deepEqual(translateItem(st, 5, -5), { ...st, p: [105, 95] });
  const b = itemBBox({ t: "line", a: [0, 0], b: [100, 50], c: "#000", w: 2 }, 1);
  assert.deepEqual(b, { x0: -1, y0: -1, x1: 101, y1: 51 });
});

test("подпись в SVG экранируется", () => {
  const svg = itemSvg({ t: "text", p: [0, 0], s: '<script>"', c: "#000" }, 1);
  assert.ok(!svg.includes("<script>"));
  assert.ok(svg.includes("&lt;script&gt;&quot;"));
});

test("черновик проверки: сохраняется, пустой удаляется, старые чистятся", () => {
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
    key: (i: number) => [...store.keys()][i] ?? null,
    get length() {
      return store.size;
    },
  };
  (globalThis as { window?: unknown }).window = { dispatchEvent: () => true };
  saveReviewDraft("a1", { items: [{ t: "stamp", k: "ok", p: [1, 2] }], rot: 1, score: 2, feedback: "ок" });
  assert.equal(loadReviewDraft("a1")?.score, 2);
  saveReviewDraft("a1", { items: [], rot: 0, score: null, feedback: " " });
  assert.equal(loadReviewDraft("a1"), null);
  saveReviewDraft("a2", { items: [], rot: 0, score: 1, feedback: "" });
  store.set("pm-review:old", JSON.stringify({ v: 1, items: [], rot: 0, score: 1, feedback: "", ts: 0 }));
  pruneReviewDrafts();
  assert.ok(!store.has("pm-review:old"));
  assert.ok(store.has("pm-review:a2"));
  clearReviewDraft("a2");
  assert.equal(store.size, 0);
  delete (globalThis as { localStorage?: unknown }).localStorage;
  delete (globalThis as { window?: unknown }).window;
});

test("работа на проверке уходит в браузер без хеша пароля и платёжных данных", () => {
  const r = {
    attemptId: "a",
    student: { id: "s", name: "Аня", email: "a@x.ru", passwordHash: "$2b$secret", yookassaPaymentMethodId: "pm_1", role: "STUDENT" },
    problem: { id: "p", text: "Задача", explanation: "Разбор", correctAnswer: "5", hints: [], difficulty: 2, answerType: "DETAILED", egeTaskNumber: 15 },
    skillTitle: "Навык",
    answer: "(решение на фото)",
    submittedAt: new Date().toISOString(),
    hasImage: true,
  } as unknown as PendingReview;
  const item = toReviewItem(r);
  const json = JSON.stringify(item);
  assert.ok(!json.includes("secret") && !json.includes("pm_1") && !json.includes("a@x.ru"));
  assert.equal(item.answer, "", "заглушка «(решение на фото)» не показывается");
  assert.equal(item.problem.solution, "Разбор");
});
