// Серверная часть instrumentation.ts (только среда Node.js, не edge).
import { reportError } from "./lib/alerts";

export function installErrorAlerts() {

  process.on("unhandledRejection", (reason) => {
    const err = reason instanceof Error ? reason : new Error(String(reason));
    void reportError({ source: "server", message: err.message, stack: err.stack });
  });

  // Ошибки рендеринга страниц и серверных экшенов Next.js 14 перехватывает
  // сам и пишет в console.error — подключаемся там же, ничего не меняя в выводе.
  const original = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    original(...args);
    const err = args.find((a): a is Error => a instanceof Error);
    if (!err) return;
    // Ожидаемые «ошибки» навигации Next (redirect/notFound) — не сбои.
    const digest = (err as Error & { digest?: string }).digest ?? "";
    if (digest.startsWith("NEXT_REDIRECT") || digest === "NEXT_NOT_FOUND" || /DYNAMIC_SERVER_USAGE/.test(digest)) return;
    void reportError({ source: "server", message: err.message, stack: err.stack, extra: digest ? `digest: ${digest}` : undefined });
  };
}
