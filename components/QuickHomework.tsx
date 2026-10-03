import { createQuickHomeworkAction } from "@/app/actions-quick-homework";

function Pills({ name, options, def, suffix }: { name: string; options: number[]; def: number; suffix: (n: number) => string }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => (
        <label key={o} className="cursor-pointer">
          <input type="radio" name={name} value={o} defaultChecked={o === def} className="peer sr-only" />
          <span className="flex h-10 items-center rounded-xl border border-line-soft bg-white px-3.5 text-[14px] font-extrabold text-ink-soft transition peer-checked:border-pine-dark peer-checked:bg-pine-dark peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-pine">
            {suffix(o)}
          </span>
        </label>
      ))}
    </div>
  );
}

function Settings() {
  return (
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div>
        <p className="mb-1.5 text-[12px] font-black uppercase tracking-wide text-ink-soft">Задач</p>
        <Pills name="count" options={[5, 10, 15]} def={10} suffix={(n) => String(n)} />
      </div>
      <div>
        <p className="mb-1.5 text-[12px] font-black uppercase tracking-wide text-ink-soft">Срок</p>
        <Pills name="dueDays" options={[3, 7]} def={7} suffix={(n) => (n === 7 ? "неделя" : `${n} дня`)} />
      </div>
    </div>
  );
}

/**
 * «Домашка в один тап» — вверху страницы нового задания. Две карточки:
 * по слабым местам (ошибки ученика) и по выбранным номерам ЕГЭ. Задачи
 * подбираются из банка, задание назначается сразу.
 */
export default function QuickHomework({
  studentId,
  groupId,
  weak,
  numbers,
  notice,
}: {
  studentId?: string;
  /** задание группе: каждому ученику подбираются задачи по его ошибкам */
  groupId?: string;
  /** null — группа: сводку по одному ученику не показываем */
  weak: { mistakes: number; numbers: number[] } | null;
  numbers: number[];
  notice?: string;
}) {
  return (
    <section className="mb-8 space-y-3">
      <h2 className="font-display text-lg font-black text-ink">Быстрое задание</h2>
      {notice && <p className="rounded-2xl bg-amber-light px-4 py-2.5 text-sm font-bold text-amber-dark">{notice}</p>}

      <form action={createQuickHomeworkAction} className="rounded-[20px] border border-line-soft bg-white p-4">
        {groupId ? <input type="hidden" name="groupId" value={groupId} /> : <input type="hidden" name="studentId" value={studentId} />}
        <input type="hidden" name="mode" value="weak" />
        <p className="font-display text-[16px] font-black text-ink">По слабым местам</p>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          {!weak
            ? "Каждому ученику группы — свои задачи: его нерешённые ошибки, потом похожие задачи тех же номеров."
            : weak.mistakes > 0
            ? `Не решено задач с ошибками: ${weak.mistakes}${
                weak.numbers.length ? ` · номера ${weak.numbers.slice(0, 6).map((n) => `№${n}`).join(", ")}` : ""
              }. Сначала они, потом похожие задачи тех же номеров.`
            : "У ученика пока нет нерешённых ошибок — подбирать нечего. Воспользуйтесь выбором по номерам."}
        </p>
        <Settings />
        <button type="submit" disabled={!!weak && weak.mistakes === 0} className="btn-primary mt-4 w-full !normal-case !tracking-normal sm:w-auto">
          Задать работу над ошибками
        </button>
      </form>

      <form action={createQuickHomeworkAction} className="rounded-[20px] border border-line-soft bg-white p-4">
        {groupId ? <input type="hidden" name="groupId" value={groupId} /> : <input type="hidden" name="studentId" value={studentId} />}
        <input type="hidden" name="mode" value="numbers" />
        <p className="font-display text-[16px] font-black text-ink">По номерам ЕГЭ</p>
        <p className="mt-0.5 text-[13px] text-ink-soft">
          {groupId
            ? "Отметьте номера — всей группе одинаковые задачи, поровну по номерам. Сначала берутся те, что никто из группы ещё не решил."
            : "Отметьте номера — задачи разделятся между ними поровну, решённые ранее не попадут."}
        </p>
        <fieldset className="mt-3">
          <legend className="sr-only">Номера ЕГЭ</legend>
          <div className="grid grid-cols-6 gap-1.5 sm:grid-cols-10">
            {numbers.map((n) => (
              <label key={n} className="cursor-pointer">
                <input type="checkbox" name="numbers" value={n} className="peer sr-only" />
                <span className="flex h-10 items-center justify-center rounded-xl border border-line-soft bg-white text-[14px] font-black text-ink-soft transition peer-checked:border-pine-dark peer-checked:bg-pine-dark peer-checked:text-white peer-focus-visible:ring-2 peer-focus-visible:ring-pine">
                  {n}
                </span>
              </label>
            ))}
          </div>
        </fieldset>
        <Settings />
        <button type="submit" className="btn-primary mt-4 w-full !normal-case !tracking-normal sm:w-auto">
          Задать по номерам
        </button>
      </form>

      <p className="pt-2 text-center text-[13px] font-bold text-ink-soft">или соберите задание вручную ↓</p>
    </section>
  );
}
