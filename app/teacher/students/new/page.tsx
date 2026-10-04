import { getSessionUser } from "@/lib/auth";
import { getStudentsOfTeacher, isTeacherEffectivelyPro } from "@/lib/queries";
import { teacherPlanState } from "@/lib/teacher-plan";
import StudentLimitCard from "@/components/StudentLimitCard";
import TeacherShell from "@/components/TeacherShell";
import AddStudentForm from "./AddStudentForm";
import VerifyEmailReminder from "@/components/VerifyEmailReminder";

export default async function NewStudentPage() {
  const user = (await getSessionUser())!;
  const plan = teacherPlanState(user);
  const count = (await getStudentsOfTeacher(user.id)).length;
  const atLimit = count >= plan.limit;
  return (
    <TeacherShell active="students" title="Новый ученик">
      <main className="mx-auto max-w-md px-4 py-6">
        <h1 className="mb-5 font-display text-2xl font-black text-ink">Добавить ученика</h1>
        {!user.emailVerifiedAt && !user.isPlatformOwner && !isTeacherEffectivelyPro(user) && (
          <div className="mb-5 -mt-6">
            <VerifyEmailReminder reason="Подтвердите email — без этого на бесплатном тарифе нельзя добавлять учеников." />
          </div>
        )}
        {atLimit ? (
          <StudentLimitCard plan={plan} count={count} />
        ) : (
          <>
            {plan.source === "trial" && (
              <p className="mb-4 rounded-2xl bg-pine-light px-4 py-2.5 text-[13px] font-bold text-pine-dark">
                Пробный «Профи»: учеников без лимита ещё {plan.trialDaysLeft} дн.
              </p>
            )}
            {plan.source !== "trial" && Number.isFinite(plan.limit) && (
              <p className="mb-4 text-[13px] text-ink-soft">
                Учеников: {count} из {plan.limit}
              </p>
            )}
            <AddStudentForm />
          </>
        )}
      </main>
    </TeacherShell>
  );
}
