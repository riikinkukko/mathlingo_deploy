/**
 * Мост действий репетитора для приложения: /api/m/teacher/action вызывает те
 * же server actions, что и сайт, от имени вошедшего по токену репетитора
 * (lib/auth.ts:runAsUser). Права, проверки и уведомления — общие с сайтом.
 *
 * Разрешены ТОЛЬКО действия из таблицы ниже. Действия сайта бывают трёх видов:
 *   form  — (formData) => void, результат сообщают редиректом (?error=код);
 *   state — (prev, formData) => {error?|ok?...} (useActionState на сайте);
 *   call  — свои аргументы (см. ниже).
 */
import { isRedirectError } from "next/dist/client/components/redirect-error";
import {
  addParentLinkAction,
  addStudentAction,
  cancelTeacherInviteAction,
  createHomeworkAction,
  createLessonLogAction,
  deleteStudentAction,
  markAllNotificationsReadAction,
  reviewAttemptAction,
} from "@/app/actions";
import {
  createLessonAction,
  deleteLessonAction,
  deleteLessonSeriesFromAction,
  rescheduleLessonAction,
  setGroupLessonStatusAction,
  setLessonStatusAction,
} from "@/app/actions-schedule";
import {
  addStudentPaymentAction,
  deleteStudentPaymentAction,
  saveChargeMissedAction,
  saveLessonPriceAction,
  savePaymentInstructionsAction,
  sendPaymentReminderNowAction,
  setPaymentRemindersAction,
  updateStudentPaymentAction,
} from "@/app/actions-student-payments";
import { addMockScoreAction, deleteMockScoreAction, saveStudentNotesAction, setTargetScoreAction } from "@/app/actions-student-goals";
import { createGroupAction, deleteGroupAction, updateGroupAction } from "@/app/actions-groups";
import { answerQuestionAction } from "@/app/actions-questions";
import { createQuickHomeworkAction } from "@/app/actions-quick-homework";
import { nudgeStudentAction } from "@/app/actions-nudge";
import { disconnectTelegramAction, saveTeacherTelegramPrefsAction } from "@/app/actions-telegram";
import { deleteTemplateAction, saveHomeworkAsTemplateAction } from "@/app/actions-templates";

type Fields = Record<string, unknown>;
type Entry =
  | { kind: "form"; fn: (fd: FormData) => Promise<unknown> }
  | { kind: "state"; fn: (prev: never, fd: FormData) => Promise<unknown> }
  | { kind: "call"; fn: (f: Fields) => Promise<unknown> };

const form = (fn: (fd: FormData) => Promise<unknown>): Entry => ({ kind: "form", fn });
const state = (fn: (prev: never, fd: FormData) => Promise<unknown>): Entry => ({ kind: "state", fn });

export const TEACHER_ACTIONS: Record<string, Entry> = {
  // Ученики и родители
  addStudent: state(addStudentAction as never),
  addParent: state(addParentLinkAction as never),
  deleteStudent: form(deleteStudentAction),
  cancelInvite: form(cancelTeacherInviteAction),
  nudge: state(nudgeStudentAction as never),
  setTargetScore: state(setTargetScoreAction as never),
  addMockScore: state(addMockScoreAction as never),
  deleteMockScore: form(deleteMockScoreAction),
  saveNotes: state(saveStudentNotesAction as never),
  // Занятия
  createLesson: state(createLessonAction as never),
  setLessonStatus: form(setLessonStatusAction),
  setGroupLessonStatus: form(setGroupLessonStatusAction),
  rescheduleLesson: state(rescheduleLessonAction as never),
  deleteLesson: form(deleteLessonAction),
  deleteLessonSeries: form(deleteLessonSeriesFromAction),
  createLessonLog: form(createLessonLogAction),
  // Оплаты
  addPayment: state(addStudentPaymentAction as never),
  updatePayment: state(updateStudentPaymentAction as never),
  deletePayment: form(deleteStudentPaymentAction),
  setPaymentReminders: state(setPaymentRemindersAction as never),
  savePaymentInstructions: state(savePaymentInstructionsAction as never),
  sendPaymentReminder: state(sendPaymentReminderNowAction as never),
  saveLessonPrice: state(saveLessonPriceAction as never),
  saveChargeMissed: state(saveChargeMissedAction as never),
  // Задания
  createHomework: form(createHomeworkAction),
  createQuickHomework: form(createQuickHomeworkAction),
  saveTemplate: state(saveHomeworkAsTemplateAction as never),
  deleteTemplate: form(deleteTemplateAction),
  // Группы
  createGroup: form(createGroupAction),
  updateGroup: form(updateGroupAction),
  deleteGroup: form(deleteGroupAction),
  // Вопросы и проверка
  answerQuestion: state(answerQuestionAction as never),
  reviewAttempt: {
    kind: "call",
    fn: (f) =>
      reviewAttemptAction(
        String(f.attemptId ?? ""),
        f.decision === "needs_revision" ? "needs_revision" : "approved",
        String(f.feedback ?? ""),
        typeof f.markup === "string" ? f.markup : null,
        typeof f.score === "number" ? f.score : null
      ),
  },
  // Настройки
  saveTelegramPrefs: state(saveTeacherTelegramPrefsAction as never),
  disconnectTelegram: form((fd) => disconnectTelegramAction(fd)),
  markAllNotificationsRead: { kind: "call", fn: () => markAllNotificationsReadAction() },
};

