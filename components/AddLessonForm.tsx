"use client";

import { useEffect, useRef, useState } from "react";
import { useFormState, useFormStatus } from "react-dom";
import { createLessonAction, CreateLessonState } from "@/app/actions-schedule";

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button className="btn-primary" type="submit" disabled={pending}>
      {pending ? "Сохраняем…" : "Запланировать"}
    </button>
  );
}

/** Ближайший круглый час по Москве в формате datetime-local. */
function nextHourMsk(): string {
  const msk = new Date(new Date().toLocaleString("en-US", { timeZone: "Europe/Moscow" }));
  msk.setHours(msk.getHours() + 1, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${msk.getFullYear()}-${pad(msk.getMonth() + 1)}-${pad(msk.getDate())}T${pad(
    msk.getHours()
  )}:${pad(msk.getMinutes())}`;
}

/**
 * Форма планирования занятия. Два режима:
 *  - на странице ученика: студент фиксирован (studentId задан, селектор скрыт);
 *  - на странице расписания: передаётся список students — репетитор выбирает.
 * После успешного сохранения очищаются дата/время и тема; ученик и
 * длительность остаются — удобно планировать несколько занятий подряд.
 */
export default function AddLessonForm({
  studentId,
  students,
  groups = [],
  groupId,
  defaultStartsAt,
  onSaved,
}: {
  studentId?: string;
  students?: { id: string; name: string }[];
  /** группы репетитора — в выборе «Ученик или группа» */
  groups?: { id: string; name: string; count: number }[];
  /** страница группы: группа фиксирована */
  groupId?: string;
  /** «YYYY-MM-DDTHH:MM» — время, выбранное нажатием на пустое место сетки */
  defaultStartsAt?: string;
  /** после успешного сохранения (например, закрыть окно) */
  onSaved?: () => void;
  /** оставлено для совместимости со старыми вызовами */
  from?: "student" | "schedule";
}) {
  const [state, formAction] = useFormState<CreateLessonState, FormData>(createLessonAction, null);
  const startsAtRef = useRef<HTMLInputElement>(null);
  const topicRef = useRef<HTMLInputElement>(null);
  const repeatRef = useRef<HTMLSelectElement>(null);
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (!state?.ok) return;
    if (startsAtRef.current) startsAtRef.current.value = "";
    if (topicRef.current) topicRef.current.value = "";
    // Повтор сбрасываем, чтобы следующее сохранение случайно не создало ещё серию.
    if (repeatRef.current) repeatRef.current.value = "1";
    setShowSaved(true);
    onSaved?.();
    const t = setTimeout(() => setShowSaved(false), 3000);
    return () => clearTimeout(t);
  }, [state]);

  return (
    <form action={formAction} className="card space-y-3 p-4">
      {studentId && <input type="hidden" name="studentId" value={studentId} />}
      {groupId && <input type="hidden" name="studentId" value={`g:${groupId}`} />}

      {!studentId && !groupId && students && (
        <div>
          <label className="label" htmlFor="studentId">{groups.length ? "Ученик или группа" : "Ученик"}</label>
          <select className="input" id="studentId" name="studentId" required defaultValue="">
            <option value="" disabled>
              {groups.length ? "Выберите ученика или группу…" : "Выберите ученика…"}
            </option>
            {groups.length > 0 && (
              <optgroup label="Группы">
                {groups.map((g) => (
                  <option key={g.id} value={`g:${g.id}`}>
                    👥 {g.name} ({g.count})
                  </option>
                ))}
              </optgroup>
            )}
            {groups.length > 0 ? (
              <optgroup label="Ученики">
                {students.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </optgroup>
            ) : (
              students.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))
            )}
          </select>
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-[1fr_120px]">
        <div>
          <label className="label" htmlFor="startsAt">Дата и время (МСК)</label>
          <input
            ref={startsAtRef}
            className="input"
            id="startsAt"
            name="startsAt"
            type="datetime-local"
            defaultValue={defaultStartsAt ?? nextHourMsk()}
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
        <label className="label" htmlFor="repeatWeeks">Повторять</label>
        <select ref={repeatRef} className="input" id="repeatWeeks" name="repeatWeeks" defaultValue="1">
          <option value="1">Не повторять — одно занятие</option>
          <option value="4">Каждую неделю — 4 занятия (месяц)</option>
          <option value="8">Каждую неделю — 8 занятий (2 месяца)</option>
          <option value="12">Каждую неделю — 12 занятий (3 месяца)</option>
          <option value="24">Каждую неделю — 24 занятия (полгода)</option>
        </select>
      </div>

      <div>
        <label className="label" htmlFor="topic">Тема (необязательно)</label>
        <input
          ref={topicRef}
          className="input"
          id="topic"
          name="topic"
          placeholder="Например, «Стереометрия: сечения»"
        />
      </div>

      {state?.error && <p className="text-sm font-semibold text-coral">{state.error}</p>}

      <div className="flex items-center gap-3">
        <SubmitButton />
        {showSaved && (
          <span className="text-sm font-bold text-pine">
            ✓ {state?.count && state.count > 1 ? `Запланировано занятий: ${state.count}` : "Занятие запланировано"}
          </span>
        )}
      </div>
    </form>
  );
}
