"use server";

import { revalidatePath } from "next/cache";
import { issueStudentHandoff } from "@/lib/student-credential-handoff";
import { issueParentAccess } from "@/lib/parent-access";
import { isEmailConfigured, sendEmail } from "@/lib/email";
import { requireAdmin } from "@/lib/auth";
import { setUserPlanManually } from "@/lib/queries";

export async function grantProAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const daysRaw = String(formData.get("days") || "").trim();
  const parsed = parseInt(daysRaw, 10);
  // Пусто — бессрочно. Мусор в поле раньше давал NaN и тоже бессрочный Pro.
  if (daysRaw && !Number.isFinite(parsed)) return;
  const days = daysRaw ? Math.max(1, parsed) : null;
  if (!userId) return;

  await setUserPlanManually(userId, "pro", days);
  revalidatePath("/admin");
  revalidatePath(`/admin/user/${userId}`);
}

export async function revokeProAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  if (!userId) return;

  await setUserPlanManually(userId, "free", null);
  revalidatePath("/admin");
  revalidatePath(`/admin/user/${userId}`);
}

export async function issueStudentHandoffAction(
  _state: { code?: string; error?: string }, formData: FormData,
): Promise<{ code?: string; error?: string }> {
  const owner = await requireAdmin();
  if (!owner.isPlatformOwner || formData.get("identityVerified") !== "on") {
    return { error: "Подтвердите личность ученика и независимый канал передачи." };
  }
  const code = await issueStudentHandoff(owner, String(formData.get("studentId") ?? ""));
  return code ? { code } : { error: "Передача доступа для этого аккаунта недоступна." };
}

export async function sendParentConfirmationAction(form: FormData) {
  const owner = await requireAdmin();
  const studentId = String(form.get("studentId") ?? "");
  if (!owner.isPlatformOwner || !studentId || form.get("parentVerified") !== "on" ||
      form.get("studentConsent") !== "on" || !isEmailConfigured()) return;
  const pending = await issueParentAccess(owner, studentId, String(form.get("parentId") ?? ""));
  if (!pending) return;
  const url = new URL("/parent-confirm", process.env.NEXT_PUBLIC_APP_URL || "https://planimetrika.online");
  url.searchParams.set("token", pending.code);
  await sendEmail({
    to: pending.email,
    subject: "Подтверждение родительского доступа — Планиметрика",
    html: `<p>Чтобы подтвердить доступ, <a href="${url.toString()}">задайте новый пароль</a>. Ссылка действует 30 минут.</p>`,
  });
  revalidatePath(`/admin/user/${studentId}`);
}
