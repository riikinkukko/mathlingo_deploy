import { NextResponse } from "next/server";
import { timingSafeEqual } from "crypto";
import { getTeachersDueForRenewal, markPaymentCanceled, markPaymentSucceeded } from "@/lib/queries";
import { onRenewalFailed, recordRenewalPayment, renewalMetadata } from "@/lib/renewal";
import { createRecurringYooKassaPayment, isYooKassaConfigured } from "@/lib/yookassa";

export const dynamic = "force-dynamic";

import { TEACHER_TIERS, periodDays, tierPrice } from "@/lib/teacher-plan";

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
  // Секрет — в заголовке Authorization: Bearer … (не попадает в логи nginx);
  // ?secret= оставлен для совместимости со старой строкой crontab.
  const auth = req.headers.get("authorization") ?? "";
  const secret = auth.startsWith("Bearer ") ? auth.slice(7) : searchParams.get("secret");

  if (!secretMatches(secret, process.env.CRON_SECRET)) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  if (!isYooKassaConfigured()) {
    return NextResponse.json({ error: "yookassa not configured" }, { status: 500 });
  }

  const teachers = await getTeachersDueForRenewal();
  // Ключ идемпотентности — по московскому дню: повторный запуск cron в тот же
  // день вернёт уже созданный платёж, а не спишет второй раз.
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());

  const results = await Promise.allSettled(
    teachers.map(async (teacher) => {
      const idempotenceKey = `renewal-${teacher.id}-${today}`;
      // Продлеваем тот тариф и период, что оплачен. Оплатившие до ступеней
      // (tier не указан) продлеваются как «Профи» на месяц — дешевле, чем было.
      const tier = teacher.teacherTier ?? "pro";
      const period = teacher.teacherBillingPeriod ?? "month";
      const amountRub = tierPrice(tier, period);
      const days = periodDays(period);
      const info = { userId: teacher.id, periodDays: days, tier, billingPeriod: period } as const;
      const payment = await createRecurringYooKassaPayment({
        amountRub,
        description: `Планиметрика для репетитора — автопродление тарифа «${TEACHER_TIERS[tier].name}», ${period === "year" ? "год" : "месяц"}`,
        paymentMethodId: teacher.yookassaPaymentMethodId!,
        idempotenceKey,
        // По этим данным вебхук восстановит запись, если придёт раньше нас.
        metadata: renewalMetadata(info),
      });
      // Запись платежа: повтор (вебхук успел первым, или cron запущен дважды) — без ошибки.
      await recordRenewalPayment({ ...info, yookassaPaymentId: payment.id, amountRub });
      // Автоплатёж часто завершается сразу. Тогда засчитываем здесь же, не
      // дожидаясь вебхука (оба пути идемпотентны — продление будет одно).
      if (payment.status === "succeeded") {
        await markPaymentSucceeded(payment.id);
      } else if (payment.status === "canceled") {
        const canceled = await markPaymentCanceled(payment.id);
        if (canceled) await onRenewalFailed(teacher.id);
      }
      return { teacherId: teacher.id, paymentId: payment.id, status: payment.status };
    })
  );

  const succeeded = results.filter((r) => r.status === "fulfilled").length;
  const failed = results.filter((r) => r.status === "rejected");
  if (failed.length > 0) {
    // Error как первый аргумент — чтобы alerts.ts переслал владельцу в Telegram.
    console.error(
      new Error(`Ошибки автопродления тарифа репетитора: ${failed.length}`),
      failed.map((r) => String((r as PromiseRejectedResult).reason))
    );
  }

  return NextResponse.json({
    processed: teachers.length,
    succeeded,
    failed: failed.length,
  });
}

/** Сравнение секрета за постоянное время (не выдаёт длину совпавшего префикса). */
function secretMatches(given: string | null, expected: string | undefined): boolean {
  if (!expected || !given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}
