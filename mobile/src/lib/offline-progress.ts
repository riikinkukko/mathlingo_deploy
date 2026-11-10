import type { QueryClient } from "@tanstack/react-query";
import { api } from "./api";
import type { HomePayload, SkillPayload } from "./types";

/**
 * Прогресс без сети. Ответы без связи проверяются на телефоне и ждут в очереди
 * (attempt-queue.ts), а путь на главной берётся из сохранённого ответа сервера —
 * он не знал, что урок пройден, и следующий урок не открывался.
 *
 * Здесь мы сами отмечаем прогресс в сохранённых данных. Когда связь появится,
 * очередь уйдёт на сервер, и его ответ заменит наши отметки (он пересчитает
 * всё честно).
 */

/** Задача решена — отметить в сохранённом уроке, чтобы при повторном входе она была решённой. */
export function markProblemSolvedLocally(qc: QueryClient, skillId: string, problemId: string) {
  let firstTime = false;
  qc.setQueryData<SkillPayload>(["skill", skillId], (d) => {
    if (!d || d.status !== "ok") return d;
    const cur = d.states[problemId];
    if (cur?.status === "solved" || cur?.status === "pending") return d;
    firstTime = true;
    return { ...d, states: { ...d.states, [problemId]: { ...(cur ?? {}), status: "solved" } } };
  });
  // «Цель на сегодня» тоже растёт без сети (сервер потом пересчитает сам).
  if (firstTime) {
    qc.setQueriesData<HomePayload>({ queryKey: ["home"] }, (d) =>
      d
        ? {
            ...d,
            stats: {
              ...d.stats,
              dailyGoal: { ...d.stats.dailyGoal, done: Math.min(d.stats.dailyGoal.total, d.stats.dailyGoal.done + 1) },
            },
          }
        : d
    );
  }
}

/** Урок пройден — отметить на пути и открыть следующий урок (во всех сохранённых главных). */
export function markSkillDoneLocally(qc: QueryClient, skillId: string) {
  qc.setQueriesData<HomePayload>({ queryKey: ["home"] }, (d) => {
    if (!d?.topic) return d;
    const flat = d.topic.chapters.flatMap((c) => c.skills);
    const idx = flat.findIndex((s) => s.id === skillId);
    if (idx < 0 || flat[idx].state === "done") return d;
    const next = flat[idx + 1];
    const chapters = d.topic.chapters.map((c) => ({
      ...c,
      skills: c.skills.map((s) => {
        if (s.id === skillId) return { ...s, state: "done" as const, solved: s.total };
        if (next && s.id === next.id && s.state === "locked") return { ...s, state: "current" as const };
        return s;
      }),
    }));
    const topics = d.topics.map((t) => (t.id === d.topic!.id ? { ...t, done: Math.min(t.total, t.done + 1) } : t));
    return { ...d, topics, topic: { ...d.topic, chapters } };
  });
}

/**
 * Пока есть связь — заранее скачать следующий урок (?ahead=1 отдаёт его, даже
 * если он ещё закрыт), чтобы после текущего его можно было пройти без сети.
 */
export function prefetchNextSkill(qc: QueryClient, nextId: string | null | undefined) {
  if (!nextId) return;
  const cached = qc.getQueryData<SkillPayload>(["skill", nextId]);
  if (cached?.status === "ok") return;
  void qc
    .prefetchQuery({ queryKey: ["skill", nextId], queryFn: () => api<SkillPayload>(`/api/m/skill/${nextId}?ahead=1`) })
    .catch(() => {});
}
