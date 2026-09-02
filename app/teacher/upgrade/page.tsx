import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getStudentsOfTeacher, isTeacherEffectivelyPro } from "@/lib/queries";
import { isYooKassaConfigured } from "@/lib/yookassa";
import TeacherShell from "@/components/TeacherShell";
import Mascot from "@/components/Mascot";
import TeacherUpgradeForm from "./TeacherUpgradeForm";
import { IconCheck, IconCrown } from "@/components/icons";

const FREE_STUDENT_LIMIT = 3;

export default async function TeacherUpgradePage({
  searchParams,
}: {
  searchParams: { paid?: string; error?: string };
}) {
  const user = (await getSessionUser())!;
  if (user.role !== "TEACHER") redirect("/login");

  const students = await getStudentsOfTeacher(user.id);
  const isPro = isTeacherEffectivelyPro(user);
  const isOwner = !!user.isPlatformOwner;
  const realPayments = isYooKassaConfigured();
  const priceRub = Number(process.env.YOOKASSA_TEACHER_PRICE_RUB || 1499);
  const periodDays = Number(process.env.YOOKASSA_TEACHER_PERIOD_DAYS || 30);

  return (
    <TeacherShell active="upgrade" title="Тариф">
      <div className="px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <div className="mb-6 text-center">
            <Mascot mood={isPro || isOwner ? "celebrating" : "idle"} size={90} />
            <h1 className="mt-2 font-display text-2xl font-black text-ink">Тариф репетитора</h1>
          </div>

          {searchParams.paid === "1" && !isPro && (
            <div className="mb-6 rounded-2xl border-2 border-amber/30 bg-amber-light p-3.5 text-center text-sm font-bold text-amber">
              Оплата обрабатывается — обычно это занимает несколько секунд.
              Обновите страницу через минуту, если тариф ещё не активировался.
            </div>
          )}
          {searchParams.error === "payment_failed" && (
            <div className="mb-6 rounded-2xl border-2 border-coral/30 bg-coral-light p-3.5 text-center text-sm font-bold text-coral">
              Не удалось создать платёж. Попробуйте ещё раз через пару минут —
              если не поможет, напишите в поддержку.
            </div>
          )}

          {isOwner ? (
            <div className="card p-5 text-center">
              <p className="font-display text-lg font-black text-pine-dark">
                Вы — владелец платформы
              </p>
              <p className="mt-1 text-sm text-ink-soft">
                Лимит на учеников и оплата тарифа к вам не применяются вообще.
              </p>
            </div>
          ) : (
            <>
              <div className="card mb-6 p-5 text-center">
                <p className="text-sm font-bold text-ink-soft">Учеников сейчас</p>
                <p className="mt-1 font-display text-3xl font-black text-teal">
                  {students.length}
                  {!isPro && <span className="text-lg text-ink-soft"> / {FREE_STUDENT_LIMIT}</span>}
                </p>
                {isPro && <p className="mt-1 text-xs text-pine-dark">Без ограничений — тариф активен</p>}
              </div>

              <div className="grid gap-4 sm:grid-cols-2">
                <div className={`card p-5 ${!isPro ? "border-2 !border-pine" : ""}`}>
                  <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">Free</p>
                  <p className="mb-3 font-display text-xl font-black text-ink">0 ₽</p>
                  <ul className="space-y-2 text-sm text-ink-soft">
                    <li className="flex items-start gap-2">
                      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
                      До {FREE_STUDENT_LIMIT} учеников
                    </li>
                    <li className="flex items-start gap-2">
                      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-ink-soft" />
                      Весь функционал платформы без ограничений
                    </li>
                  </ul>
                </div>

                <div className={`card p-5 ${isPro ? "border-2 !border-amber" : ""} bg-gradient-to-br from-amber-light to-white`}>
                  <p className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-amber">
                    <IconCrown className="h-4 w-4" />
                    Pro
                  </p>
                  <p className="mb-3 font-display text-xl font-black text-ink">
                    {priceRub} ₽ / {periodDays} дн.
                    {!realPayments && (
                      <span className="ml-1 text-xs font-semibold text-ink-soft">(демо-режим оплаты)</span>
                    )}
                  </p>
                  <ul className="space-y-2 text-sm text-ink-soft">
                    <li className="flex items-start gap-2">
                      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                      Неограниченное число учеников
                    </li>
                    <li className="flex items-start gap-2">
                      <IconCheck className="mt-0.5 h-4 w-4 shrink-0 text-amber" />
                      Автопродление каждые {periodDays} дней — платить вручную не нужно
                    </li>
                  </ul>
                  {!isPro && realPayments && <TeacherUpgradeForm priceRub={priceRub} periodDays={periodDays} />}
                </div>
              </div>

              <p className="mt-6 text-center text-xs text-ink-soft">
                Оплата через ЮKassa — автоматическое продление каждые {periodDays} дней
                до отмены. Отменить можно в любой момент, обратившись в поддержку.
              </p>
            </>
          )}
        </div>
      </div>
    </TeacherShell>
  );
}
