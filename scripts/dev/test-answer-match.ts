import { answersMatch } from "../../lib/actions-core";

const cases: [string, string, boolean][] = [
  ["60", "60", true],
  ["60°", "60", true],
  [" 60 ", "60", true],
  ["60,5", "60.5", true],
  ["1/2", "0.5", true],
  ["2/4", "0.5", true],
  ["999", "60", false],
  ["6°0", "60", false], // градус не должен ломать посередине числа в другую сторону
  ["", "60", false],
];

let failed = 0;
for (const [a, b, expected] of cases) {
  const got = answersMatch(a, b);
  const ok = got === expected;
  if (!ok) failed++;
  console.log(`${ok ? "OK " : "FAIL"} answersMatch(${JSON.stringify(a)}, ${JSON.stringify(b)}) = ${got}, ожидали ${expected}`);
}
console.log(failed === 0 ? "\nВСЕ ПРОВЕРКИ ПРОШЛИ" : `\n${failed} ПРОВАЛЕНО`);
process.exit(failed === 0 ? 0 : 1);
