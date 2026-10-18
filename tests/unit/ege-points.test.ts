import { test } from "node:test";
import assert from "node:assert/strict";
import {
  EGE_2027_MAX_POINTS,
  DEFAULT_MAX_POINTS,
  maxPointsForTask,
  parseReviewScore,
  defaultDecisionForScore,
  resolveDecision,
  scoreLabel,
} from "../../lib/ege-points";

test("максимум баллов по номерам ЕГЭ-2027 (критерии ФИПИ)", () => {
  assert.deepEqual(EGE_2027_MAX_POINTS, { 14: 2, 15: 3, 16: 2, 17: 2, 18: 3, 19: 4, 20: 4 });
  assert.equal(maxPointsForTask(14), 2);
  assert.equal(maxPointsForTask(15), 3);
  assert.equal(maxPointsForTask(18), 3);
  assert.equal(maxPointsForTask(19), 4);
  // своя задача без номера и неизвестный номер — 2 балла
  assert.equal(maxPointsForTask(null), DEFAULT_MAX_POINTS);
  assert.equal(maxPointsForTask(undefined), 2);
  assert.equal(maxPointsForTask(5), 2);
});

test("баллы с клиента: только целое 0..max, пусто — без баллов", () => {
  assert.deepEqual(parseReviewScore(null, 3), { ok: true, score: null });
  assert.deepEqual(parseReviewScore(undefined, 3), { ok: true, score: null });
  assert.deepEqual(parseReviewScore("", 3), { ok: true, score: null });
  assert.deepEqual(parseReviewScore(0, 3), { ok: true, score: 0 });
  assert.deepEqual(parseReviewScore(3, 3), { ok: true, score: 3 });
  assert.deepEqual(parseReviewScore("2", 3), { ok: true, score: 2 });
  assert.deepEqual(parseReviewScore(4, 3), { ok: false });
  assert.deepEqual(parseReviewScore(-1, 3), { ok: false });
  assert.deepEqual(parseReviewScore(1.5, 3), { ok: false });
  assert.deepEqual(parseReviewScore("2б", 3), { ok: false });
  assert.deepEqual(parseReviewScore({}, 3), { ok: false });
});

test("полный балл — одобрено; 0 и частичный — по умолчанию доработать", () => {
  assert.equal(defaultDecisionForScore(null, 3), null);
  assert.equal(defaultDecisionForScore(3, 3), "approved");
  assert.equal(defaultDecisionForScore(2, 3), "needs_revision");
  assert.equal(defaultDecisionForScore(0, 2), "needs_revision");
  // полный балл нельзя отправить на доработку
  assert.equal(resolveDecision("needs_revision", 4, 4), "approved");
  // частичный: решает репетитор
  assert.equal(resolveDecision("approved", 1, 2), "approved");
  assert.equal(resolveDecision("needs_revision", 1, 2), "needs_revision");
  // без баллов — как раньше
  assert.equal(resolveDecision("needs_revision", null, 2), "needs_revision");
});

test("подпись баллов для ученика", () => {
  assert.equal(scoreLabel(2, 3), "2 из 3 баллов");
  assert.equal(scoreLabel(0, 2), "0 из 2 баллов");
  assert.equal(scoreLabel(1, 1), "1 из 1 балла");
});
