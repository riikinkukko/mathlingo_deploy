/**
 * Проверка ответа без сети (мобильное приложение). Сервер отдаёт к задаче не
 * сам ответ, а его отпечаток: хеш канонической формы ответа, посоленный id
 * задачи. Приложение приводит ввод ученика к той же форме и сравнивает
 * отпечатки, а попытку отправляет на сервер, как только появится связь
 * (там ответ проверяется по-настоящему, answersMatch в lib/actions-core.ts).
 *
 * Каноническая форма повторяет answersMatch: запятая = точка, без пробелов и
 * знака градуса в конце; число (в том числе дробь a/b) — округлённое значение.
 *
 * ВНИМАНИЕ: это копия lib/answer-key.ts сайта — менять
 * обе одновременно (тест tests/unit/answer-key.test.ts сверяет их).
 */

export function normalizeAnswer(s: string): string {
  return s.trim().replace(/,/g, ".").replace(/\s+/g, "").replace(/°+$/g, "");
}

function evalNumeric(s: string): number | null {
  const fraction = /^(-?\d+(?:\.\d+)?)\/(-?\d+(?:\.\d+)?)$/.exec(s);
  if (fraction) {
    const den = Number(fraction[2]);
    return den !== 0 ? Number(fraction[1]) / den : null;
  }
  const n = Number(s);
  return Number.isFinite(n) && s !== "" ? n : null;
}

/** Каноническая форма ответа: «n:0.5» для чисел, «s:…» для остального. */
export function canonicalAnswer(raw: string): string {
  const s = normalizeAnswer(raw);
  const n = evalNumeric(s);
  if (n !== null) {
    const rounded = Math.round(n * 1e9) / 1e9;
    return `n:${Object.is(rounded, -0) ? 0 : rounded}`;
  }
  return `s:${s}`;
}

/** cyrb53 — быстрый некриптографический 53-битный хеш (одинаков в Node и RN). */
function cyrb53(str: string, seed = 0): string {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

export function answerFingerprint(problemId: string, answer: string): string {
  return cyrb53(`${problemId}|${canonicalAnswer(answer)}`);
}
