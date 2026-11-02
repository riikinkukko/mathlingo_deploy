/**
 * Общие помощники API мобильного приложения (/api/m/*): авторизация по
 * Bearer-токену, чтение JSON с лимитом размера, сериализация задач и
 * навыков в формат приложения.
 */
import { NextResponse } from "next/server";
import { getBearerUser } from "@/lib/api-auth";
import type { Problem, TheoryCard, User } from "@/lib/types";
import type { ProblemState } from "@/lib/queries";
import { answerFingerprint } from "@/lib/answer-key";
import { diagramSvg } from "./diagram-svg";

export function json(data: unknown, status = 200) {
  return NextResponse.json(data, { status, headers: { "Cache-Control": "no-store" } });
}

export function fail(error: string, status = 400) {
  return json({ error }, status);
}

/** Пользователь по Bearer-токену или ответ 401. */
export async function requireUser(req: Request): Promise<User | NextResponse> {
  const user = await getBearerUser(req);
  if (!user) return fail("Войди заново", 401);
  return user;
}

export async function requireStudent(req: Request): Promise<User | NextResponse> {
  const user = await getBearerUser(req);
  if (!user) return fail("Войди заново", 401);
  if (user.role !== "STUDENT") return fail("Раздел только для учеников", 403);
  return user;
}

export async function readJson<T = Record<string, unknown>>(req: Request, maxBytes = 64_000): Promise<T | null> {
  try {
    const raw = await req.text();
    if (raw.length > maxBytes) return null;
    const v = raw ? JSON.parse(raw) : {};
    return v && typeof v === "object" ? (v as T) : null;
  } catch {
    return null;
  }
}

export interface MobileProblem {
  id: string;
  text: string;
  answerType: Problem["answerType"];
  choices: { id: string; text: string }[] | null;
  diagramSvg: string | null;
  keyFormula: string | null;
  egeTaskNumber: number | null;
  /** Подсказки по нарастающей (без ответа) — для урока без сети. */
  hints: string[];
  /** Отпечаток ответа для проверки без сети (lib/answer-key.ts); null у развёрнутых. */
  check: string | null;
}

/**
 * Задача для приложения. Ответа и разбора здесь нет: разбор приходит с
 * сервера после верного ответа. hints/check — только там, где их видит
 * обычный урок (в контрольной и пробнике их не отдаём: offline=false).
 */
export function mobileProblem(p: Problem, opts: { offline?: boolean } = {}): MobileProblem {
  const offline = opts.offline ?? true;
  return {
    id: p.id,
    text: p.text,
    answerType: p.answerType,
    choices: p.choices ?? null,
    diagramSvg: diagramSvg(p.diagram),
    keyFormula: p.keyFormula ?? null,
    egeTaskNumber: p.egeTaskNumber ?? null,
    hints: offline ? p.hints : [],
    check: offline && p.answerType !== "DETAILED" ? answerFingerprint(p.id, p.correctAnswer) : null,
  };
}

export function mobileTheory(cards: TheoryCard[]) {
  return cards.map((c) => ({
    title: c.title,
    formula: c.formula ?? null,
    body: c.body,
    diagramSvg: diagramSvg(c.diagram),
  }));
}

/** Состояние задачи для приложения — без ссылок на веб-картинки. */
export function mobileState(s: ProblemState | undefined) {
  if (!s) return { status: "unsolved" as const };
  return {
    status: s.status,
    solvedInfo: s.solvedInfo ?? null,
    feedback: s.feedback ?? null,
    previousAnswer: s.previousAnswer ?? null,
    review: s.review
      ? {
          attemptId: s.review.attemptId,
          hasImage: !!s.review.image,
          marked: s.review.image === "markup",
          feedback: s.review.feedback ?? null,
          score: s.review.score ?? null,
          maxScore: s.review.maxScore ?? null,
        }
      : null,
  };
}
