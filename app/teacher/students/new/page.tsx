import { getSessionUser } from "@/lib/auth";
import { isTeacherEffectivelyPro } from "@/lib/queries";
import TeacherShell from "@/components/TeacherShell";
import AddStudentForm from "./AddStudentForm";
import VerifyEmailReminder from "@/components/VerifyEmailReminder";

export default async function NewStudentPage() {
  const user = (await getSessionUser())!;
  return (
    <TeacherShell active="students" title="Новый ученик">
      <main className="mx-auto max-w-md px-4 py-6">
        <h1 className="mb-5 font-display text-2xl font-black text-ink">Добавить ученика</h1>
        {!user.emailVerifiedAt && !user.isPlatformOwner && !isTeacherEffectivelyPro(user) && (
          <div className="mb-5 -mt-6">
            <VerifyEmailReminder reason="Подтвердите email — без этого на бесплатном тарифе нельзя добавлять учеников." />
          </div>
        )}
        <AddStudentForm />
      </main>
    </TeacherShell>
  );
}
