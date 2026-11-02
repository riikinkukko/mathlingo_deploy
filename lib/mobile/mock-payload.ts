/**
 * Пробник ЕГЭ в формате мобильного приложения: список вариантов, данные для
 * решения (без ответов) и разбор после сдачи. Логика — lib/mock-queries.ts и
 * lib/mock-exam.ts, здесь только сборка JSON.
 */
import { inArray } from "drizzle-orm";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { getProblem } from "@/lib/queries";
import type { Problem, User } from "@/lib/types";
import {
  canOpenVariant,
  getMockImages,
  listMockAttempts,
  mockAccess,
  part2States,
  type MockAttemptRow,
} from "@/lib/mock-queries";
import {
  FREE_VARIANTS,
  MAX_PRIMARY,
  MOCK_MODES,
  MOCK_VARIANT_COUNT,
  PASS_TEST_SCORE,
  SCALE_IS_ESTIMATE,
  isMockMode,
  isPart1,
  maxPointsForSlot,
  maxPrimaryFor,
} from "@/lib/mock-exam";
import { criteriaFor } from "@/lib/ege-criteria";
import { mobileProblem } from "./api";
import { diagramSvg } from "./diagram-svg";

const iso = (d: Date | string | null | undefined) => (d ? new Date(d).toISOString() : null);

export async function mockListPayload(user: User) {
  const attempts = await listMockAttempts(user.id);
  const variants = Array.from({ length: MOCK_VARIANT_COUNT }, (_, i) => {
    const v = i + 1;
    const mine = attempts.filter((a) => a.variant === v);
    const best = mine
      .filter((a) => a.finishedAt && a.mode !== "part1" && a.testScore != null)
      .reduce<number | null>((m, a) => (m == null || a.testScore! > m ? a.testScore! : m), null);
    return { variant: v, locked: !canOpenVariant(user, v), best, tries: mine.length };
  });
  const active = attempts.find((a) => !a.finishedAt);
  return {
    allVariants: mockAccess(user).all,
    freeVariants: FREE_VARIANTS,
    modes: (Object.keys(MOCK_MODES) as (keyof typeof MOCK_MODES)[]).map((k) => ({ id: k, ...MOCK_MODES[k] })),
    scaleIsEstimate: SCALE_IS_ESTIMATE,
    targetScore: user.targetScore ?? null,
    variants,
    active: active
      ? { id: active.id, variant: active.variant, mode: active.mode, answered: Object.keys(active.answers).length, total: active.items.length, deadlineAt: iso(active.deadlineAt) }
      : null,
    history: attempts
      .filter((a) => a.finishedAt)
      .map((a) => ({
        id: a.id,
        variant: a.variant,
        mode: a.mode,
        finishedAt: iso(a.finishedAt),
        testScore: a.testScore ?? 0,
        primaryScore: a.primaryScore ?? 0,
        part2Pending: a.part2Pending,
      })),
  };
}

async function problemsOf(m: MockAttemptRow): Promise<Map<string, Problem>> {
  const list = (await Promise.all(m.items.map((it) => getProblem(it.problemId)))).filter((p): p is Problem => !!p);
  return new Map(list.map((p) => [p.id, p]));
}

/** Неоконченный пробник: задачи без ответов, сохранённые ответы, флажки, время, фото. */
export async function mockRunnerPayload(m: MockAttemptRow, user: User) {
  const problems = await problemsOf(m);
  const images = await getMockImages(m.id);
  return {
    status: "running" as const,
    id: m.id,
    variant: m.variant,
    mode: m.mode,
    modeTitle: isMockMode(m.mode) ? MOCK_MODES[m.mode].title : "",
    deadlineAt: iso(m.deadlineAt),
    startedAt: iso(m.startedAt),
    hasTeacher: !!user.teacherId,
    items: m.items
      .filter((it) => problems.has(it.problemId))
      .map((it) => ({ n: it.n, maxPoints: maxPointsForSlot(it.n), problem: mobileProblem(problems.get(it.problemId)!, { offline: false }) })),
    answers: m.answers,
    flags: m.flags,
    timeSpent: m.timeSpent,
    photos: Object.keys(images),
  };
}

/** Разбор сданного пробника. */
export async function mockResultPayload(m: MockAttemptRow, user: User) {
  const problems = await problemsOf(m);
  const hasTeacher = !!user.teacherId;
  const p2 = await part2States(m, hasTeacher);
  const p2ById = new Map(p2.map((s) => [s.problemId, s]));
  const part1Items = m.items.filter((it) => isPart1(it.n));
  const skillIds = [...new Set(part1Items.map((it) => problems.get(it.problemId)?.skillId).filter((x): x is string => !!x))];
  const skills = skillIds.length
    ? await db.select({ id: schema.skills.id, title: schema.skills.title }).from(schema.skills).where(inArray(schema.skills.id, skillIds))
    : [];
  const skillTitle = new Map(skills.map((s) => [s.id, s.title]));

  const history = (await listMockAttempts(user.id)).filter(
    (a) => a.finishedAt && a.id !== m.id && a.mode !== "part1" && new Date(a.finishedAt) < new Date(m.finishedAt!)
  );
  const prev = m.mode !== "part1" ? history[0] : undefined;

  return {
    status: "finished" as const,
    id: m.id,
    variant: m.variant,
    mode: m.mode,
    modeTitle: isMockMode(m.mode) ? MOCK_MODES[m.mode].title : "",
    finishedAt: iso(m.finishedAt),
    hasTeacher,
    testScore: m.testScore ?? 0,
    primaryScore: m.primaryScore ?? 0,
    maxPrimary: maxPrimaryFor(m.items.map((it) => it.n)),
    maxPrimaryExam: MAX_PRIMARY,
    passScore: PASS_TEST_SCORE,
    scaleIsEstimate: SCALE_IS_ESTIMATE,
    targetScore: user.targetScore ?? null,
    previousScore: prev?.testScore ?? null,
    part2Pending: p2.filter((x) => x.status === "pending").length,
    totalTime: Object.values(m.timeSpent).reduce((s, x) => s + x, 0),
    part1: part1Items
      .filter((it) => problems.has(it.problemId))
      .map((it) => {
        const p = problems.get(it.problemId)!;
        return {
          n: it.n,
          problemId: p.id,
          text: p.text,
          diagramSvg: diagramSvg(p.diagram),
          answer: m.answers[it.problemId] ?? null,
          correctAnswer: p.correctAnswer.replace(".", ","),
          correct: !!m.part1Correct?.[it.problemId],
          explanation: p.explanation,
          seconds: m.timeSpent[it.problemId] ?? 0,
          skillId: p.skillId ?? null,
          skillTitle: p.skillId ? skillTitle.get(p.skillId) ?? null : null,
        };
      }),
    part2: m.items
      .filter((it) => !isPart1(it.n) && problems.has(it.problemId))
      .map((it) => {
        const p = problems.get(it.problemId)!;
        const st = p2ById.get(it.problemId);
        return {
          n: it.n,
          problemId: p.id,
          text: p.text,
          diagramSvg: diagramSvg(p.diagram),
          max: maxPointsForSlot(it.n),
          score: st?.score ?? null,
          status: st?.status ?? "empty",
          feedback: st?.feedback ?? null,
          attemptId: st?.attemptId ?? null,
          hasImage: !!st?.hasImage,
          textAnswer: m.answers[it.problemId] ?? null,
          solution: p.correctAnswer,
          explanation: p.explanation !== p.correctAnswer ? p.explanation : null,
          seconds: m.timeSpent[it.problemId] ?? 0,
          criteria: criteriaFor(it.n),
        };
      }),
  };
}
