import { test } from "node:test";
import assert from "node:assert/strict";
import { answersMatch } from "../../lib/actions-core";

test("ответы: точное совпадение и регистр/пробелы", () => {
  assert.ok(answersMatch("60", "60"));
  assert.ok(answersMatch(" 60 ", "60"));
  assert.ok(!answersMatch("61", "60"));
});

test("ответы: десятичная запятая и точка — одно и то же", () => {
  assert.ok(answersMatch("2,5", "2.5"));
  assert.ok(answersMatch("2.50", "2,5"));
});

test("ответы: пустой ответ не засчитывается", () => {
  assert.ok(!answersMatch("", "60"));
});
