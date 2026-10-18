import { notFound } from "next/navigation";
import { inArray, isNotNull, and } from "drizzle-orm";
import { getSessionUser } from "@/lib/auth";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getProblem, toPublicProblem } from "@/lib/queries";
import type { Problem } from "@/lib/types";
import MockRunner from "@/components/mock/MockRunner";
import SelfCheck from "@/components/mock/SelfCheck";
import DiagramRenderer from "@/components/diagrams/DiagramRenderer";
import {
  autoFinishIfExpired,
  getMockAttempt,
  getMockImages,
  listMockAttempts,
  part2States,
  type MockAttemptRow,
  type Part2State,
} from "@/lib/mock-queries";
import {
  MOCK_MODES,
  PASS_TEST_SCORE,
  SCALE_IS_ESTIMATE,
  humanDuration,
  isMockMode,
  isPart1,
  maxPrimaryFor,
} from "@/lib/mock-exam";
import { criteriaFor } from "@/lib/ege-criteria";
import { pluralRu } from "@/lib/pluralize";

export default async function MockAttemptPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ resume?: string }>;
}) {
  const { id } = await props.params;
  const { resume } = await props.searchParams;
  const user = (await getSessionUser())!;
  const raw = await getMockAttempt(id, user.id);
  if (!raw) notFound();
  const m = await autoFinishIfExpired(user, raw);

  const problems = new Map<string, Problem>(
    (await Promise.all(m.items.map((it) => getProblem(it.problemId))))
      .filter((p): p is Problem => !!p)
      .map((p) => [p.id, p])
  );
  const modeTitle = isMockMode(m.mode) ? MOCK_MODES[m.mode].title : "";

  if (!m.finishedAt) {
    const images = await getMockImages(m.id);
    return (
      <MockRunner
        mockId={m.id}
        variant={m.variant}
        modeTitle={modeTitle}
        deadlineAt={m.deadlineAt ? new Date(m.deadlineAt).toISOString() : null}
        items={m.items
          .filter((it) => problems.has(it.problemId))
          .map((it) => ({ n: it.n, problem: toPublicProblem(problems.get(it.problemId)!) }))}
        initialAnswers={m.answers}
        initialFlags={m.flags}
        initialTimeSpent={m.timeSpent}
        initialImages={images}
        hasTeacher={!!user.teacherId}
        resumed={resume === "1" || Object.keys(m.answers).length > 0}
      />
    );
  }

  return <Results m={m} problems={problems} modeTitle={modeTitle} hasTeacher={!!user.teacherId} targetScore={user.targetScore ?? null} studentId={user.id} />;
}

