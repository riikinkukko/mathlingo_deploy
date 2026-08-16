/**
 * Симулирует полный цикл оплаты (pending-платёж → вебхук об успехе → продление
 * подписки) БЕЗ реальных запросов к ЮKassa — проверяет только логику на нашей
 * стороне (создание записи, идемпотентность, корректное продление от даты
 * истечения, а не от "сейчас"). Полезно прогнать после получения реальных
 * ключей ЮKassa как sanity-check перед первым реальным платежом.
 *
 * Запуск: npx tsx --env-file=.env.local scripts/dev/test-payment-flow.ts
 */
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { eq } from "drizzle-orm";
import { createPendingPayment, markPaymentSucceeded, getUserById, genId } from "../../lib/queries";

async function main() {
  const email = "free@demo.ru";
  const userRows = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  const userId = userRows[0].id;

  // Сброс на чистое состояние перед тестом
  await db.update(schema.users).set({ plan: "free", proUntil: null }).where(eq(schema.users.id, userId));

  const fakeYookassaId = genId("test_yk");
  console.log("1. Создаю pending-платёж...");
  await createPendingPayment({ userId, yookassaPaymentId: fakeYookassaId, amountRub: 399, periodDays: 30 });

  const before = await getUserById(userId);
  console.log("   До вебхука: plan=", before?.plan, "proUntil=", before?.proUntil);

  console.log("2. Симулирую вебхук payment.succeeded...");
  const ok = await markPaymentSucceeded(fakeYookassaId);
  console.log("   markPaymentSucceeded вернула:", ok);

  const after = await getUserById(userId);
  console.log("   После вебхука: plan=", after?.plan, "proUntil=", after?.proUntil);

  console.log("3. Повторно шлю ТОТ ЖЕ вебхук (проверка идемпотентности)...");
  const ok2 = await markPaymentSucceeded(fakeYookassaId);
  const after2 = await getUserById(userId);
  console.log("   proUntil не должен был измениться:", after2?.proUntil === after?.proUntil);

  console.log("4. Симулирую ВТОРОЙ платёж (проверка продления, не перезаписи)...");
  const fakeYookassaId2 = genId("test_yk");
  await createPendingPayment({ userId, yookassaPaymentId: fakeYookassaId2, amountRub: 399, periodDays: 30 });
  await markPaymentSucceeded(fakeYookassaId2);
  const after3 = await getUserById(userId);
  const daysDiff =
    after3?.proUntil && after?.proUntil
      ? Math.round((new Date(after3.proUntil).getTime() - new Date(after.proUntil).getTime()) / 86400000)
      : null;
  console.log("   proUntil после второго платежа:", after3?.proUntil);
  console.log("   Разница в днях (ожидаем ровно 30 — продление, а не перезапись):", daysDiff);

  process.exit(0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
