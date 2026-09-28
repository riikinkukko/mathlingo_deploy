"use client";

import { useFormStatus } from "react-dom";
import { createLessonAction } from "@/app/actions-schedule";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : "Запланировать"}
    </button>
  );
}

/**
 * Форма планирования занятия. Два режима:
 *  - на странице ученика: студент фиксирован (studentId задан, селектор скрыт);
 *  - на странице расписания: передаётся список students — репетитор выбирает.
 * `from` определяет, куда экшен вернёт после сохранения.
 */
export default function AddLessonForm({
  studentId,
  students,
  from,
}: {
  studentId?: string;
  students?: { id: string; name: string }[];
  from: "student" | "schedule";
}) {
  // Значение по умолчанию для datetime-local: сегодня, ближайший круглый час
  // в московском времени.
  const now = new Date();
  const msk = new Date(now.toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  msk.setHours(msk.getHours() + 1, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  const defaultDT = `${msk.getFullYear()}-${pad(msk.getMonth() + 1)}-${pad(msk.getDate())}T${pad(
    msk.getHours()
  )}:${pad(msk.getMinutes())}`;

  return (
    <form action={createLessonAction} className="card space-y-3 p-4">
      <input type="hidden" name="from" value={from} />
      {studentId && <input type="hidden" name="studentId" value={studentId} />}

      {!studentId && students && (
        <div>
          <label className="label" htmlFor="studentId">Ученик</label>
          <select className="input" id="studentId" name="studentId" required defaultValue="">
            <option value="" disabled>
              Выберите ученика…
            </option>
            {students.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div>
          <label className="label" htmlFor="startsAt">Дата и время (МСК)</label>
          <input
            className="input"
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={defaultDT}
            required
          />
        </div>
        <div>
          <label className="label" htmlFor="durationMin">Длит., мин</label>
          <input
            className="input"
            id="durationMin"
            name="durationMin"
            type="number"
            min={15}
            max={300}
            step={15}
            defaultValue={60}
          />
        </div>
      </div>

      <div>
        <label className="label" htmlFor="topic">Тема (необязательно)</label>
        <input className="input" id="topic" name="topic" placeholder="Например, «Стереометрия: сечения»" />
      </div>

      <SubmitButton />
    </form>
  );
}