async function Results({
  m,
  problems,
  modeTitle,
  hasTeacher,
  targetScore,
  studentId,
}: {
  m: MockAttemptRow;
  problems: Map<string, Problem>;
  modeTitle: string;
  hasTeacher: boolean;
  targetScore: number | null;
  studentId: string;
}) {
  const p2 = await part2States(m, hasTeacher);
  const p2ById = new Map(p2.map((s) => [s.problemId, s]));
  const attemptIds = p2.map((s) => s.attemptId).filter((x): x is string => !!x);
  const marked = new Set(
    attemptIds.length
      ? (
          await db
            .select({ id: schema.attemptImages.attemptId })
            .from(schema.attemptImages)
            .where(and(inArray(schema.attemptImages.attemptId, attemptIds), isNotNull(schema.attemptImages.annotated)))
        ).map((r) => r.id)
      : []
  );

  const part1Items = m.items.filter((it) => isPart1(it.n));
  const part2Items = m.items.filter((it) => !isPart1(it.n));
  const correct1 = part1Items.filter((it) => m.part1Correct?.[it.problemId]).length;
  const part2Known = p2.reduce((s, x) => s + (x.score ?? 0), 0);
  const part2Max = p2.reduce((s, x) => s + x.max, 0);
  const pending = p2.filter((x) => x.status === "pending").length;
  const unscored = p2.filter((x) => x.status === "unscored").length;
  const maxPrimary = maxPrimaryFor(m.items.map((it) => it.n));
  const totalTime = Object.values(m.timeSpent).reduce((s, x) => s + x, 0);
  const test = m.testScore ?? 0;

  // Сравнение с прошлым полным пробником.
  const history = (await listMockAttempts(studentId)).filter(
    (a) => a.finishedAt && a.id !== m.id && a.mode !== "part1" && new Date(a.finishedAt) < new Date(m.finishedAt!)
  );
  const prev = m.mode !== "part1" ? history[0] : undefined;
  const delta = prev && prev.testScore != null ? test - prev.testScore : null;

  const wrong1 = part1Items.filter((it) => !m.part1Correct?.[it.problemId]);
  const slowest = [...m.items]
    .filter((it) => (m.timeSpent[it.problemId] ?? 0) >= 60)
    .sort((a, b) => (m.timeSpent[b.problemId] ?? 0) - (m.timeSpent[a.problemId] ?? 0))
    .slice(0, 3);
  const skillIds = [...new Set(wrong1.map((it) => problems.get(it.problemId)?.skillId).filter((x): x is string => !!x))];
  const skills = skillIds.length
    ? await db.select({ id: schema.skills.id, title: schema.skills.title }).from(schema.skills).where(inArray(schema.skills.id, skillIds))
    : [];
  const skillTitle = new Map(skills.map((s) => [s.id, s.title]));
  const finishedLabel = new Date(m.finishedAt!).toLocaleString("ru-RU", {
    timeZone: "Europe/Moscow",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  });

  return (
    <div className="min-h-screen bg-paper pb-16">
      <header className="border-b border-line-soft bg-white pt-[var(--app-sat)]">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <a
            href="/student/mock"
            aria-label="К списку пробников"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-soft transition hover:border-pine hover:text-pine"
          >
            ←
          </a>
          <div className="min-w-0">
            <p className="truncate font-display text-[16px] font-black text-ink">Вариант {m.variant} — разбор</p>
            <p className="truncate text-[12px] font-bold text-ink-soft">
              {modeTitle} · сдан {finishedLabel}
            </p>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-3xl space-y-5 px-4 pt-5">
        {/* ---------- Итог ---------- */}
        <section className="rounded-[24px] bg-pine-dark p-5 text-white sm:p-6">
          <div className="flex flex-wrap items-end gap-x-6 gap-y-3">
            <div>
              <p className="font-display text-6xl font-black leading-none tabular-nums">{test}</p>
              <p className="mt-1.5 text-[13px] font-bold text-white/70">
                {m.mode === "part1" ? "тестовых баллов за первую часть" : "тестовых баллов"}
                {SCALE_IS_ESTIMATE ? " · ориентировочно" : ""}
              </p>
            </div>
            <dl className="flex flex-wrap gap-x-5 gap-y-2 pb-1 text-[13px]">
              <div>
                <dt className="text-white/60">Первичные</dt>
                <dd className="font-display text-lg font-black">
                  {m.primaryScore ?? 0} из {maxPrimary}
                </dd>
              </div>
              <div>
                <dt className="text-white/60">Часть 1</dt>
                <dd className="font-display text-lg font-black">
                  {correct1} из {part1Items.length}
                </dd>
              </div>
              {part2Items.length > 0 && (
                <div>
                  <dt className="text-white/60">Часть 2</dt>
                  <dd className="font-display text-lg font-black">
                    {part2Known} из {part2Max}
                    {pending > 0 && <span className="ml-1 text-[12px] font-bold text-white/70">+ на проверке</span>}
                  </dd>
                </div>
              )}
              {totalTime > 0 && (
                <div>
                  <dt className="text-white/60">Время</dt>
                  <dd className="font-display text-lg font-black">{humanDuration(totalTime)}</dd>
                </div>
              )}
            </dl>
          </div>
          <div className="mt-4 flex flex-wrap gap-2 text-[13px] font-bold">
            {delta !== null && (
              <span className="rounded-pill bg-white/15 px-3 py-1">
                {delta > 0 ? `+${delta}` : delta} к прошлому пробнику
              </span>
            )}
            {m.mode !== "part1" && targetScore && (
              <span className="rounded-pill bg-white/15 px-3 py-1">
                {test >= targetScore ? `Цель ${targetScore} достигнута` : `До цели ${targetScore} — ${targetScore - test} ${pluralRu(targetScore - test, ["балл", "балла", "баллов"])}`}
              </span>
            )}
            {test > 0 && test < PASS_TEST_SCORE && (
              <span className="rounded-pill bg-coral px-3 py-1">Ниже порога {PASS_TEST_SCORE} баллов</span>
            )}
          </div>
        </section>

        {pending > 0 && (
          <p className="rounded-2xl bg-violet-light p-4 text-sm font-bold text-violet-text">
            {pending} {pluralRu(pending, ["решение", "решения", "решений"])} второй части у репетитора на проверке. Итог обновится сам,
            когда он поставит баллы, — мы пришлём уведомление.
          </p>
        )}
        {unscored > 0 && (
          <a href="#part2" className="block rounded-2xl bg-amber-light p-4 text-sm font-bold text-amber-text">
            Оцени вторую часть по критериям — пока итог посчитан без {unscored === 1 ? "одного задания" : `${unscored} заданий`}. ↓
          </a>
        )}

        {/* ---------- Что подтянуть ---------- */}
        {(wrong1.length > 0 || slowest.length > 0) && (
          <section className="rounded-[20px] border border-line-soft bg-white p-4 sm:p-5">
            <h2 className="font-display text-lg font-black text-ink">Что подтянуть</h2>
            {wrong1.length > 0 && (
              <>
                <p className="mt-2 text-[13px] text-ink-soft">
                  В первой части не засчитаны: {wrong1.map((it) => `№${it.n}`).join(", ")}. Эти задачи уже в «Моих ошибках».
                </p>
                {skills.length > 0 && (
                  <ul className="mt-3 flex flex-wrap gap-2">
                    {skillIds.slice(0, 6).map((sid) => (
                      <li key={sid}>
                        <a
                          href={`/student/skill/${sid}`}
                          className="inline-block rounded-pill border-2 border-line px-3 py-1.5 text-[13px] font-bold text-ink transition hover:border-pine hover:text-pine"
                        >
                          {skillTitle.get(sid) ?? "Навык"}
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </>
            )}
            {slowest.length > 0 && (
              <p className="mt-3 text-[13px] text-ink-soft">
                Дольше всего: {slowest.map((it) => `№${it.n} — ${humanDuration(m.timeSpent[it.problemId] ?? 0)}`).join(", ")}.
                {" "}На экзамене на первую часть обычно закладывают около часа.
              </p>
            )}
          </section>
        )}

        {/* ---------- Часть 1 ---------- */}
        <section>
          <h2 className="mb-2 font-display text-lg font-black text-ink">Часть 1</h2>
          <div className="overflow-hidden rounded-[20px] border border-line-soft bg-white">
            <div className="grid grid-cols-[2.5rem_1fr_1fr_4rem] gap-2 border-b border-line-soft px-4 py-2 text-[11px] font-black text-ink-soft sm:grid-cols-[2.5rem_1fr_1fr_5rem_2rem]">
              <span>№</span>
              <span>Твой ответ</span>
              <span>Верный</span>
              <span className="text-right">Время</span>
              <span className="hidden sm:block" />
            </div>
            {part1Items.map((it) => {
              const p = problems.get(it.problemId);
              if (!p) return null;
              const ok = !!m.part1Correct?.[it.problemId];
              const ans = m.answers[it.problemId];
              return (
                <details key={it.problemId} className="group border-b border-line-soft last:border-b-0">
                  <summary className="grid cursor-pointer list-none grid-cols-[2.5rem_1fr_1fr_4rem] items-center gap-2 px-4 py-3 transition hover:bg-paper sm:grid-cols-[2.5rem_1fr_1fr_5rem_2rem]">
                    <span className={`flex h-7 w-7 items-center justify-center rounded-lg font-display text-[13px] font-black ${ok ? "bg-pine-light text-pine-dark" : "bg-coral-light text-coral"}`}>
                      {it.n}
                    </span>
                    <span className={`truncate font-mono text-[15px] font-bold ${ans ? (ok ? "text-ink" : "text-coral line-through decoration-2") : "text-ink-soft"}`}>
                      {ans ?? "—"}
                    </span>
                    <span className="truncate font-mono text-[15px] font-bold text-ink">{p.correctAnswer.replace(".", ",")}</span>
                    <span className="text-right text-[12px] font-bold tabular-nums text-ink-soft">
                      {m.timeSpent[it.problemId] ? humanDuration(m.timeSpent[it.problemId]) : "—"}
                    </span>
                    <span className="hidden text-right text-ink-soft transition group-open:rotate-180 sm:block" aria-hidden>
                      ▾
                    </span>
                  </summary>
                  <div className="space-y-3 bg-paper/60 px-4 pb-4 pt-1">
                    {p.diagram && (
                      <div className="h-44 rounded-2xl border border-line-soft bg-white p-2">
                        <DiagramRenderer spec={p.diagram} />
                      </div>
                    )}
                    <p className="whitespace-pre-line text-[14px] font-semibold leading-relaxed text-ink">{p.text}</p>
                    <div className="rounded-2xl bg-white p-3">
                      <p className="mb-1 text-[12px] font-black text-pine-dark">Разбор</p>
                      <p className="whitespace-pre-line text-[14px] leading-relaxed text-ink">{p.explanation}</p>
                    </div>
                    {p.skillId && (
                      <a href={`/student/skill/${p.skillId}`} className="inline-block text-[13px] font-black text-pine hover:underline">
                        Потренировать этот навык
                      </a>
                    )}
                  </div>
                </details>
              );
            })}
          </div>
        </section>

        {/* ---------- Часть 2 ---------- */}
        {part2Items.length > 0 && (
          <section id="part2" className="scroll-mt-4">
            <h2 className="mb-2 font-display text-lg font-black text-ink">Часть 2</h2>
            <div className="space-y-3">
              {part2Items.map((it) => {
                const p = problems.get(it.problemId);
                const st = p2ById.get(it.problemId);
                if (!p || !st) return null;
                return (
                  <Part2Card
                    key={it.problemId}
                    mockId={m.id}
                    p={p}
                    st={st}
                    text={m.answers[it.problemId]}
                    seconds={m.timeSpent[it.problemId] ?? 0}
                    marked={st.attemptId ? marked.has(st.attemptId) : false}
                    hasTeacher={hasTeacher}
                  />
                );
              })}
            </div>
          </section>
        )}

        <div className="flex flex-col gap-2 sm:flex-row">
          <a href="/student/mock" className="btn-primary flex-1">
            Решить другой вариант
          </a>
          {wrong1.length > 0 && (
            <a href="/student/mistakes" className="btn-secondary flex-1">
              Перерешать ошибки
            </a>
          )}
        </div>
        {SCALE_IS_ESTIMATE && (
          <p className="text-center text-[12px] text-ink-soft">
            Перевод в тестовые баллы — по шкале 2026 года, пересчитанной на 33 первичных балла ЕГЭ-2027. Официальную шкалу
            опубликуют ближе к экзамену.
          </p>
        )}
      </div>
    </div>
  );
}

function Part2Card({
  mockId,
  p,
  st,
  text,
  seconds,
  marked,
  hasTeacher,
}: {
  mockId: string;
  p: Problem;
  st: Part2State;
  text?: string;
  seconds: number;
  marked: boolean;
  hasTeacher: boolean;
}) {
  const criteria = criteriaFor(st.n);
  const badge =
    st.status === "pending"
      ? { text: "на проверке", cls: "bg-violet-light text-violet-text" }
      : st.status === "unscored"
        ? { text: "оцени себя", cls: "bg-amber-light text-amber-text" }
        : st.status === "empty"
          ? { text: "нет решения · 0", cls: "bg-paper text-ink-soft" }
          : { text: `${st.score} из ${st.max}`, cls: st.score === st.max ? "bg-pine-light text-pine-dark" : "bg-paper text-ink" };
  return (
    <article className="rounded-[20px] border border-line-soft bg-white p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-2xl font-black leading-none text-ink">
          {st.n}
          <span className="ml-2 align-middle text-[12px] font-bold text-ink-soft">
            до {st.max} {st.max === 1 ? "балла" : "баллов"}
            {seconds >= 60 ? ` · ${humanDuration(seconds)}` : ""}
          </span>
        </p>
        <span className={`shrink-0 rounded-pill px-3 py-1 text-[12px] font-black ${badge.cls}`}>{badge.text}</span>
      </div>

      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] font-black text-ink-soft hover:text-pine">Условие</summary>
        {p.diagram && (
          <div className="mt-2 h-44 rounded-2xl border border-line-soft bg-paper p-2">
            <DiagramRenderer spec={p.diagram} />
          </div>
        )}
        <p className="mt-2 whitespace-pre-line text-[14px] font-semibold leading-relaxed text-ink">{p.text}</p>
      </details>

      {st.hasImage && st.attemptId && (
        <a
          href={`/api/attempt-image/${st.attemptId}${marked ? "?v=markup" : ""}`}
          target="_blank"
          rel="noopener"
          className="mt-3 block overflow-hidden rounded-2xl border border-line bg-white"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={`/api/attempt-image/${st.attemptId}${marked ? "?v=markup" : ""}`}
            alt={marked ? "Твоё решение с пометками репетитора" : "Твоё решение"}
            loading="lazy"
            className="max-h-72 w-full object-contain"
          />
          <span className="block px-3 py-1.5 text-[12px] font-bold text-ink-soft">
            {marked ? "С пометками репетитора · открыть крупно" : "Твоё фото · открыть крупно"}
          </span>
        </a>
      )}
      {text && <p className="mt-3 whitespace-pre-wrap rounded-2xl bg-paper p-3 text-[14px] text-ink">{text}</p>}
      {st.status === "reviewed" && st.feedback && (
        <p className="mt-3 rounded-2xl bg-pine-light p-3 text-[14px] text-ink">
          <span className="font-black text-pine-dark">Репетитор: </span>
          {st.feedback}
        </p>
      )}

      {/* Эталон показываем, когда решение уже не поменять: всегда после сдачи. */}
      <details className="mt-3">
        <summary className="cursor-pointer text-[13px] font-black text-pine">Эталонное решение</summary>
        <div className="mt-2 space-y-2 rounded-2xl bg-paper p-3 text-[14px] leading-relaxed text-ink">
          <p className="whitespace-pre-line">{p.correctAnswer}</p>
          {p.explanation && p.explanation !== p.correctAnswer && (
            <p className="whitespace-pre-line text-ink-soft">{p.explanation}</p>
          )}
        </div>
      </details>

      {!hasTeacher && criteria && (
        <SelfCheck mockId={mockId} problemId={p.id} criteria={criteria} initial={st.status === "self" ? st.score : null} />
      )}
    </article>
  );
}
