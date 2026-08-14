import { NextResponse } from "next/server";
import { getBearerUser } from "@/lib/api-auth";
import {
  getCurriculum,
  computeStudentProgress,
  computeXp,
  computeStreak,
  getPathStates,
  isStandaloneStudent,
  getEffectiveEnergy,
  FREE_MAX_ENERGY,
} from "@/lib/queries";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const user = await getBearerUser(req);
  if (!user || user.role !== "STUDENT") {
    return NextResponse.json({ error: "Требуется авторизация ученика (Bearer-токен)" }, { status: 401 });
  }

  const curriculum = await getCurriculum();
  const progress = await computeStudentProgress(user.id);
  const xp = await computeXp(user.id);
  const streak = await computeStreak(user.id);
  const allSkills = curriculum.flatMap((t) => t.chapters.flatMap((c) => c.skills));
  const pathStates = getPathStates(allSkills, progress);

  const standalone = isStandaloneStudent(user);
  const energy = standalone ? Math.floor(getEffectiveEnergy(user)) : null;

  return NextResponse.json({
    user: { id: user.id, name: user.name, email: user.email, plan: user.plan ?? null },
    curriculum,
    progress,
    pathStates,
    xp,
    streak,
    standalone,
    plan: user.plan ?? null,
    energy,
    energyMax: standalone ? FREE_MAX_ENERGY : null,
  });
}
