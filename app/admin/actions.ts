"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/auth";
import { setUserPlanManually } from "@/lib/queries";

export async function grantProAction(formData: FormData) {
  await requireAdmin();
  const userId = String(formData.get("userId") || "");
  const daysRaw = String(formData.get("days") || "").trim();
  const days = daysRaw ? Math.max(1, parseInt(daysRaw, 10)) : null; // пусто = бессрочно
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
