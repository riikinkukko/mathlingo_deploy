import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MAX_PRIMARY,
  blankAnswerProblem,
  buildPools,
  buildVariant,
  isBlankAnswer,
  maxPrimaryFor,
  mockSlotFor,
  normalizeBlankAnswer,
  primaryToTest,
} from "../../lib/mock-exam";
import { EGE_CRITERIA } from "../../lib/ege-criteria";
import { maxPointsForTask } from "../../lib/ege-points";

test("бланк: целые и десятичные дроби проходят, остальное — с подсказкой", () => {
  for (const ok of ["12", "-3", "0,5", "2.75", " 7 "]) assert.equal(isBlankAnswer(ok), true, ok);
  assert.equal(blankAnswerProblem(""), null);
  assert.equal(blankAnswerProblem("0,25"), null);
  assert.match(blankAnswerProblem("1/3")!, /десятичную/);
  assert.match(blankAnswerProblem("5 см")!, /пробел/);
  assert.match(blankAnswerProblem("5см")!, /единиц/);
  assert.match(blankAnswerProblem(",5")!, /ноль/);
  assert.match(blankAnswerProblem("5,")!, /запятой/);
});

test("ответ нормализуется: точка → запятая, без пробелов", () => {
  assert.equal(normalizeBlankAnswer(" 2.5 "), "2,5");
  assert.equal(normalizeBlankAnswer("1 000"), "1000");
});

test("в пробник идут только подходящие задачи: часть 1 — число для бланка, часть 2 — развёрнутые", () => {
  const base = { skillId: "s" };
  assert.equal(mockSlotFor({ ...base, id: "a", egeTaskNumber: 5, answerType: "NUMBER", correctAnswer: "0,2" }), 5);
  assert.equal(mockSlotFor({ ...base, id: "b", egeTaskNumber: 6, answerType: "NUMBER", correctAnswer: "1/3" }), null);
  assert.equal(mockSlotFor({ ...base, id: "c", egeTaskNumber: 15, answerType: "NUMBER", correctAnswer: "4" }), null);
  assert.equal(mockSlotFor({ ...base, id: "d", egeTaskNumber: 15, answerType: "DETAILED", correctAnswer: "…" }), 15);
  assert.equal(mockSlotFor({ id: "e", egeTaskNumber: 3, answerType: "NUMBER", correctAnswer: "1", skillId: null }), null);
  assert.equal(mockSlotFor({ ...base, id: "f", egeTaskNumber: null, answerType: "NUMBER", correctAnswer: "1" }), null);
});

test("вариант: по задаче на номер, детерминированно, соседние варианты не совпадают", () => {
  const problems = [];
  for (let n = 1; n <= 20; n++) {
    for (let k = 0; k < 6; k++) {
      problems.push({
        id: `p${n}_${k}`,
        egeTaskNumber: n,
        answerType: n <= 13 ? "NUMBER" : "DETAILED",
        correctAnswer: "1",
        skillId: "s",
      });
    }
  }
  const pools = buildPools(problems);
  const v1 = buildVariant(pools, 1);
  assert.equal(v1.length, 20);
  assert.deepEqual(v1.map((x) => x.n), Array.from({ length: 20 }, (_, i) => i + 1));
  assert.deepEqual(buildVariant(pools, 1), v1, "тот же вариант — те же задачи");
  const v2 = buildVariant(pools, 2);
  for (let i = 0; i < 20; i++) assert.notEqual(v1[i].problemId, v2[i].problemId);
  // Пул из 6 задач: седьмой вариант повторяет первый.
  assert.deepEqual(buildVariant(pools, 7), v1);
  assert.equal(buildVariant(pools, 3, false).length, 13, "только первая часть");
});

test("вариант пропускает номера, для которых в банке нет задач", () => {
  const pools = buildPools([
    { id: "x", egeTaskNumber: 1, answerType: "NUMBER", correctAnswer: "3", skillId: "s" },
    { id: "y", egeTaskNumber: 19, answerType: "DETAILED", correctAnswer: "…", skillId: "s" },
  ]);
  assert.deepEqual(buildVariant(pools, 4).map((x) => x.n), [1, 19]);
});

test("максимум первичных баллов ЕГЭ-2027 — 33", () => {
  const all = Array.from({ length: 20 }, (_, i) => i + 1);
  assert.equal(maxPrimaryFor(all), MAX_PRIMARY);
  assert.equal(maxPrimaryFor(all.slice(0, 13)), 13);
});

test("перевод в тестовые баллы монотонный, 0 → 0, максимум → 100", () => {
  assert.equal(primaryToTest(0), 0);
  assert.equal(primaryToTest(MAX_PRIMARY), 100);
  let prev = 0;
  for (let p = 1; p <= MAX_PRIMARY; p++) {
    const t = primaryToTest(p);
    assert.ok(t >= prev, `шкала не убывает на ${p}`);
    assert.ok(t > 0 && t <= 100);
    prev = t;
  }
});

test("критерии второй части согласованы с максимальными баллами", () => {
  for (let n = 14; n <= 20; n++) {
    const c = EGE_CRITERIA[n];
    assert.ok(c, `критерии для №${n}`);
    assert.equal(c[0].points, maxPointsForTask(n), `№${n}: верхний критерий = максимум`);
    assert.equal(c[c.length - 1].points, 0);
  }
});
