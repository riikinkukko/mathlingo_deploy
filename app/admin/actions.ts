"use server";

import { revalidatePath } from "next/cache";
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
