/**
 * «Первые шаги» на главной нового репетитора. Раньше пустая главная
 * показывала только «Пока нет учеников» — непонятно, что делать после.
 * Карточка исчезает, когда сделаны основные шаги (ученик, задание, занятие);
 * Telegram — последний, необязательный пункт.
 */
type Step = { key: string; done: boolean; title: string; hint: string; href: string };

export default function TeacherSetupChecklist({
  emailVerified,
  studentsCount,
  homeworks,
  lessons,
  telegram,
  firstStudentId,
}: {
  emailVerified: boolean;
  studentsCount: number;
  homeworks: number;
  lessons: number;
  telegram: boolean;
  firstStudentId?: string;
}) {
  const steps: Step[] = [
    { key: "email", done: emailVerified, title: "Подтвердить email", hint: "Без этого на бесплатном тарифе нельзя добавлять учеников", href: "/teacher/students/new" },
    { key: "student", done: studentsCount > 0, title: "Добавить первого ученика", hint: "Создадим аккаунт и готовое приглашение для мессенджера", href: "/teacher/students/new" },
    {
      key: "hw",
      done: homeworks > 0,
      title: "Задать первое задание",
      hint: "Можно в один клик — по слабым местам ученика",
      href: firstStudentId ? `/teacher/homework/new?studentId=${firstStudentId}` : "/teacher/students/new",
    },
    { key: "lesson", done: lessons > 0, title: "Запланировать занятие", hint: "Ученику и родителю придёт напоминание", href: "/teacher/schedule" },
    { key: "tg", done: telegram, title: "Подключить Telegram", hint: "Сданная домашка и «было ли занятие» — прямо в чат", href: "/teacher/settings#telegram" },
  ];
  const coreDone = steps.filter((s) => s.key !== "tg").every((s) => s.done);
  if (coreDone) return null;
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <section className="mb-4 overflow-hidden rounded-[20px] border border-line-soft bg-white">
      <div className="flex items-baseline justify-between px-4 pb-1 pt-3">
        <h2 className="font-display text-[16px] font-black text-ink">Первые шаги</h2>
        <span className="text-[12px] font-bold text-ink-soft">
          {doneCount} из {steps.length}
        </span>
      </div>
      <div className="mx-4 mb-1 h-1.5 overflow-hidden rounded-pill bg-grid">
        <div className="h-full rounded-pill bg-pine" style={{ width: `${(doneCount / steps.length) * 100}%` }} />
      </div>
      <ul>
        {steps.map((s) => {
          const isNext = s === next;
          return (
            <li key={s.key} className="border-t border-line-soft first:border-t-0">
              <a
                href={s.done ? undefined : s.href}
                aria-disabled={s.done || undefined}
                className={`flex min-h-[56px] items-center gap-3 px-4 py-2 ${s.done ? "" : "transition hover:bg-paper"}`}
              >
                <span
                  aria-hidden
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-black ${
                    s.done ? "bg-pine text-white" : isNext ? "border-2 border-pine text-pine" : "border-2 border-line text-ink-soft"
                  }`}
                >
                  {s.done ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block text-[15px] font-extrabold ${s.done ? "text-ink-soft line-through decoration-ink-soft/40" : "text-ink"}`}>
                    {s.title}
                  </span>
                  {!s.done && <span className="block text-[12px] text-ink-soft">{s.hint}</span>}
                </span>
                {!s.done && <span aria-hidden className={`text-lg font-black ${isNext ? "text-pine" : "text-ink-soft/60"}`}>›</span>}
              </a>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
