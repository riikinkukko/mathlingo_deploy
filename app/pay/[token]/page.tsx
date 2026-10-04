import type { Metadata } from "next";
import { and, eq, sql } from "drizzle-orm";
import Mascot from "@/components/Mascot";
import PublicFooter from "@/components/PublicFooter";
import PayButton from "@/components/PayButton";
import { getPayRequest } from "@/lib/pay-requests";
import { getStudentExamPass, getStudentProPrice } from "@/lib/tariffs";
import { isYooKassaConfigured } from "@/lib/yookassa";
import { startParentPaymentAction } from "@/app/actions-payments";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";

export const metadata: Metadata = {
  title: "Оплата подготовки к ЕГЭ — Планиметрика",
  robots: { index: false, follow: false },
};
export const dynamic = "force-dynamic";

const rub = (n: number) => `${n.toLocaleString("ru-RU")} ₽`;
const dateLong = (d: Date) =>
  d.toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "long", year: "numeric" }).replace(/\s?г\.$/, "");

const ERRORS: Record<string, string> = {
  payment_failed: "Не удалось создать платёж. Попробуйте ещё раз через пару минут.",
  payment_not_configured: "Оплата временно недоступна. Попробуйте позже.",
  exam_unavailable: "Тариф «До ЕГЭ» сейчас не продаётся — выберите оплату за месяц.",
};

/**
 * Страница для взрослого по ссылке «Попросить родителя»: оплатить ученику
 * Pro без регистрации. Показываем только имя и сколько задач решено — этого
 * достаточно, чтобы понять, за кого платишь, и не раскрывать лишнего.
 */
