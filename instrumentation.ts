// Запускается один раз при старте сервера Next.js. Перехватывает ошибки
// сервера и пересылает их владельцу в Telegram (lib/alerts.ts) — раньше они
// оставались только в логах pm2, и о сбое можно было узнать от учеников.
// Код для Node.js — в отдельном файле: instrumentation собирается и для edge,
// где модулей Node (pg, fs) нет; условие ниже Next вырезает на этапе сборки.
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { installErrorAlerts } = await import("./instrumentation-node");
    installErrorAlerts();
  }
}
