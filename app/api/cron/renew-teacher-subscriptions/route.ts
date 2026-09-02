import { NextResponse } from "next/server";
import { getTeachersDueForRenewal, createPendingPayment } from "@/lib/queries";
import { createRecurringYooKassaPayment, isYooKassaConfigured } from "@/lib/yookassa";

export const dynamic = "force-dynamic";

const TEACHER_PRICE_RUB = Number(process.env.YOOKASSA_TEACHER_PRICE_RUB || 1499);
const TEACHER_PERIOD_DAYS = Number(process.env.YOOKASSA_TEACHER_PERIOD_DAYS || 30);

/**
 * Вызывается системным cron на сервере раз в день (см. README — команда
 * для crontab), не пользователем и не автоматически изнутри приложения.
 * Next.js сам по себе не умеет запускать задачи по расписанию — для этого
 * и нужен внешний cron, который просто дёргает этот URL по HTTP.
 *
 * Защищено секретом в query-параметре — без него кто угодно мог бы вызвать
 * этот эндпоинт и инициировать реальные списания с чужих сохранённых карт.
 *
 * Идемпотентность: idempotenceKey строится из userId + сегодняшней даты —
 * если cron почему-то запустится дважды в один день, ЮKassa вернёт УЖЕ
 * созданный платёж вместо повторного списания (тот же принцип, что и для
 * обычных платежей, см. lib/yookassa.ts).
 */
export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const secret = searchParams.get("secret");

  if (!process.env.CRON_SECRET || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isYooKassaConfigured()) {
    return NextResponse.json({ error: "yookassa not configured" }, { status: 500 });
  }

  const teachers = await getTeachersDueForRenewal();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

  const results = await Promise.allSettled(
    teachers.map(async (teacher) => {
      const idempotenceKey = `renewal-${teacher.id}-${today}`;
      const payment = await createRecurringYooKassaPayment({
        amountRub: TEACHER_PRICE_RUB,
        description: `Планиметрика для репетитора — автопродление ${TEACHER_PERIOD_DAYS} дней`,
        paymentMethodId: teacher.yookassaPaymentMethodId!,
        idempotenceKey,
        metadata: { userId: teacher.id, type: "teacher_pro_renewal" },
      });
      await createPendingPayment({
        userId: teacher.id,
        yookassaPaymentId: payment.id,
        amountRub: TEACHER_PRICE_RUB,
        periodDays: TEACHER_PERIOD_DAYS,
        paymentType: "teacher_pro",
        // isRecurringSetup здесь НЕ true — это не первичная настройка
        // автосписания (она уже есть), просто очередной платёж по уже
        // сохранённому способу оплаты.
      });
      // Итоговое продление teacherProUntil произойдёт позже, когда придёт
      // вебхук payment.succeeded — та же логика, что и для обычных
      // платежей (см. markPaymentSucceeded), здесь только инициируем.
      return { teacherId: teacher.id, paymentId: payment.id, status: payment.status };
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    console.error(
      "Ошибки автопродления тарифа репетитора:",
      failed.map((r) => (r as PromiseRejectedResult).reason)
    );
  }

  return NextResponse.json({
    processed: teachers.length,
    succeeded,
    failed: failed.length,
  });
}
