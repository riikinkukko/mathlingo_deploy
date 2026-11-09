import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { getUserById } from "@/lib/queries";
import { consumeWebLink } from "@/lib/mobile/web-link";
import { FROM_APP_COOKIE, FROM_APP_MAX_AGE } from "@/lib/app-context";

export const dynamic = "force-dynamic";

/** Вход на сайт по одноразовой ссылке из приложения (lib/mobile/web-link.ts). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const link = await consumeWebLink(url.searchParams.get("t") ?? "");
  const user = link ? await getUserById(link.userId) : undefined;
  if (!link || !user) return NextResponse.redirect(new URL("/login", base));
  await setSessionCookie(await createSessionToken(user.id, user.role));
  const res = NextResponse.redirect(new URL(link.next, base));
  // Пришёл из приложения — прячем оплату (правила Google Play, lib/app-context.ts).
  res.cookies.set(FROM_APP_COOKIE, "1", {
    path: "/",
    maxAge: FROM_APP_MAX_AGE,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return res;
}
