import { NextResponse } from "next/server";
import { createSessionToken, setSessionCookie } from "@/lib/auth";
import { getUserById } from "@/lib/queries";
import { consumeWebLink } from "@/lib/mobile/web-link";

export const dynamic = "force-dynamic";

/** Вход на сайт по одноразовой ссылке из приложения (lib/mobile/web-link.ts). */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const base = process.env.NEXT_PUBLIC_APP_URL || url.origin;
  const link = await consumeWebLink(url.searchParams.get("t") ?? "");
  const user = link ? await getUserById(link.userId) : undefined;
  if (!link || !user) return NextResponse.redirect(new URL("/login", base));
  await setSessionCookie(await createSessionToken(user.id, user.role));
  return NextResponse.redirect(new URL(link.next, base));
}
