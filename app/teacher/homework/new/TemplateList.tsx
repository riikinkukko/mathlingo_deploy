import { createHomeworkAction } from "@/app/actions";
import { deleteTemplateAction } from "@/app/actions-templates";
import type { AssignmentTemplate } from "@/lib/templates";
import { pluralRu } from "@/lib/pluralize";

const KIND: Record<string, string> = { homework: "Домашка", test: "Контрольная", exam: "Пробник" };

/**
 * «Мои шаблоны»: сохранённые задания репетитора. Выдать — одна кнопка (срок
 * можно поменять), задачи и настройки берутся из шаблона (lib/templates.ts).
 */
export default function TemplateList({
  templates,
  studentId,
  groupId,
  defaultDue,
}: {
  templates: AssignmentTemplate[];
  studentId?: string;
  groupId?: string;
  defaultDue: string;
}) {
  if (templates.length === 0) return null;
  return (
    <section className="mb-6">
      <h2 className="mb-1 font-display text-[18px] font-black text-ink">Мои шаблоны</h2>
      <p className="mb-3 text-[13px] text-ink-soft">Сохранённые задания — выдайте их в два клика.</p>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {templates.map((t) => (
          <div key={t.id} className="rounded-[20px] border border-line-soft bg-white p-4">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate font-display text-[15px] font-black text-ink">{t.title}</p>
                <p className="text-[12px] font-bold text-ink-soft">
                  {KIND[t.kind] ?? "Задание"} · {t.problemIds.length} {pluralRu(t.problemIds.length, ["задача", "задачи", "задач"])}
                  {t.timeLimitMinutes ? ` · ${t.timeLimitMinutes} мин` : ""}
                  {!t.allowHints ? " · без подсказок" : ""}
                </p>
              </div>
              <form action={deleteTemplateAction}>
                <input type="hidden" name="templateId" value={t.id} />
                <button
                  type="submit"
                  aria-label={`Удалить шаблон «${t.title}»`}
                  className="flex h-9 w-9 items-center justify-center rounded-full text-ink-soft hover:bg-coral-light hover:text-coral"
                >
                  ✕
                </button>
              </form>
            </div>
            <form action={createHomeworkAction} className="mt-3 flex flex-wrap items-end gap-2">
              <input type="hidden" name="templateId" value={t.id} />
              {groupId ? <input type="hidden" name="groupId" value={groupId} /> : <input type="hidden" name="studentId" value={studentId} />}
              <input type="hidden" name="title" value={t.title} />
              <input type="hidden" name="kind" value={t.kind} />
              {t.allowHints && <input type="hidden" name="allowHints" value="on" />}
              {t.timeLimitMinutes ? <input type="hidden" name="timeLimitMinutes" value={t.timeLimitMinutes} /> : null}
              <label className="min-w-[150px] flex-1">
                <span className="label">Срок сдачи</span>
                <input className="input" type="date" name="dueDate" required defaultValue={defaultDue} />
              </label>
              <button type="submit" className="btn-primary h-[48px] !text-sm">
                Выдать
              </button>
            </form>
          </div>
        ))}
      </div>
    </section>
  );
}
