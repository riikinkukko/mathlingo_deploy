/** Чекбоксы учеников для формы группы (серверный компонент, без JS). */
export default function GroupMemberPicker({
  students,
  selected = [],
}: {
  students: { id: string; name: string }[];
  selected?: string[];
}) {
  return (
    <fieldset>
      <legend className="label">Ученики группы</legend>
      <div className="grid gap-1.5 sm:grid-cols-2">
        {students.map((s) => (
          <label
            key={s.id}
            className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-2xl border border-line-soft bg-white px-3.5 text-[15px] font-bold text-ink transition has-[:checked]:border-pine has-[:checked]:bg-pine-light/40"
          >
            <input
              type="checkbox"
              name="studentIds"
              value={s.id}
              defaultChecked={selected.includes(s.id)}
              className="h-5 w-5 shrink-0 accent-pine"
            />
            <span className="truncate">{s.name}</span>
          </label>
        ))}
      </div>
    </fieldset>
  );
}
