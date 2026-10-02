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
  /** вопросы учеников «Не понял» без ответа */
  openQuestions?: number;
}

function daysLabel(days: number | null): string {
  if (days === null) return "ни разу не заходил";
  if (days === 0) return "заходил сегодня";
  if (days === 1) return "был вчера";
  return `не заходил ${days} ${pluralRu(days, ["день", "дня", "дней"])}`;
}

type Row = { key: string; href: string; badge: string; tone: string; title: string; sub?: string };

/**
 * «Нужно внимание» — одна компактная карточка со строками вместо пяти
 * больших карточек: на телефоне раньше приходилось листать, чтобы дойти
 * до занятий и учеников. Каждая строка ведёт туда, где это решается.
 */
export default function TeacherDayPanel({ data }: { data: DayPanelData }) {
  const { reviewsCount, overdue, inactive, debts, unmarkedLessons } = data;
  const rows: Row[] = [];
  const openQuestions = data.openQuestions ?? 0;
  if (openQuestions > 0)
    rows.push({
      key: "questions",
      href: "/teacher/questions",
      badge: String(openQuestions),
      tone: "bg-violet-light text-violet-text",
      title: `${openQuestions === 1 ? "Вопрос ученика" : "Вопросы учеников"} — ответить`,
      sub: "Нажали «Не понял» в задаче",
    });
  const names = (xs: { name: string }[]) =>
    xs.slice(0, 2).map((x) => x.name.split(" ")[0]).join(", ") + (xs.length > 2 ? ` и ещё ${xs.length - 2}` : "");

  if (reviewsCount > 0)
    rows.push({
      key: "reviews",
      href: "/teacher#students",
      badge: String(reviewsCount),
      tone: "bg-violet-light text-violet-text",
      title: `Проверить ${pluralRu(reviewsCount, ["работу", "работы", "работ"])}`,
      sub: "Ученики ждут оценки",
    });
  if (unmarkedLessons > 0)
    rows.push({
      key: "unmarked",
      href: "/teacher/schedule",
      badge: String(unmarkedLessons),
      tone: "bg-amber-light text-amber-dark",
      title: unmarkedLessons === 1 ? "Отметить прошлое занятие" : `Отметить прошлые занятия`,
      sub: "От «Было» зависит баланс оплат",
    });
  if (debts.length > 0)
    rows.push({
      key: "debts",
      href: debts.length === 1 ? `/teacher/student/${debts[0].id}` : "/teacher/payments",
      badge: "₽",
      tone: "bg-coral-light text-coral-text",
      title: debts.length === 1 ? `Долг: ${debts[0].name}` : `Долги: ${debts.length} ${pluralRu(debts.length, ["ученик", "ученика", "учеников"])}`,
      sub:
        debts.length === 1
          ? `${debts[0].lessons} ${pluralRu(debts[0].lessons, ["занятие не оплачено", "занятия не оплачены", "занятий не оплачено"])}`
          : names(debts),
    });
  if (overdue.length > 0)
    rows.push({
      key: "overdue",
      href: overdue.length === 1 ? `/teacher/student/${overdue[0].id}` : "/teacher#students",
      badge: String(overdue.length),
      tone: "bg-coral-light text-coral-text",
      title: "Просрочена домашка",
      sub: names(overdue),
    });
  if (inactive.length > 0)
    rows.push({
      key: "inactive",
      href: inactive.length === 1 ? `/teacher/student/${inactive[0].id}` : "/teacher#students",
      badge: String(inactive.length),
      tone: "bg-grid text-ink-soft",
      title: "Давно не занимались",
      sub:
        inactive.length === 1
          ? `${inactive[0].name}: ${daysLabel(inactive[0].days)}`
          : inactive
              .slice(0, 2)
              .map((s) => `${s.name.split(" ")[0]} — ${daysLabel(s.days)}`)
              .join(" · ") + (inactive.length > 2 ? ` · ещё ${inactive.length - 2}` : ""),
    });

  if (rows.length === 0 && openQuestions === 0) {
    return (
      <div className="mb-4 flex items-center gap-3 rounded-2xl border border-line-soft bg-white px-4 py-3">
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-pine-light font-black text-pine-dark">✓</span>
        <p className="text-sm font-bold text-ink">Всё под контролем — срочных дел нет</p>
      </div>
    );
  }

  return (
    <section className="mb-4 overflow-hidden rounded-[20px] border border-line-soft bg-white">
      <h2 className="px-4 pb-1 pt-3 font-display text-[16px] font-black text-ink">Нужно внимание</h2>
      <ul>
        {rows.map((r, i) => (
          <li key={r.key} className={i < rows.length - 1 ? "border-b border-line-soft" : ""}>
            <a href={r.href} className="flex min-h-[56px] items-center gap-3 px-4 py-2 transition hover:bg-paper">
              <span className={`flex h-8 min-w-8 items-center justify-center rounded-[10px] px-1.5 text-sm font-black ${r.tone}`}>
                {r.badge}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-extrabold text-ink">{r.title}</span>
                {r.sub && <span className="block truncate text-[12px] text-ink-soft">{r.sub}</span>}
              </span>
              <span aria-hidden className="text-lg font-black text-ink-soft/60">›</span>
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
