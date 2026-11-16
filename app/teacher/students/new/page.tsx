import { getSessionUser } from "@/lib/auth";
import { getStudentsOfTeacher, isTeacherEffectivelyPro } from "@/lib/queries";
import { teacherPlanState } from "@/lib/teacher-plan";
import StudentLimitCard from "@/components/StudentLimitCard";
import TeacherShell from "@/components/TeacherShell";
import AddStudentForm from "./AddStudentForm";
import VerifyEmailReminder from "@/components/VerifyEmailReminder";
import { EMAIL_FOR_MORE_STUDENTS_TEXT, needsEmailForMoreStudents, UNVERIFIED_STUDENT_LIMIT } from "@/lib/teacher-invites";

export default async function NewStudentPage() {
  const user = (await getSessionUser())!;
  const plan = teacherPlanState(user);
  const count = (await getStudentsOfTeacher(user.id)).length;
  const atLimit = count >= plan.limit;
  const needEmail = needsEmailForMoreStudents(user, count, isTeacherEffectivelyPro(user));
  const unverified = !user.emailVerifiedAt && !user.isPlatformOwner && !isTeacherEffectivelyPro(user) && plan.source !== "trial";
  return (
    <TeacherShell active="students" title="Новый ученик">
      <main className="mx-auto max-w-md px-4 py-6">
        <h1 className="mb-5 font-display text-2xl font-black text-ink">Добавить ученика</h1>
        {needEmail ? (
          // Лимит без подтверждения почты исчерпан — говорим сразу, а не после заполнения формы.
          <div className="-mt-6">
            <VerifyEmailReminder reason={EMAIL_FOR_MORE_STUDENTS_TEXT} />
          </div>
        ) : atLimit ? (
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
            {unverified && (
              <p className="mb-4 rounded-2xl bg-amber-light px-4 py-2.5 text-[13px] font-bold text-amber-dark">
                Пока email не подтверждён, можно добавить {UNVERIFIED_STUDENT_LIMIT} учеников (добавлено {count}).
              </p>
            )}
            <a
              href="/teacher/students/import"
              className="mb-4 flex items-center justify-between rounded-2xl border-2 border-dashed border-line bg-white px-4 py-3 text-[14px] font-extrabold text-pine-dark hover:border-pine"
            >
              Несколько учеников сразу — вставить список из таблицы
              <span aria-hidden>→</span>
            </a>
            <AddStudentForm />
          </>
        )}
      </main>
    </TeacherShell>
  );
}
