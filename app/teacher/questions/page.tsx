import { getSessionUser } from "@/lib/auth";
import { getQuestionsForTeacher } from "@/lib/queries";
import TeacherShell from "@/components/TeacherShell";
import QuestionCard from "@/components/QuestionCard";
import AnswerQuestionForm from "@/components/AnswerQuestionForm";

export default async function TeacherQuestionsPage() {
  const user = (await getSessionUser())!;
  const questions = await getQuestionsForTeacher(user.id);
  const open = questions.filter((q) => !q.answeredAt);
  const answered = questions.filter((q) => q.answeredAt).slice(0, 20);

  return (
    <TeacherShell active="students" title="Вопросы учеников">
      <main className="mx-auto max-w-3xl px-4 py-5">
        <h1 className="font-display text-2xl font-black text-ink">Вопросы учеников</h1>
        <p className="mb-5 mt-1 text-sm text-ink-soft">
          Ученики нажимают «Не понял» в задаче — вопрос приходит сюда с условием и их ответом.
        </p>

        {open.length === 0 ? (
          <div className="mb-6 rounded-[20px] border border-line-soft bg-white p-6 text-center text-sm text-ink-soft">
            Новых вопросов нет.
          </div>
        ) : (
          <div className="mb-8 space-y-3">
            {open.map((q) => (
              <QuestionCard key={q.id} q={q} showStudent>
                <AnswerQuestionForm questionId={q.id} />
              </QuestionCard>
            ))}
          </div>
        )}

        {answered.length > 0 && (
          <>
            <h2 className="mb-3 font-display text-lg font-black text-ink">Отвеченные</h2>
            <div className="space-y-3">
              {answered.map((q) => (
                <QuestionCard key={q.id} q={q} showStudent />
              ))}
            </div>
          </>
        )}
      </main>
    </TeacherShell>
  );
}
