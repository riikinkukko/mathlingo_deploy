/**
 * Кабинет репетитора в приложении: данные экранов (/api/m/teacher/data) и
 * действия (/api/m/teacher/action — те же, что на сайте).
 */
import { useState } from "react";
import { Alert } from "react-native";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import * as Haptics from "expo-haptics";
import { api, errorText } from "./api";

// ---------- типы ответов ----------

export interface TLessonStudent {
  id: string;
  name: string;
  lessonId: string;
  status: string;
}
export interface TLesson {
  id: string;
  lessonIds: string[];
  groupLessonId: string | null;
  groupId: string | null;
  title: string;
  startsAt: string;
  durationMin: number;
  topic: string | null;
  status: string;
  seriesId: string | null;
  students: TLessonStudent[];
}
export interface TPlan {
  name: string;
  source: string;
  limit: number | null;
  trialDaysLeft: number | null;
  until: string | null;
  studentsCount: number;
  atLimit: boolean;
}
export interface TStudentRow {
  id: string;
  name: string;
  grade: number | null;
  targetScore: number | null;
  lastActiveAt: string | null;
  idleDays: number;
  everActive: boolean;
  nudged: boolean;
  solved: number;
  accuracy: number;
  attempts: number;
  solvedWeek: number;
  hwOpen: number;
  hwOverdue: number;
  reviews: number;
  mock: number | null;
  groups: string[];
  debt: string | null;
}
export interface TGroup {
  id: string;
  name: string;
  members: { id: string; name: string }[];
}
export interface THome {
  name: string;
  emailVerified: boolean;
  telegram: boolean;
  plan: TPlan;
  today: TLesson[];
  attention: {
    reviews: number;
    questions: number;
    unmarked: TLesson[];
    overdue: { id: string; name: string; count: number }[];
    inactive: { id: string; name: string; days: number | null; nudged: boolean }[];
    debts: { id: string; name: string; label: string }[];
  };
  students: TStudentRow[];
  groups: TGroup[];
  invites: { id: string; name: string; email: string; createdAt: string }[];
}
export interface TBalance {
  balance: number;
  balanceRub: number | null;
  priceRub: number | null;
  paidLessons: number;
  paidRub: number;
  chargedLessons: number;
  lastPaidAt: string | null;
  debt: string | null;
}
export interface TPayment {
  id: string;
  amountRub: number;
  lessonsCount: number;
  paidAt: string;
  note: string | null;
}
export interface TStudent {
  student: {
    id: string;
    name: string;
    email: string;
    grade: number | null;
    targetScore: number | null;
    nudged: boolean;
    paymentReminders: boolean;
    lessonPriceRub: number | null;
    groupLessonPriceRub: number | null;
  };
  stats: { solved: number; accuracy: number; attempts: number; activeDays7: number; lastActiveAt: string | null };
  weak: { mistakes: number; numbers: number[] };
  reviews: number;
  homeworks: {
    id: string;
    title: string;
    kind: "homework" | "test" | "exam";
    dueDate: string;
    createdAt: string;
    total: number;
    done: number;
    overdue: boolean;
    complete: boolean;
  }[];
  lessons: { upcoming: TLesson[]; unmarked: TLesson[] };
  logs: { id: string; date: string; topic: string; report: string }[];
  balance: TBalance | null;
  payments: TPayment[];
  mocks: { id: string; score: number; takenAt: string; note: string | null }[];
  notes: string;
  notesUpdatedAt: string | null;
  parents: { id: string; name: string; email: string }[];
}
export interface TSchedule {
  weekStart: string;
  today: string;
  days: { key: string; lessons: TLesson[] }[];
  unmarked: TLesson[];
  next: TLesson | null;
  students: { id: string; name: string }[];
  groups: { id: string; name: string; count: number }[];
}
export interface TReviewItem {
  attemptId: string;
  student: { id: string; name: string };
  problem: { id: string; text: string; egeTaskNumber: number | null; solution: string; diagramSvg: string | null };
  maxPoints: number | null;
  skillTitle: string;
  answer: string;
  submittedAt: string;
  hasImage: boolean;
  fromMock: boolean;
}
export interface TPayments {
  incomeThis: number;
  incomePrev: number;
  balances: (TBalance & { studentId: string; name: string })[];
  recent: (TPayment & { studentId: string; name: string })[];
  paymentInstructions: string;
  chargeMissed: boolean;
}
export interface TGroupDetail {
  group: TGroup;
  students: { id: string; name: string }[];
  unmarked: TLesson[];
  upcoming: TLesson[];
  homeworks: {
    batchId: string;
    title: string;
    kind: string;
    dueDate: string;
    problemCount: number;
    rows: { studentId: string; name: string; done: number; total: number; overdue: boolean }[];
  }[];
}
export interface TQuestion {
  id: string;
  studentId: string;
  studentName: string;
  problemId: string;
  problemText: string;
  egeTaskNumber: number | null;
  studentAnswer: string | null;
  message: string;
  answer: string | null;
  answeredAt: string | null;
  createdAt: string;
  hasSketch: boolean;
}
export interface TBuilder {
  to: { kind: "student" | "group"; id: string; name: string };
  weak: { mistakes: number; numbers: number[] } | null;
  examNumbers: number[];
  defaultDue: string;
  templates: { id: string; title: string; kind: string; count: number; allowHints: boolean; timeLimitMinutes: number | null }[];
  topics: { id: string; title: string; chapters: { id: string; title: string; skills: { id: string; title: string }[] }[] }[];
}
export interface TSettings {
  name: string;
  email: string;
  plan: TPlan;
  telegram: { connected: boolean; homework: boolean; lessons: boolean; digest: boolean };
}

