import { test, after } from "node:test";
import assert from "node:assert/strict";
import { eq, sql } from "drizzle-orm";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import {
  markPaymentSucceeded,
  markPaymentCanceled,
  isAuthEmailRateLimited,
  createAuthToken,
  consumeAuthToken,
  recordLoginFailure,
  isLoginRateLimited,
  clearLoginFailures,
} from "../../lib/queries";
import { makeUser, cleanup } from "../helpers";

// Уникальный «атакующий» адрес на каждый запуск, чтобы счётчики не копились.
const ATTACKER_IP = `10.${Date.now() % 250}.${Math.floor(Math.random() * 250)}.7`;
after(async () => {
  await db.execute(sql`delete from login_failures where key like '%@lock.test%' or key = ${`ip:${ATTACKER_IP}`}`);
  await cleanup();
});

test("оплата: повторные и одновременные уведомления ЮKassa продлевают Pro один раз", async () => {
  const u = await makeUser();
  const yk = `yk_${u.id}`;
  await db.insert(schema.payments).values({ id: `pay_${u.id}`, userId: u.id, yookassaPaymentId: yk, amountRub: 249, periodDays: 30, status: "pending", paymentType: "student_pro" } as any);
  // Настоящая гонка: держим строку платежа заблокированной в отдельной
  // транзакции, запускаем 5 обработчиков (все успевают прочитать «pending»),
  // потом отпускаем блокировку — продлить должен ровно один.
  const { Pool } = await import("pg");
  const side = new Pool({ connectionString: process.env.DATABASE_URL, max: 1 });
  const c = await side.connect();
  await c.query("begin");
  await c.query("select 1 from payments where yookassa_payment_id = $1 for update", [yk]);
  const runs = Promise.all([1, 2, 3, 4, 5].map(() => markPaymentSucceeded(yk)));
  await new Promise((r) => setTimeout(r, 300));
  await c.query("commit");
  c.release();
  await side.end();
  await runs;
  await markPaymentSucceeded(yk);
  const [row] = await db.select().from(schema.users).where(eq(schema.users.id, u.id));
  const days = (row.proUntil!.getTime() - Date.now()) / 86400000;
  assert.ok(days > 29.9 && days < 30.1, `продлено на ${days} дн.`);
  await markPaymentCanceled(yk);
  const [p] = await db.select().from(schema.payments).where(eq(schema.payments.yookassaPaymentId, yk));
  assert.equal(p.status, "succeeded");
});

test("письма сброса пароля: не больше 3 в час на аккаунт", async () => {
  const u = await makeUser();
  let sent = 0;
  for (let i = 0; i < 6; i++) {
    if (!(await isAuthEmailRateLimited(u.id, "password_reset"))) {
      await createAuthToken(u.id, "password_reset", 3600000);
      sent++;
    }
  }
  assert.equal(sent, 3);
});

test("ссылка из письма срабатывает ровно один раз, даже при одновременных нажатиях", async () => {
  const u = await makeUser();
  const t = await createAuthToken(u.id, "email_verification", 3600000);
  const r = await Promise.all([consumeAuthToken(t, "email_verification"), consumeAuthToken(t, "email_verification")]);
  assert.equal(r.filter(Boolean).length, 1);
  assert.equal(await consumeAuthToken(t, "password_reset"), null);
});

test("вход: атакующий IP блокируется, владелец с другого IP входит", async () => {
  const email = `victim.${Date.now()}@lock.test`;
  for (let i = 0; i < 10; i++) await recordLoginFailure(ATTACKER_IP, email);
  assert.equal(await isLoginRateLimited(ATTACKER_IP, email), true);
  assert.equal(await isLoginRateLimited("1.2.3.4", email), false);
  await clearLoginFailures(email);
  assert.equal(await isLoginRateLimited(ATTACKER_IP, email), false);
});
