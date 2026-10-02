import { getSessionUser } from "@/lib/auth";
import { getQuestionsForStudent } from "@/lib/queries";
import StudentShell from "@/components/StudentShell";
import QuestionCard from "@/components/QuestionCard";
import Mascot from "@/components/Mascot";

export default async function StudentQuestionsPage() {
  const user = (await getSessionUser())!;
  const questions = await getQuestionsForStudent(user.id);

  return (
    <StudentShell active="profile" title="Мои вопросы">
      <main className="mx-auto max-w-2xl px-4 py-5">
        <h1 className="font-display text-2xl font-black text-ink">Вопросы репетитору</h1>
        <p className="mb-5 mt-1 text-sm text-ink-soft">
          Нажми «Не понял — спросить репетитора» под задачей, и вопрос появится здесь вместе с ответом.
        </p>
        {questions.length === 0 ? (
          <div className="flex flex-col items-center rounded-[20px] border border-line-soft bg-white p-6 text-center">
            <Mascot mood="thinking" size={88} float={false} />
            <p className="mt-3 text-sm text-ink-soft">Пока вопросов не было.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {questions.map((q) => (
              <QuestionCard key={q.id} q={q} />
            ))}
          </div>
        )}
      </main>
    </StudentShell>
  );
}
