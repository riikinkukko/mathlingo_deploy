/**
 * Long-polling воркер Telegram-бота — ОСНОВНОЙ способ получения сообщений.
 *
 * Зачем: вебхук требует, чтобы серверы Telegram сами подключались к нашему
 * VPS, и эти входящие соединения периодически таймаутили ("Connection timed
 * out" в getWebhookInfo) — привязка срабатывала только через сутки ретраев.
 * Здесь наоборот: сервер сам спрашивает у Telegram новые сообщения
 * исходящими запросами (getUpdates), которые с VPS работают стабильно.
 *
 * Заодно раз в 5 минут рассылает напоминания о занятиях (lib/lesson-reminders.ts),
 * а репетиторам — вопросы «было ли занятие» и утреннюю сводку (lib/teacher-telegram.ts).
 *
 * Запуск отдельным процессом PM2 рядом с сайтом (деплой через GitHub Actions
 * делает это сам — см. .github/workflows/deploy.yml):
 *   pm2 start npm --name planimetrika-tg -- run telegram:poll
 *   pm2 save
 *
 * При старте снимает вебхук (deleteWebhook) — Telegram не отдаёт апдейты
 * через getUpdates, пока вебхук зарегистрирован. Накопившиеся апдейты при
 * этом НЕ удаляются — воркер их обработает.
 */
import { config } from "dotenv";
import path from "path";
config({ path: path.resolve(__dirname, "../.env.local") });

// TELEGRAM_API_BASE — только для локального теста с фейковым сервером Telegram.
const API_BASE = process.env.TELEGRAM_API_BASE?.trim() || "https://api.telegram.org";
const POLL_TIMEOUT_SEC = 25;
// Как часто проверять, кому пора напомнить о занятии.
const REMINDER_INTERVAL_MS = 5 * 60 * 1000;

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms));
}

async function callApi(token: string, method: string, body: object, timeoutMs: number): Promise<any> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

async function main() {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    console.error("[telegram-poller] TELEGRAM_BOT_TOKEN не задан в .env.local — выход.");
    process.exit(1);
  }

  // Импорт после dotenv: модуль тянет lib/queries -> БД.
  const { handleTelegramUpdate } = await import("../lib/telegram-updates");
  const { sendDueLessonReminders } = await import("../lib/lesson-reminders");
  const { sendLessonStatusPrompts, sendTeacherDigests } = await import("../lib/teacher-telegram");
  const { sendParentWeeklyReports } = await import("../lib/parent-weekly");
  const { sendStudentEveningReminders } = await import("../lib/student-reminders");
  const { reportError } = await import("../lib/alerts");
  const alert = (where: string, e: unknown) => {
    const err = e instanceof Error ? e : new Error(String(e));
    void reportError({ source: "bot", message: `${where}: ${err.message}`, stack: err.stack });
  };

  // Напоминания о занятиях — отдельным циклом, параллельно опросу Telegram.
  // Повторная отправка исключена на уровне БД (атомарная пометка reminded_at),
  // так что лишний экземпляр воркера не приведёт к двойным сообщениям.
  (async function reminderLoop() {
    for (;;) {
      try {
        const n = await sendDueLessonReminders();
        if (n > 0) console.log(`[telegram-poller] Напоминания о занятиях отправлены: ${n}`);
      } catch (e) {
        console.error("[telegram-poller] Ошибка напоминаний о занятиях:", e);
        alert("Напоминания о занятиях", e);
      }
      // Репетитору: «занятие прошло — было или не было?» и утренняя сводка.
      try {
        const p = await sendLessonStatusPrompts();
        if (p > 0) console.log(`[telegram-poller] Вопросов «было ли занятие» отправлено: ${p}`);
        const d = await sendTeacherDigests();
        if (d > 0) console.log(`[telegram-poller] Утренних сводок отправлено: ${d}`);
        const w = await sendParentWeeklyReports();
        if (w > 0) console.log(`[telegram-poller] Недельных отчётов родителям: ${w}`);
        const e = await sendStudentEveningReminders();
        if (e > 0) console.log(`[telegram-poller] Вечерних напоминаний ученикам: ${e}`);
      } catch (e) {
        console.error("[telegram-poller] Ошибка уведомлений репетитору:", e);
        alert("Сводки и напоминания", e);
      }
      await sleep(REMINDER_INTERVAL_MS);
    }
  })();

  const del = await callApi(token, "deleteWebhook", { drop_pending_updates: false }, 15000).catch((e) => ({
    ok: false,
    description: String(e),
  }));
  console.log("[telegram-poller] deleteWebhook:", del.ok ? "ok" : del.description);
  console.log("[telegram-poller] Запущен, жду сообщения...");

  let offset = 0;
  for (;;) {
    try {
      const data = await callApi(
        token,
        "getUpdates",
        { offset, timeout: POLL_TIMEOUT_SEC, allowed_updates: ["message", "callback_query"] },
        (POLL_TIMEOUT_SEC + 10) * 1000
      );
      if (!data.ok) {
        // 409 — вебхук снова кто-то зарегистрировал; снимаем ещё раз.
        console.error("[telegram-poller] getUpdates вернул ошибку:", data.error_code, data.description);
        if (data.error_code === 409) {
          await callApi(token, "deleteWebhook", { drop_pending_updates: false }, 15000).catch(() => {});
        }
        await sleep(5000);
        continue;
      }
      for (const update of data.result) {
        // offset сдвигаем ДО обработки: упавший апдейт не должен зациклить воркер.
        offset = update.update_id + 1;
        try {
          await handleTelegramUpdate(update);
        } catch (e) {
          console.error("[telegram-poller] Ошибка обработки апдейта", update.update_id, e);
          alert("Обработка сообщения боту", e);
        }
      }
    } catch (e) {
      console.error("[telegram-poller] Сетевая ошибка/таймаут getUpdates, повтор через 5с:", String(e));
      await sleep(5000);
    }
  }
}

main();