export default async function PayForStudentPage({
  params,
  searchParams,
}: {
  params: { token: string };
  searchParams: { paid?: string; error?: string };
}) {
  const req = await getPayRequest(params.token);

  if (!req) {
    return (
      <Frame>
        <Mascot mood="worried" size={88} float={false} />
        <h1 className="mt-3 text-[26px] font-black leading-tight text-ink">Ссылка больше не действует</h1>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">
          Ссылки на оплату действуют 14 дней. Попросите прислать новую — она создаётся в приложении на странице тарифа.
        </p>
      </Frame>
    );
  }

  const { student } = req;
  const firstName = student.name.split(/\s+/)[0] || student.name;
  const proActive = !!student.proUntil && new Date(student.proUntil).getTime() > Date.now() && student.plan === "pro";
  const [{ solved }] = await db
    .select({ solved: sql<number>`count(distinct ${schema.attempts.problemId})::int` })
    .from(schema.attempts)
    .where(and(eq(schema.attempts.studentId, student.id), eq(schema.attempts.isCorrect, true)));
  const pass = getStudentExamPass();
  const month = getStudentProPrice();
  const realPayments = isYooKassaConfigured();

  if (searchParams.paid === "1") {
    return (
      <Frame>
        <Mascot mood="celebrating" size={96} float={false} />
        <h1 className="mt-3 text-[26px] font-black leading-tight text-ink">
          {proActive ? "Готово! Pro открыт" : "Спасибо! Оплата обрабатывается"}
        </h1>
        <p className="mt-2 text-[16px] leading-relaxed text-ink-soft">
          {proActive
            ? `Доступ действует до ${dateLong(new Date(student.proUntil!))}. ${firstName} увидит его в приложении сразу — ничего делать не нужно.`
            : "Обычно это занимает несколько секунд. Обновите страницу через минуту — здесь появится подтверждение."}
        </p>
      </Frame>
    );
  }

  return (
    <Frame>
      <Mascot mood="happy" size={88} float={false} />
      <h1 className="mt-3 text-[28px] font-black leading-[1.1] text-ink">
        {firstName} просит оплатить подготовку к ЕГЭ по математике
      </h1>
      <p className="mt-3 text-[16px] leading-relaxed text-ink-soft">
        Планиметрика — приложение с короткими уроками по всем темам профильного ЕГЭ: подсказки, разбор каждой задачи и повторение
        ошибок.{solved > 0 ? ` ${firstName} уже решил(а) ${solved} ${plural(solved, ["задачу", "задачи", "задач"])}.` : ""} Pro снимает
        ограничение на число задач в день и открывает все главы.
      </p>

      {proActive && (
        <p className="mt-4 rounded-2xl bg-pine-light px-4 py-3 text-[14px] font-bold text-pine-darker">
          Pro уже действует до {dateLong(new Date(student.proUntil!))}. Новая оплата продлит его.
        </p>
      )}
      {searchParams.error && (
        <p className="mt-4 rounded-2xl bg-coral-light px-4 py-3 text-[14px] font-bold text-coral" role="alert">
          {ERRORS[searchParams.error] ?? searchParams.error}
        </p>
      )}

      {realPayments ? (
        <div className="mt-6 space-y-3">
          {pass.available && (
            <form action={startParentPaymentAction} className="rounded-[20px] border-2 border-pine bg-white p-4">
              <input type="hidden" name="token" value={params.token} />
              <input type="hidden" name="product" value="exam" />
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-[17px] font-black text-ink">До ЕГЭ</p>
                <p className="text-[22px] font-black text-ink">
                  {pass.regularPriceRub && <s className="mr-2 text-[15px] font-bold text-ink-soft">{rub(pass.regularPriceRub)}</s>}
                  {rub(pass.priceRub)}
                </p>
              </div>
              <p className="mt-1 text-[14px] text-ink-soft">
                Один платёж — Pro до {pass.untilLabel}, включая пересдачи. Около {rub(pass.perMonth)} в месяц.
                {pass.earlyUntilLabel && ` Ранняя цена действует до ${pass.earlyUntilLabel}.`}
              </p>
              <PayButton className="mt-3 h-12 w-full rounded-2xl bg-pine text-[15px] font-black text-white shadow-[0_3px_0_#0E5E3A] hover:bg-pine-dark">
                Оплатить {rub(pass.priceRub)}
              </PayButton>
            </form>
          )}
          <form action={startParentPaymentAction} className="rounded-[20px] border border-line bg-white p-4">
            <input type="hidden" name="token" value={params.token} />
            <input type="hidden" name="product" value="month" />
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[17px] font-black text-ink">Месяц</p>
              <p className="text-[22px] font-black text-ink">{rub(month.priceRub)}</p>
            </div>
            <p className="mt-1 text-[14px] text-ink-soft">Pro на {month.periodDays} дней.</p>
            <PayButton className="mt-3 h-12 w-full rounded-2xl border-2 border-pine text-[15px] font-black text-pine-dark hover:bg-pine-light">
              Оплатить {rub(month.priceRub)}
            </PayButton>
          </form>
        </div>
      ) : (
        <p className="mt-6 text-[14px] font-bold text-ink-soft">Оплата временно недоступна.</p>
      )}

      <p className="mt-5 text-[13px] leading-relaxed text-ink-soft">
        Разовый платёж без автопродления, через ЮKassa. Регистрироваться не нужно: {firstName} получит доступ сразу после
        оплаты. Нажимая «Оплатить», вы принимаете условия{" "}
        <a href="/legal/offer" target="_blank" className="font-bold text-pine hover:underline">
          Публичной оферты
        </a>
        . Ссылка действует до {dateLong(req.expiresAt)}.
      </p>
    </Frame>
  );
}

function plural(n: number, f: [string, string, string]) {
  const a = Math.abs(n) % 100;
  const b = a % 10;
  if (a > 10 && a < 20) return f[2];
  if (b === 1) return f[0];
  if (b >= 2 && b <= 4) return f[1];
  return f[2];
}

function Frame({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-paper pt-[var(--app-sat)]">
      <header className="mx-auto flex w-full max-w-xl items-center gap-2 px-4 py-4">
        <a href="/" className="text-[18px] font-black text-ink">
          Планиметрика
        </a>
      </header>
      <main className="mx-auto w-full max-w-xl flex-1 px-4 pb-10 pt-2">{children}</main>
      <PublicFooter />
    </div>
  );
}
