import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "fs";
import { answerFingerprint, canonicalAnswer } from "../../lib/answer-key";
import { answersMatch } from "../../lib/actions-core";

const strip = (s: string) =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim();

test("копия проверки ответов в мобильном приложении совпадает с серверной", () => {
  const server = strip(readFileSync("lib/answer-key.ts", "utf8"));
  const mobile = strip(readFileSync("mobile/src/lib/answer-key.ts", "utf8"));
  assert.equal(mobile, server);
});

test("отпечаток ответа совпадает тогда же, когда answersMatch засчитывает ответ", () => {
  const pairs: [string, string][] = [
    ["0,5", "0.5"],
    [" 12 ", "12"],
    ["1/2", "0.5"],
    ["-3", "-3"],
    ["60°", "60"],
    ["2,50", "2.5"],
    ["0", "-0"],
    ["12", "13"],
    ["1/3", "0.33"],
    ["abc", "abc"],
    ["a b", "ab"],
    ["5", "5.0000000001"],
  ];
  for (const [user, correct] of pairs) {
    const same = answerFingerprint("p_1", user) === answerFingerprint("p_1", correct);
    assert.equal(same, answersMatch(user, correct), `${user} vs ${correct}`);
  }
});

test("отпечаток посолен id задачи и не раскрывает ответ", () => {
  assert.notEqual(answerFingerprint("p_1", "12"), answerFingerprint("p_2", "12"));
  assert.ok(!answerFingerprint("p_1", "12").includes("12"));
  assert.equal(canonicalAnswer("1/4"), "n:0.25");
  assert.equal(canonicalAnswer("x+1"), "s:x+1");
});
