import { createSessionToken } from "@/lib/auth";
import type { User } from "@/lib/types";
import { isEffectivelyPro, isStandaloneStudent } from "@/lib/queries";

/** Ответ на вход: токен (тот же JWT, что cookie на сайте) и краткий профиль. */
export async function sessionPayload(user: User) {
  return { token: await createSessionToken(user.id, user.role), user: userSummary(user) };
}

export function userSummary(user: User) {
  const standalone = user.role === "STUDENT" && isStandaloneStudent(user);
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    standalone,
    isPro: user.role === "STUDENT" && (!standalone || isEffectivelyPro(user)),
    hasTeacher: !!user.teacherId,
    emailVerified: !!user.emailVerifiedAt,
    targetScore: user.targetScore ?? null,
    reminders: user.tgStudentReminders !== false,
  };
}
