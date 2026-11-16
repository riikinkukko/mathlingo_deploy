import { ScheduledLesson } from "@/lib/types";
import { setLessonStatusAction } from "@/app/actions-schedule";

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
      <div className="flex shrink-0 flex-wrap items-center gap-2">
        <a href={href} className="btn-primary">
          ✍️ Записать отчёт
        </a>
        {/* Промахнулись с «Провести» — вернуть занятие в план одним нажатием. */}
        <form action={setLessonStatusAction}>
          <input type="hidden" name="lessonId" value={lesson.id} />
          <input type="hidden" name="status" value="planned" />
          <input type="hidden" name="from" value={onStudentPage ? "student" : "schedule"} />
          <button type="submit" className="h-10 rounded-pill px-3 text-[13px] font-extrabold text-ink-soft hover:bg-white">
            Отменить отметку
          </button>
        </form>
      </div>
    </div>
  );
}
