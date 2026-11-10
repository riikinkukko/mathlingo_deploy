import AsyncStorage from "@react-native-async-storage/async-storage";
import { api, ApiError } from "./api";
import { answerFingerprint } from "./answer-key";
import { queryClient } from "./query";
import type { AttemptResult, HomePayload, MobileProblem } from "./types";

/**
 * Ответы без сети. Если связи нет, ответ проверяется по отпечатку
 * (lib/answer-key.ts), а попытка ждёт в очереди и уходит на сервер, когда
 * связь появится. Сервер проверяет её заново — прогресс и серия честные.
 */
type Source = "lesson" | "assignment" | "review";
interface Queued {
  problemId: string;
  answer: string;
  source: Source;
  at: number;
}

const KEY = "planimetrika_attempt_queue_v1";
const wrongCounts = new Map<string, number>();
let flushing = false;

async function readQueue(): Promise<Queued[]> {
  try {
    return JSON.parse((await AsyncStorage.getItem(KEY)) ?? "[]") as Queued[];
  } catch {
    return [];
  }
}

async function writeQueue(q: Queued[]) {
  await AsyncStorage.setItem(KEY, JSON.stringify(q.slice(-500)));
}

export async function queuedCount(): Promise<number> {
  return (await readQueue()).length;
}

export type SubmitResult = AttemptResult & { offline?: boolean };

export async function submitAnswer(
  problem: MobileProblem,
  answer: string,
  source: Source,
  image?: string | null
): Promise<SubmitResult> {
  try {
    const res = await api<AttemptResult>("/api/m/attempts", { body: { problemId: problem.id, answer, source, image } });
    return res;
  } catch (e) {
    if (!(e instanceof ApiError && e.offline) || !problem.check || image) throw e;
    const q = await readQueue();
    // Энергия (бесплатный тариф без репетитора) без сети тратится так же, как с
    // сетью: первая попытка по задаче — минус одна. Кончилась — честно говорим
    // об этом, а не принимаем ответ, который сервер потом отклонит.
    const firstTry = !q.some((x) => x.problemId === problem.id);
    if (firstTry) {
      const energy = cachedEnergy();
      if (energy !== null && energy <= 0) return { kind: "no_energy" };
      if (energy !== null) spendCachedEnergy();
    }
    q.push({ problemId: problem.id, answer, source, at: Date.now() });
    await writeQueue(q);
    if (answerFingerprint(problem.id, answer) === problem.check) {
      return { kind: "correct", explanation: "", correctAnswer: answer, offline: true };
    }
    const wrong = (wrongCounts.get(problem.id) ?? 0) + 1;
    wrongCounts.set(problem.id, wrong);
    const hint = problem.hints[Math.min(wrong - 1, problem.hints.length - 1)] ?? "Перечитай теорию к уроку и попробуй ещё раз.";
    return { kind: "wrong", hint, wrongCount: wrong, canRevealSolution: false, offline: true };
  }
}

/** Энергия из сохранённой главной; null — без ограничения (Pro, есть репетитор). */
function cachedEnergy(): number | null {
  for (const [, d] of queryClient.getQueriesData<HomePayload>({ queryKey: ["home"] })) {
    if (d?.stats) return d.stats.energy;
  }
  return null;
}

function spendCachedEnergy() {
  queryClient.setQueriesData<HomePayload>({ queryKey: ["home"] }, (d) =>
    d?.stats && d.stats.energy !== null ? { ...d, stats: { ...d.stats, energy: Math.max(0, d.stats.energy - 1) } } : d
  );
}

/** Отправить накопленные ответы. Вызывается при запуске и при появлении сети. */
export async function flushQueue(): Promise<number> {
  if (flushing) return 0;
  flushing = true;
  let sent = 0;
  try {
    let q = await readQueue();
    while (q.length) {
      const item = q[0];
      try {
        const r = await api<AttemptResult>("/api/m/attempts", {
          body: { problemId: item.problemId, answer: item.answer, source: item.source },
        });
        // Сервер не принял из-за энергии — ответ не выбрасываем: оставляем в
        // очереди и пробуем позже, когда энергия восстановится.
        if (r.kind === "no_energy") break;
      } catch (e) {
        if (e instanceof ApiError && e.offline) break;
        // Ошибка проверки (например, задача стала недоступна) — попытку выбрасываем.
      }
      q = q.slice(1);
      await writeQueue(q);
      sent++;
    }
    if (sent) await queryClient.invalidateQueries();
  } finally {
    flushing = false;
  }
  return sent;
}
