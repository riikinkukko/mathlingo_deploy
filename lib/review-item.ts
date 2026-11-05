import type { DiagramSpec } from "./types";
import type { PendingReview } from "./queries";

/**
 * Работа на проверке — то, что уходит в браузер репетитора. Только нужные
 * поля: полный User ученика (хеш пароля, платёжные данные) в клиент не попадает.
 */
export interface ReviewItem {
  attemptId: string;
  student: { id: string; name: string };
  problem: {
    id: string;
    text: string;
    egeTaskNumber: number | null;
    /** эталонное решение — для сверки репетитором */
    solution: string;
    diagram: DiagramSpec | null;
  };
  skillTitle: string;
  answer: string;
  submittedAt: string;
  hasImage: boolean;
  fromMock: boolean;
  /** Пометка над работой (например, «ждёт 2 дн» в платных проверках). */
  note?: { text: string; late?: boolean };
  /** Ссылка на карточку ученика — только для своих учеников. */
  studentHref?: string;
}

export function toReviewItem(r: PendingReview, extra: Partial<Pick<ReviewItem, "note" | "studentHref">> = {}): ReviewItem {
  return {
    attemptId: r.attemptId,
    student: { id: r.student.id, name: r.student.name },
    problem: {
      id: r.problem.id,
      text: r.problem.text,
      egeTaskNumber: r.problem.egeTaskNumber ?? null,
      solution: r.problem.explanation || r.problem.correctAnswer,
      diagram: r.problem.diagram ?? null,
    },
    skillTitle: r.skillTitle,
    // «(решение на фото)» — заглушка, когда ученик приложил только фото.
    answer: r.hasImage && r.answer.trim() === "(решение на фото)" ? "" : r.answer,
    submittedAt: r.submittedAt,
    hasImage: r.hasImage,
    fromMock: !!r.fromMock,
    ...extra,
  };
}

/** «сегодня, 14:05» / «вчера, 9:30» / «12 окт, 18:00» — по Москве. */
export function submittedLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const key = (x: Date) => new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(x);
  const time = d.toLocaleTimeString("ru-RU", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit" });
  if (key(d) === key(now)) return `сегодня, ${time}`;
  if (key(d) === key(new Date(now.getTime() - 86_400_000))) return `вчера, ${time}`;
  return `${d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short" })}, ${time}`;
}
