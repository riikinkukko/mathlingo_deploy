import { getAchievementStats } from "@/lib/queries";
import { computeAchievementProgress } from "@/lib/achievements";
import { json, requireStudent } from "@/lib/mobile/api";

export const dynamic = "force-dynamic";

/** Достижения ученика: уровни, прогресс до следующего. */
export async function GET(req: Request) {
  const user = await requireStudent(req);
  if (user instanceof Response) return user;
  const progress = computeAchievementProgress(await getAchievementStats(user.id));
  return json({
    items: progress.map((p) => ({
      id: p.def.id,
      title: p.def.title,
      icon: p.def.icon,
      description: p.def.description,
      tiers: p.def.tiers,
      value: p.value,
      tier: p.tierIndex,
      next: p.nextThreshold,
      progressPct: p.progressPct,
    })),
  });
}
