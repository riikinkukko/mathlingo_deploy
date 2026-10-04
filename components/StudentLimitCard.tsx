import { TEACHER_TIERS, TEACHER_FREE_LIMIT, type TeacherPlanState } from "@/lib/teacher-plan";

/** Лимит учеников достигнут: что делать дальше (вместо формы добавления). */
export default function StudentLimitCard({ plan, count }: { plan: TeacherPlanState; count: number }) {
  const onStandard = plan.tier === "standard";
  const next = onStandard ? TEACHER_TIERS.pro : TEACHER_TIERS.standard;
  return (
    <div className="rounded-[24px] border-2 border-pine/40 bg-white p-5">
      <p className="text-[12px] font-black uppercase tracking-wide text-pine-dark">Лимит учеников</p>
      <p className="mt-1 font-display text-[20px] font-black text-ink">
        {onStandard
          ? `На тарифе «Репетитор» — до ${plan.limit} учеников`
          : `Бесплатно — до ${TEACHER_FREE_LIMIT} учеников`}
      </p>
      <p className="mt-1 text-[14px] text-ink-soft">
        У вас уже {count}. Все остаются с вами — чтобы добавить ещё, выберите тариф побольше.
      </p>
      <div className="mt-4 rounded-2xl bg-pine-light/50 p-4">
        <p className="font-display text-[17px] font-black text-ink">
          «{next.name}» — {next.month.toLocaleString("ru-RU")} ₽ в месяц
        </p>
        <p className="text-[13px] text-ink-soft">
          {next.blurb}
          {onStandard ? "" : " · все функции"} · за год — два месяца в подарок
        </p>
      </div>
      <a href="/teacher/upgrade" className="btn-primary mt-4 w-full !normal-case !tracking-normal">
        Выбрать тариф
      </a>
    </div>
  );
}
