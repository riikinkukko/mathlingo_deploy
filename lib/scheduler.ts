/**
 * Фоновые задачи воркера (scripts/telegram-poller.ts, раз в 5 минут).
 * Каждая задача выполняется отдельно: раньше все сидели в одном try, и ошибка
 * одной (например, вопросов «было ли занятие») отменяла на этом круге все
 * остальные — сводки, недельные отчёты, напоминания.
 */
export interface Job {
  name: string;
  run: () => Promise<number>;
}

export async function runJobs(
  jobs: Job[],
  onError: (name: string, e: unknown) => void,
  log: (msg: string) => void = (m) => console.log(m)
): Promise<{ name: string; sent: number; error?: true }[]> {
  const results: { name: string; sent: number; error?: true }[] = [];
  for (const job of jobs) {
    try {
      const sent = await job.run();
      if (sent > 0) log(`[jobs] ${job.name}: ${sent}`);
      results.push({ name: job.name, sent });
    } catch (e) {
      onError(job.name, e);
      results.push({ name: job.name, sent: 0, error: true });
    }
  }
  return results;
}