/** Тексты ошибок, которые действия сайта сообщают кодом в адресе (?error=…). */
const ERROR_TEXT: Record<string, string> = {
  noproblems: "Не выбрано ни одной задачи.",
  notitle: "Укажите название.",
  nodue: "Укажите срок сдачи.",
  access: "Ученик или группа не найдены.",
  name: "Введите название.",
  members: "В группе должно быть хотя бы два ученика.",
  notfound: "Не найдено.",
};

/** Поля JSON → FormData. Массивы — повторяющиеся поля (problemIds, studentIds). */
export function toFormData(fields: Fields): FormData {
  const fd = new FormData();
  for (const [k, v] of Object.entries(fields)) {
    if (v === undefined || v === null) continue;
    if (Array.isArray(v)) for (const x of v) fd.append(k, String(x));
    else if (typeof v === "boolean") {
      if (v) fd.append(k, "on");
    } else fd.append(k, String(v));
  }
  return fd;
}

export type ActionOutcome = { ok: true; result?: unknown; redirect?: string } | { ok: false; error: string };

/** Ошибка из адреса редиректа: любой параметр *error / *error* со значением. */
function errorFromUrl(url: string): string | null {
  const u = new URL(url, "https://x.local");
  for (const [k, v] of u.searchParams) {
    if (/error/i.test(k) && v) return ERROR_TEXT[v] ?? "Не получилось. Проверьте поля и попробуйте ещё раз.";
  }
  return null;
}

function redirectUrl(e: unknown): string | null {
  if (!isRedirectError(e)) return null;
  const digest = String((e as { digest?: string }).digest ?? "");
  // NEXT_REDIRECT;<type>;<url>;<status>;
  const parts = digest.split(";");
  return parts[2] ?? "/";
}

/** Выполнить действие (уже внутри runAsUser). */
export async function runTeacherAction(name: string, fields: Fields): Promise<ActionOutcome> {
  const entry = TEACHER_ACTIONS[name];
  if (!entry) return { ok: false, error: "Неизвестное действие" };
  try {
    let result: unknown;
    if (entry.kind === "form") result = await entry.fn(toFormData(fields));
    else if (entry.kind === "state") result = await entry.fn(null as never, toFormData(fields));
    else result = await entry.fn(fields);
    if (result && typeof result === "object" && "error" in result && (result as { error?: unknown }).error) {
      return { ok: false, error: String((result as { error: unknown }).error) };
    }
    return { ok: true, result };
  } catch (e) {
    const url = redirectUrl(e);
    if (url === null) throw e;
    const err = errorFromUrl(url);
    if (err) return { ok: false, error: err };
    // Редирект на /login — нет доступа (не репетитор, отозванная сессия).
    if (url.startsWith("/login")) return { ok: false, error: "Нет доступа" };
    return { ok: true, redirect: url };
  }
}
