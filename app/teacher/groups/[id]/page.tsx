import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getHomeworkById, getStudentsOfTeacher, homeworkStatus } from "@/lib/queries";
import { getGroupForTeacher, getGroupHomeworkBatches, getGroupLessons } from "@/lib/groups";
import { pluralRu } from "@/lib/pluralize";
import TeacherShell from "@/components/TeacherShell";
import CollapsibleSection from "@/components/CollapsibleSection";
import GroupMemberPicker from "@/components/GroupMemberPicker";
import AddLessonForm from "@/components/AddLessonForm";
import UpcomingLessons from "@/components/UpcomingLessons";
import DeleteGroupButton from "@/components/DeleteGroupButton";
import { updateGroupAction } from "@/app/actions-groups";

const KIND: Record<string, string> = { homework: "ДЗ", test: "Контрольная", exam: "Пробник" };

function shortDate(iso: string) {
  return new Date(iso).toLocaleDateString("ru-RU", { timeZone: "Europe/Moscow", day: "numeric", month: "short" });
}

export default async function GroupPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { created?: string; saved?: string; hw?: string; hwskip?: string; error?: string; ok?: string; add?: string };
}) {
  const user = (await getSessionUser())!;
  const group = await getGroupForTeacher(params.id, user.id);
  if (!group) notFound();

  const [students, lessons, batches] = await Promise.all([
    getStudentsOfTeacher(user.id),
    getGroupLessons(group.id, user.id),
    getGroupHomeworkBatches(group.id, user.id, 10),
  ]);
  // Прогресс каждого ученика по каждому групповому заданию.
  const progress = await Promise.all(
    batches.map(async (b) =>
      Promise.all(
        b.rows.map(async (r) => {
          const hw = await getHomeworkById(r.homeworkId);
          const st = hw ? await homeworkStatus(hw, r.studentId) : { done: 0, total: b.problemCount, overdue: false, complete: false };
          return { ...r, ...st };
        })
      )
    )
  );
  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return (
    <TeacherShell active="students" title={group.name}>
      <main className="mx-auto max-w-3xl px-4 py-6">
        <a href="/teacher/groups" className="mb-3 inline-block text-sm font-bold text-ink-soft hover:text-ink">
          ← Все группы
        </a>
        <div className="mb-4 flex items-start gap-3">
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-violet-light text-[22px]" aria-hidden>
            👥
          </span>
          <div className="min-w-0">
            <h1 className="font-display text-2xl font-black text-ink">{group.name}</h1>
            <p className="text-sm text-ink-soft">
              {group.members.length} {pluralRu(group.members.length, ["ученик", "ученика", "учеников"])}
            </p>
          </div>
        </div>

        {(searchParams.created || searchParams.saved) && (
          <p className="mb-4 rounded-2xl bg-pine-light px-4 py-2.5 text-sm font-bold text-pine-dark">
            {searchParams.created ? "Группа создана. Теперь можно запланировать занятие или задать домашку всем сразу." : "Сохранено."}
          </p>
        )}
        {searchParams.hw && (
          <p className="mb-4 rounded-2xl bg-pine-light px-4 py-2.5 text-sm font-bold text-pine-dark">
            Задание выдано: {searchParams.hw} {pluralRu(Number(searchParams.hw), ["ученику", "ученикам", "ученикам"])}.
            {searchParams.hwskip && ` Ещё ${searchParams.hwskip} — без задания: подходящих задач для них не нашлось.`}
          </p>
        )}
        {searchParams.error && (
          <p className="mb-4 rounded-2xl bg-coral-light px-4 py-2.5 text-sm font-bold text-coral-text">
            {searchParams.error === "members" ? "В группе должно быть хотя бы два ученика." : "Не получилось — попробуйте ещё раз."}
          </p>
        )}

        <div className="mb-6 flex flex-wrap gap-1.5">
          {group.members.map((m) => (
            <a
              key={m.id}
              href={`/teacher/student/${m.id}`}
              className="flex min-h-[40px] items-center rounded-pill border border-line-soft bg-white px-3.5 text-[14px] font-bold text-ink transition hover:border-pine"
            >
              {m.name}
            </a>
          ))}
        </div>

        <div className="mb-8 grid grid-cols-2 gap-2">
          <a href={`/teacher/homework/new?groupId=${group.id}`} className="btn-primary !normal-case !tracking-normal">
            Задать ДЗ группе
          </a>
          <a href={`/teacher/groups/${group.id}?add=lesson#lesson`} className="btn-secondary !normal-case !tracking-normal">
            + Занятие
          </a>
        </div>

        <section className="mb-8">
          <h2 className="mb-3 font-display text-lg font-black text-ink">Занятия группы</h2>
          {lessons.unmarked.length > 0 && (
            <div className="mb-4 rounded-card border-2 border-amber/40 bg-amber-light/30 p-4">
              <p className="mb-3 text-sm font-extrabold text-ink">Отметьте, кто был на прошедших занятиях</p>
              <UpcomingLessons lessons={lessons.unmarked} showStudent from="group" past />
            </div>
          )}
          <UpcomingLessons
            lessons={lessons.upcoming}
            showStudent
            from="group"
            limit={8}
            emptyText="Занятий группы пока не запланировано."
          />
          <div id="lesson" className="mt-4 scroll-mt-24">
            <CollapsibleSection title="Запланировать занятие группы" defaultOpen={lessons.upcoming.length === 0 || searchParams.add === "lesson"}>
              <AddLessonForm groupId={group.id} />
            </CollapsibleSection>
          </div>
        </section>

        <section className="mb-8">
          <h2 className="mb-1 font-display text-lg font-black text-ink">Домашка группы</h2>
          <p className="mb-3 text-[13px] text-ink-soft">
            Прогресс каждого ученика. Индивидуальные задания — на странице ученика.
          </p>
          {batches.length === 0 ? (
            <div className="card p-6 text-center text-sm text-ink-soft">
              Групповых заданий пока нет.
              <div className="mt-4">
                <a href={`/teacher/homework/new?groupId=${group.id}`} className="btn-primary">
                  Задать ДЗ группе
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {batches.map((b, i) => {
                const rows = progress[i];
                const complete = rows.filter((r) => r.complete).length;
                const overdue = new Date(b.dueDate) < new Date();
                return (
                  <div key={b.batchId} className="card p-4">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="font-display text-[15px] font-black text-ink">
                        {b.kind !== "homework" && (
                          <span className="mr-1.5 rounded-pill bg-amber-light px-2 py-0.5 text-[11px] font-black text-amber-dark">
                            {KIND[b.kind]}
                          </span>
                        )}
                        {b.title}
                      </p>
                      <span className={`text-[12px] font-bold ${overdue && complete < rows.length ? "text-coral-text" : "text-ink-soft"}`}>
                        до {shortDate(b.dueDate)} · сдали {complete}/{rows.length}
                      </span>
                    </div>
                    <ul className="mt-3 space-y-1.5">
                      {rows.map((r) => {
                        const pct = r.total ? Math.round((r.done / r.total) * 100) : 0;
                        return (
                          <li key={r.homeworkId}>
                            <a href={`/teacher/student/${r.studentId}?tab=hw`} className="flex items-center gap-3 rounded-xl px-1 py-1 hover:bg-paper">
                              <span className="w-28 shrink-0 truncate text-[14px] font-bold text-ink sm:w-40">{r.studentName}</span>
                              <span className="h-2.5 flex-1 overflow-hidden rounded-full bg-line-soft" aria-hidden>
                                <span
                                  className={`block h-full rounded-full ${r.complete ? "bg-pine" : r.overdue ? "bg-coral" : "bg-amber"}`}
                                  style={{ width: `${pct}%` }}
                                />
                              </span>
                              <span className={`w-14 shrink-0 text-right text-[13px] font-black ${r.complete ? "text-pine-dark" : r.overdue ? "text-coral-text" : "text-ink-soft"}`}>
                                {r.complete ? "✓" : `${r.done}/${r.total}`}
                              </span>
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <CollapsibleSection title="Состав и название">
          <form action={updateGroupAction} className="card space-y-4 p-4">
            <input type="hidden" name="groupId" value={group.id} />
            <div>
              <label className="label" htmlFor="name">Название</label>
              <input className="input" id="name" name="name" defaultValue={group.name} maxLength={60} required />
            </div>
            <GroupMemberPicker
              students={sorted.map((s) => ({ id: s.id, name: s.name }))}
              selected={group.members.map((m) => m.id)}
            />
            <p className="text-xs text-ink-soft">
              Состав меняется для новых занятий и заданий. Уже запланированное остаётся у тех, у кого было.
            </p>
            <button type="submit" className="btn-primary">Сохранить</button>
          </form>
          <div className="mt-4">
            <DeleteGroupButton groupId={group.id} />
          </div>
        </CollapsibleSection>
      </main>
    </TeacherShell>
  );
}
