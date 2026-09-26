// Отправка цели в Яндекс.Метрику с клиента. Безопасно вызывать где угодно:
// если счётчик не подключён (нет NEXT_PUBLIC_YM_COUNTER_ID) или скрипт ещё не
// загрузился — просто ничего не произойдёт, ошибки не будет.
//
// Цели воронки, которые мы шлём:
//   register          — завершена регистрация (ученик или репетитор)
//   problem_solved    — задача решена верно
//   paywall_view      — открыт экран тарифа/оплаты
//   payment_started   — нажата кнопка оплаты (уход на форму ЮKassa)
//   payment_success   — вернулись после успешной оплаты (?paid=1)

export const YM_ID = process.env.NEXT_PUBLIC_YM_COUNTER_ID
  ? Number(process.env.NEXT_PUBLIC_YM_COUNTER_ID)
  : undefined;

type YmFn = (id: number, action: string, ...rest: unknown[]) => void;

export function ymGoal(goal: string): void {
  if (!YM_ID) return;
  try {
    const ym = (window as unknown as { ym?: YmFn }).ym;
    if (typeof ym === "function") ym(YM_ID, "reachGoal", goal);
  } catch {
    // аналитика не должна ронять приложение
  }
}

export function ymHit(url: string): void {
  if (!YM_ID) return;
  try {
    const ym = (window as unknown as { ym?: YmFn }).ym;
    if (typeof ym === "function") ym(YM_ID, "hit", url);
  } catch {
    /* no-op */
  }
}
