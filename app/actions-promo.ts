"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getSessionUser, requireAdmin } from "@/lib/auth";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { eq } from "drizzle-orm";
import { checkPromo, normalizePromoCode, redeemDaysPromo, PROMO_COOKIE } from "@/lib/promo";

/**
 * Ввод промокода на странице тарифа. Код «+N дней» применяется сразу, код со
 * скидкой запоминается и подставляется в оплату.
 */
export async function applyPromoAction(formData: FormData) {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  const back = user.role === "TEACHER" ? "/teacher/upgrade" : "/student/upgrade";
  const raw = formData.get("promo");
  const check = await checkPromo(raw, user);
  if (!check.ok) redirect(`${back}?promoError=${encodeURIComponent(check.error)}`);
  const promo = (check as Extract<typeof check, { ok: true }>).promo;
  if (promo.kind === "days") {
    const res = await redeemDaysPromo(promo.code, user);
    if (!res.ok) redirect(`${back}?promoError=${encodeURIComponent(res.error)}`);
    revalidatePath(back);
    redirect(`${back}?promoOk=${encodeURIComponent(promo.code)}`);
  }
  cookies().set(PROMO_COOKIE, promo.code, { maxAge: 30 * 86400, httpOnly: true, sameSite: "lax", path: "/" });
  redirect(`${back}?promo=${encodeURIComponent(promo.code)}`);
}

export async function clearPromoAction() {
  const user = await getSessionUser();
  if (!user) redirect("/login");
  cookies().delete(PROMO_COOKIE);
  redirect(user.role === "TEACHER" ? "/teacher/upgrade" : "/student/upgrade");
}

// ---------- Админка ----------

export async function createPromoAction(_prev: unknown, formData: FormData): Promise<{ error?: string; ok?: string }> {
  await requireAdmin();
  const code = normalizePromoCode(formData.get("code"));
  if (!code) return { error: "Код: 3–32 символа — буквы, цифры, «-» или «_»" };
  const kind = formData.get("kind") === "days" ? "days" : "percent";
  const value = parseInt(String(formData.get("value") || ""), 10);
  if (!Number.isFinite(value) || value < 1 || (kind === "percent" ? value > 90 : value > 365)) {
    return { error: kind === "percent" ? "Скидка — от 1 до 90%" : "Дней — от 1 до 365" };
  }
  const audience = formData.get("audience") === "student" ? "student" : "teacher";
  const maxRaw = String(formData.get("maxUses") || "").trim();
  const maxUses = maxRaw ? parseInt(maxRaw, 10) : null;
  if (maxRaw && (!Number.isFinite(maxUses) || maxUses! < 1)) return { error: "Лимит использований — целое число от 1" };
  const expRaw = String(formData.get("expiresAt") || "").trim();
  // Дата из поля — конец этого дня по Москве.
  const expiresAt = expRaw ? new Date(`${expRaw}T23:59:59+03:00`) : null;
  if (expiresAt && Number.isNaN(expiresAt.getTime())) return { error: "Неверная дата окончания" };
  const note = String(formData.get("note") || "").trim().slice(0, 200) || null;

  const [exists] = await db.select({ code: schema.promoCodes.code }).from(schema.promoCodes).where(eq(schema.promoCodes.code, code)).limit(1);
  if (exists) return { error: `Код ${code} уже есть` };
  await db.insert(schema.promoCodes).values({ code, kind, value, audience, maxUses, expiresAt, note });
  revalidatePath("/admin/promo");
  return { ok: code };
}

export async function togglePromoAction(formData: FormData) {
  await requireAdmin();
  const code = normalizePromoCode(formData.get("code"));
  if (!code) return;
  const active = formData.get("active") === "1";
  await db.update(schema.promoCodes).set({ active }).where(eq(schema.promoCodes.code, code));
  revalidatePath("/admin/promo");
}
