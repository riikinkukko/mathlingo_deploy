import { ScheduledLesson } from "@/lib/types";

/**
 * Плашка после «Провести / ✓ Было»: предлагает сразу записать отчёт о занятии.
 * Отчёт в журнале уходит ученику и родителям (в т.ч. в Telegram) — ради этого
 * он и нужен, поэтому напоминаем в момент, когда занятие только что прошло.
 * Занятие проверяется на принадлежность репетитору ДО рендера (в странице).
 */
export default function LessonDoneBanner({
  lesson,
  studentName,
  onStudentPage,
}: {
  lesson: ScheduledLesson;
  studentName?: string;
  /** на странице самого ученика ссылка просто открывает форму журнала ниже */
  onStudentPage?: boolean;
}) {
  const when = new Date(lesson.startsAt).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });
  const href = `/teacher/student/${lesson.studentId}?log=${encodeURIComponent(lesson.id)}#journal`;

  return (
    <div
      role="status"
      className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-card border-2 border-pine/30 bg-pine-light/40 p-4"
    >
      <div>
        <p className="text-sm font-bold text-ink">
          ✓ Занятие {when}
          {studentName && !onStudentPage ? ` · ${studentName}` : ""} отмечено проведённым
        </p>
        <p className="mt-0.5 text-xs text-ink-soft">
          Запишите короткий отчёт — ученик и родители получат его в приложении и в Telegram.
        </p>
      </div>
      <a href={href} className="btn-primary shrink-0">
        ✍️ Записать отчёт
      </a>
    </div>
  );
}
