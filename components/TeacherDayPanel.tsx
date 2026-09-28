import { pluralRu } from "@/lib/pluralize";

/**
 * "Панель дня" — сводка вверху дашборда репетитора. Показывает только то, что
 * требует внимания прямо сейчас: работы на проверке, просроченные ДЗ и учеников,
 * которые давно не заходили. Если всё чисто — короткое спокойное состояние.
 *
 * Данные приходят уже посчитанные из app/teacher/page.tsx (никаких запросов
 * в самом компоненте — он серверный, но чисто презентационный).
 */

export interface DayPanelStudent {
  id: string;
  name: string;
  /** сколько дней назад заходил; null — не заходил ни разу */
  days: number | null;
}

export interface DayPanelData {
  /** всего работ на проверке у репетитора */
  reviewsCount: number;
  /** ученики с просроченным ДЗ */
  overdue: { id: string; name: string; count: number }[];
  /** ученики, которые давно не заходили */
  inactive: DayPanelStudent[];
  /** ученики с долгом по оплате (lessons — сколько занятий не оплачено) */
  debts: { id: string; name: string; lessons: number }[];
  /** прошедшие занятия, не отмеченные «Было/Не было» */
  unmarkedLessons: number;
}

function daysLabel(days: number | null): string {
  if (days === null) return "ни разу не заходил";
  if (days === 0) return "заходил сегодня";
  if (days === 1) return "был вчера";
  return `не заходил ${days} ${pluralRu(days, ["день", "дня", "дней"])}`;
}

export default function TeacherDayPanel({ data }: { data: DayPanelData }) {
  const { reviewsCount, overdue, inactive, debts, unmarkedLessons } = data;
  const allClear =
    reviewsCount === 0 &&
    overdue.length === 0 &&
    inactive.length === 0 &&
    debts.length === 0 &&
    unmarkedLessons === 0;

  if (allClear) {
    return (
      <div className="card mb-6 flex items-center gap-3 p-4">
        <span className="text-2xl">✅</span>
        <div>
          <p className="text-sm font-bold text-ink">Всё под контролем</p>
          <p className="text-xs text-ink-soft">
            Нет работ на проверке, просроченных заданий, долгов и потерявшихся учеников.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6">
      <h2 className="mb-3 font-display text-lg font-black text-ink">Требует внимания</h2>
      <div className="grid gap-3 sm:grid-cols-2">
        {/* Работы на проверке */}
        {reviewsCount > 0 && (
          <div className="card border-l-4 !border-l-amber p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-pill bg-amber px-2 py-0.5 text-sm font-black text-white">
                {reviewsCount}
              </span>
              <p className="text-sm font-bold text-ink">
                {pluralRu(reviewsCount, ["работа", "работы", "работ"])} на проверке
              </p>
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              Ученики ждут вашей оценки — откройте карточку ученика, чтобы проверить.
            </p>
          </div>
        )}

        {/* Прошедшие занятия без отметки — иначе баланс оплат врёт */}
        {unmarkedLessons > 0 && (
          <a href="/teacher/schedule" className="card block border-l-4 !border-l-amber p-4 transition hover:border-pine">
            <div className="flex items-center gap-2">
              <span className="rounded-pill bg-amber px-2 py-0.5 text-sm font-black text-white">
                {unmarkedLessons}
              </span>
              <p className="text-sm font-bold text-ink">
                {pluralRu(unmarkedLessons, ["занятие не отмечено", "занятия не отмечены", "занятий не отмечено"])}
              </p>
            </div>
            <p className="mt-2 text-xs text-ink-soft">
              Время прошло, а «Было / Не было» не нажато. От этого зависит баланс оплат → отметить
            </p>
          </a>
        )}

        {/* Просроченные ДЗ */}
        {overdue.length > 0 && (
          <div className="card border-l-4 !border-l-coral p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-pill bg-coral px-2 py-0.5 text-sm font-black text-white">
                {overdue.length}
              </span>
              <p className="text-sm font-bold text-ink">
                {overdue.length === 1 ? "ученик" : "учеников"} с просрочкой
              </p>
            </div>
            <ul className="mt-2 space-y-1">
              {overdue.slice(0, 4).map((s) => (
                <li key={s.id}>
                  <a
                    href={`/teacher/student/${s.id}`}
                    className="flex items-center justify-between text-xs text-ink-soft transition hover:text-coral"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="ml-2 shrink-0 font-mono">{s.count}</span>
                  </a>
                </li>
              ))}
              {overdue.length > 4 && (
                <li className="text-[11px] text-ink-soft">и ещё {overdue.length - 4}…</li>
              )}
            </ul>
          </div>
        )}

        {/* Долг по оплате */}
        {debts.length > 0 && (
          <div className="card border-l-4 !border-l-coral p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-pill bg-coral px-2 py-0.5 text-sm font-black text-white">
                {debts.length}
              </span>
              <p className="text-sm font-bold text-ink">
                {debts.length === 1 ? "долг по оплате" : "долги по оплате"}
              </p>
            </div>
            <ul className="mt-2 space-y-1">
              {debts.slice(0, 4).map((s) => (
                <li key={s.id}>
                  <a
                    href={`/teacher/student/${s.id}`}
                    className="flex items-center justify-between text-xs text-ink-soft transition hover:text-coral"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="ml-2 shrink-0">
                      {s.lessons} {pluralRu(s.lessons, ["занятие", "занятия", "занятий"])}
                    </span>
                  </a>
                </li>
              ))}
              {debts.length > 4 && (
                <li>
                  <a href="/teacher/payments" className="text-[11px] text-ink-soft hover:text-coral">
                    и ещё {debts.length - 4}… → все оплаты
                  </a>
                </li>
              )}
            </ul>
          </div>
        )}

        {/* Давно не заходили */}
        {inactive.length > 0 && (
          <div className="card border-l-4 !border-l-ink-soft p-4">
            <div className="flex items-center gap-2">
              <span className="rounded-pill bg-ink-soft px-2 py-0.5 text-sm font-black text-white">
                {inactive.length}
              </span>
              <p className="text-sm font-bold text-ink">потерялись</p>
            </div>
            <ul className="mt-2 space-y-1">
              {inactive.slice(0, 4).map((s) => (
                <li key={s.id}>
                  <a
                    href={`/teacher/student/${s.id}`}
                    className="flex items-center justify-between text-xs text-ink-soft transition hover:text-pine"
                  >
                    <span className="truncate">{s.name}</span>
                    <span className="ml-2 shrink-0">{daysLabel(s.days)}</span>
                  </a>
                </li>
              ))}
              {inactive.length > 4 && (
                <li className="text-[11px] text-ink-soft">и ещё {inactive.length - 4}…</li>
              )}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
