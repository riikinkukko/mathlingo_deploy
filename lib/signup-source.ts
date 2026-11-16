import { cookies } from "next/headers";
import { eq } from "drizzle-orm";
import { db } from "./db/client";
import * as schema from "./db/schema";

/** Сохранить источник регистрации (cookie pl_src или явное значение, напр. «app»). */
export async function recordSignupSource(userId: string, explicit?: string) {
  try {
    let v = explicit;
    if (!v) {
      const raw = (await cookies()).get("pl_src")?.value;
      v = raw ? decodeURIComponent(raw) : "unknown";
    }
    await db.update(schema.users).set({ signupSource: v.slice(0, 120) }).where(eq(schema.users.id, userId));
  } catch (e) {
    console.error("[signup-source]", e);
  }
}
