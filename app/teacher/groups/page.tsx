import { getSessionUser } from "@/lib/auth";
import { getStudentsOfTeacher } from "@/lib/queries";
import { getGroupsOfTeacher } from "@/lib/groups";
import TeacherShell from "@/components/TeacherShell";
import CollapsibleSection from "@/components/CollapsibleSection";
import GroupMemberPicker from "@/components/GroupMemberPicker";
import { createGroupAction } from "@/app/actions-groups";

const ERRORS: Record<string, string> = {
  name: "Введите название группы.",
  members: "В группе должно быть хотя бы два ученика.",
  "1": "Группа не найдена.",
};

export default async function GroupsPage({ searchParams }: { searchParams: { error?: string; deleted?: string } }) {
  const user = (await getSessionUser())!;
  const [students, groups] = await Promise.all([getStudentsOfTeacher(user.id), getGroupsOfTeacher(user.id)]);
  const sorted = [...students].sort((a, b) => a.name.localeCompare(b.name, "ru"));

  return (
    <TeacherShell active="students" title="Группы">
      <main className="mx-auto max-w-3xl px-4 py-6">
        <a href="/teacher#students" className="mb-3 inline-block text-sm font-bold text-ink-soft hover:text-ink">
          ← Ученики
        </a>
        <h1 className="font-display text-2xl font-black text-ink">Группы</h1>
        <p className="mb-5 mt-1 text-sm text-ink-soft">
          Занятие и домашку можно назначить всей группе сразу. Индивидуальные задания и занятия у каждого ученика
          остаются как были.
        </p>

        {searchParams.error && ERRORS[searchParams.error] && (
          <p className="mb-4 rounded-2xl bg-coral-light px-4 py-2.5 text-sm font-bold text-coral-text">
            {ERRORS[searchParams.error]}
          </p>
        )}
        {searchParams.deleted && (
          <p className="mb-4 rounded-2xl bg-pine-light px-4 py-2.5 text-sm font-bold text-pine-dark">
            Группа удалена. Занятия и задания учеников сохранились.
          </p>
        )}

        {groups.length > 0 && (
          <div className="mb-6 space-y-2">
            {groups.map((g) => (
              <a
                key={g.id}
                href={`/teacher/groups/${g.id}`}
                className="flex items-center gap-3 rounded-[20px] border border-line-soft bg-white p-3.5 transition hover:border-pine"
              >
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-violet-light font-display text-[15px] font-black text-violet">
                  {g.members.length}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-[15px] font-black text-ink">{g.name}</span>
                  <span className="block truncate text-[12px] text-ink-soft">
                    {g.members.map((m) => m.name.split(" ")[0]).join(", ") || "нет учеников"}
                  </span>
                </span>
                <span className="font-black text-ink-soft">›</span>
              </a>
            ))}
          </div>
        )}

        {students.length < 2 ? (
          <div className="card p-6 text-center text-sm text-ink-soft">
            Для группы нужно хотя бы два ученика.
            <div className="mt-4">
              <a href="/teacher/students/new" className="btn-primary">
                + Добавить ученика
              </a>
            </div>
          </div>
        ) : (
          <CollapsibleSection title="Новая группа" defaultOpen={groups.length === 0}>
            <form action={createGroupAction} className="card space-y-4 p-4">
              <div>
                <label className="label" htmlFor="name">Название</label>
                <input className="input" id="name" name="name" required maxLength={60} placeholder="Например, «11 класс, вторник»" />
              </div>
              <GroupMemberPicker students={sorted.map((s) => ({ id: s.id, name: s.name }))} />
              <p className="text-xs text-ink-soft">Один ученик может быть в нескольких группах.</p>
              <button type="submit" className="btn-primary">Создать группу</button>
            </form>
          </CollapsibleSection>
        )}
      </main>
    </TeacherShell>
  );
}
