import { getSessionUser } from "@/lib/auth";
import TeacherShell from "@/components/TeacherShell";
import AddStudentForm from "./AddStudentForm";

export default async function NewStudentPage() {
  const user = (await getSessionUser())!;
  return (
    <TeacherShell active="students" title="Новый ученик">
      <main className="mx-auto max-w-md px-4 py-6">
        <h1 className="mb-5 font-display text-2xl font-black text-ink">Добавить ученика</h1>
        <AddStudentForm />
      </main>
    </TeacherShell>
  );
}
