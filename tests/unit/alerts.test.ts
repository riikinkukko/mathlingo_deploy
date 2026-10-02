import { test } from "node:test";
import assert from "node:assert/strict";
import { errorFingerprint } from "../../lib/alerts";

test("оповещения: одна и та же ошибка с разными id/числами склеивается", () => {
  const a = errorFingerprint("server", "Не найден ученик u_7f3a9c21b4 на шаге 12\n    at x");
  const b = errorFingerprint("server", "Не найден ученик u_99ab01cd77 на шаге 3\n    at y");
  assert.equal(a, b);
  assert.notEqual(a, errorFingerprint("client", "Не найден ученик u_7f3a9c21b4 на шаге 12"));
  assert.notEqual(a, errorFingerprint("server", "Совсем другая ошибка"));
});
