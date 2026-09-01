import { getSessionUser } from "@/lib/auth";
import { getMistakesForStudent } from "@/lib/queries";
import StudentShell from "@/components/StudentShell";
import Mascot from "@/components/Mascot";
import { IconCheck, IconClose } from "@/components/icons";

export default async function MistakesPage() {
  const user = (await getSessionUser())!;
  const mistakes = await getMistakesForStudent(user.id);
  const unresolved = mistakes.filter((m) => !m.resolved);
  const resolved = mistakes.filter((m) => m.resolved);

  return (
    <StudentShell active="mistakes" title="Мои ошибки">
      <div className="px-4 py-6 lg:px-8">
        <div className="mx-auto max-w-2xl">
          <h1 className="font-display text-2xl font-black text-ink">Мои ошибки</h1>
          <p className="mt-1.5 text-sm text-ink-soft">
            Задачи, где хотя бы раз ответил неверно — удобно вернуться и закрепить.
          </p>

          {mistakes.length === 0 ? (
            <div className="card mt-6 p-8 text-center">
              <Mascot mood="happy" size={72} float={false} className="mx-auto" />
              <p className="mt-3 font-display text-lg font-black text-ink">Ошибок пока нет!</p>
              <p className="mt-1 text-sm text-ink-soft">Или ты идеален, или ещё не начал 🙂</p>
            </div>
          ) : (
            <>
              {unresolved.length > 0 && (
                <div className="mt-6">
                  <h2 className="mb-3 text-xs font-black uppercase tracking-wide text-coral">
                    Всё ещё не решено верно ({unresolved.length})
                  </h2>
                  <div className="space-y-2">
                    {unresolved.map((m) => {
                      const content = (
                        <>
                          <IconClose className="h-4 w-4 shrink-0 text-coral" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] text-ink">{m.problem.text}</p>
                            <p className="text-[11px] text-ink-soft/70">
                              {m.chapterTitle} · {m.skillTitle}
                            </p>
                          </div>
                        </>
                      );
                      return m.problem.skillId ? (
                        <a
                          key={m.problem.id}
                          href={`/student/skill/${m.problem.skillId}`}
                          className="card flex items-center gap-3 border-2 border-coral-light p-3.5 transition hover:border-coral"
                        >
                          {content}
                        </a>
                      ) : (
                        <div key={m.problem.id} className="card flex items-center gap-3 border-2 border-coral-light p-3.5">
                          {content}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {resolved.length > 0 && (
                <div className="mt-8">
                  <h2 className="mb-3 text-xs font-black uppercase tracking-wide text-ink-soft">
                    Ошибся, но потом решил верно ({resolved.length})
                  </h2>
                  <div className="space-y-2">
                    {resolved.map((m) => {
                      const content = (
                        <>
                          <IconCheck className="h-4 w-4 shrink-0 text-pine" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13px] text-ink-soft">{m.problem.text}</p>
                            <p className="text-[11px] text-ink-soft/70">
                              {m.chapterTitle} · {m.skillTitle}
                            </p>
                          </div>
                        </>
                      );
                      return m.problem.skillId ? (
                        <a
                          key={m.problem.id}
                          href={`/student/skill/${m.problem.skillId}`}
                          className="card flex items-center gap-3 p-3.5 opacity-75 transition hover:opacity-100"
                        >
                          {content}
                        </a>
                      ) : (
                        <div key={m.problem.id} className="card flex items-center gap-3 p-3.5 opacity-75">
                          {content}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </StudentShell>
  );
}
