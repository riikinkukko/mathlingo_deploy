/**
 * Русское склонение существительного после числительного.
 * forms = [один, два-четыре, пять-и-больше], например ["задача","задачи","задач"].
 *
 *   pluralRu(1, ["задача","задачи","задач"])  -> "задача"
 *   pluralRu(3, ["задача","задачи","задач"])  -> "задачи"
 *   pluralRu(5, ["задача","задачи","задач"])  -> "задач"
 *   pluralRu(11, ["задача","задачи","задач"]) -> "задач"  (11-14 — исключение)
 */
export function pluralRu(n: number, forms: [string, string, string]): string {
  const abs = Math.abs(n);
  const mod100 = abs % 100;
  const mod10 = abs % 10;
  if (mod100 >= 11 && mod100 <= 14) return forms[2];
  if (mod10 === 1) return forms[0];
  if (mod10 >= 2 && mod10 <= 4) return forms[1];
  return forms[2];
}
