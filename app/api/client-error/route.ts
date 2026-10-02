import { NextResponse } from "next/server";
import { reportError } from "@/lib/alerts";

export const dynamic = "force-dynamic";

// Простой лимит в памяти процесса: не больше 10 отчётов в минуту с одного IP,
// чтобы этот адрес нельзя было использовать для спама владельцу.
const hits = new Map<string, number[]>();

/** Ошибки из браузера пользователя (app/error.tsx шлёт сюда). */
export async function POST(req: Request) {
  const ip = req.headers.get("x-real-ip") || (req.headers.get("x-forwarded-for") || "").split(",").pop()?.trim() || "?";
  const now = Date.now();
  const list = (hits.get(ip) ?? []).filter((t) => now - t < 60000);
  if (list.length >= 10) return NextResponse.json({ ok: false }, { status: 429 });
  list.push(now);
  hits.set(ip, list);
  if (hits.size > 5000) hits.clear();

  let body: { message?: unknown; stack?: unknown; path?: unknown; digest?: unknown } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const message = String(body.message ?? "").slice(0, 1000);
  if (!message) return NextResponse.json({ ok: false }, { status: 400 });
  // Ошибку рендеринга на сервере браузер видит без подробностей — о ней уже
  // сообщил сам сервер (instrumentation-node.ts), второе сообщение не нужно.
  if (message.startsWith("An error occurred in the Server Components render")) return NextResponse.json({ ok: true });
  console.warn("[client-error]", message, body.path);
  await reportError({
    source: "client",
    message,
    stack: typeof body.stack === "string" ? body.stack.slice(0, 2000) : undefined,
    path: typeof body.path === "string" ? body.path : undefined,
    extra: [body.digest ? `digest: ${String(body.digest).slice(0, 40)}` : "", (req.headers.get("user-agent") || "").slice(0, 120)].filter(Boolean).join(" · "),
  });
  return NextResponse.json({ ok: true });
}