// ---------- загрузка ----------

type Views = {
  home: THome;
  student: TStudent;
  schedule: TSchedule;
  reviews: { items: TReviewItem[] };
  payments: TPayments;
  groups: { groups: TGroup[]; students: { id: string; name: string }[] };
  group: TGroupDetail;
  questions: { questions: TQuestion[] };
  builder: TBuilder;
  problems: { problems: { id: string; text: string; egeTaskNumber: number | null; answerType: string; difficulty: number; diagramSvg: string | null }[] };
  settings: TSettings;
};

/** Данные экрана репетитора. Все ключи начинаются с "t" — действия сбрасывают их разом. */
export function useT<V extends keyof Views>(view: V, params: Record<string, string | undefined | null> = {}, enabled = true) {
  const qs = new URLSearchParams({ view });
  for (const [k, v] of Object.entries(params)) if (v) qs.set(k, v);
  return useQuery({
    queryKey: ["t", view, params],
    queryFn: () => api<Views[V]>(`/api/m/teacher/data?${qs.toString()}`),
    enabled,
  });
}

/** Действие репетитора. Бросает ApiError с понятным текстом. */
export function tAction<R = unknown>(name: string, fields: Record<string, unknown> = {}) {
  return api<{ ok: true; result?: R; redirect?: string }>("/api/m/teacher/action", { body: { name, fields } });
}

/**
 * Действие с индикатором и обновлением всех экранов репетитора.
 * run(...) → true при успехе; ошибку показывает сам (Alert).
 */
export function useTAction() {
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  async function run(name: string, fields: Record<string, unknown> = {}, opts: { key?: string; silent?: boolean } = {}) {
    setBusy(opts.key ?? name);
    try {
      const r = await tAction(name, fields);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
      await qc.invalidateQueries({ queryKey: ["t"] });
      return r;
    } catch (e) {
      if (!opts.silent) Alert.alert("Не получилось", errorText(e));
      return null;
    } finally {
      setBusy(null);
    }
  }
  return { run, busy };
}

/** Подтверждение перед необратимым действием. */
export function confirm(title: string, text: string, ok: string, onOk: () => void) {
  Alert.alert(title, text, [
    { text: "Отмена", style: "cancel" },
    { text: ok, style: "destructive", onPress: onOk },
  ]);
}

// ---------- даты по Москве ----------

const MSK = "Europe/Moscow";
export function mskKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: MSK }).format(d);
}
export function addDays(key: string, n: number): string {
  const d = new Date(`${key}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function dayLabel(key: string, opts: Intl.DateTimeFormatOptions = { weekday: "short", day: "numeric", month: "long" }): string {
  return new Date(`${key}T12:00:00Z`).toLocaleDateString("ru-RU", { timeZone: "UTC", ...opts });
}
export function timeLabel(iso: string): string {
  return new Date(iso).toLocaleTimeString("ru-RU", { timeZone: MSK, hour: "2-digit", minute: "2-digit" });
}
export function timeRange(iso: string, min: number): string {
  return `${timeLabel(iso)}–${timeLabel(new Date(new Date(iso).getTime() + min * 60_000).toISOString())}`;
}
/** «сегодня» / «вчера» / «12 ноября» */
export function relDay(isoOrKey: string): string {
  const key = isoOrKey.length === 10 ? isoOrKey : mskKey(new Date(isoOrKey));
  const today = mskKey();
  if (key === today) return "сегодня";
  if (key === addDays(today, -1)) return "вчера";
  if (key === addDays(today, 1)) return "завтра";
  return dayLabel(key, { day: "numeric", month: "long" });
}
export function rub(n: number): string {
  return `${n.toLocaleString("ru-RU")} ₽`;
}
export function initials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}
export const KIND_LABEL: Record<string, string> = { homework: "Домашка", test: "Контрольная", exam: "Пробник" };
