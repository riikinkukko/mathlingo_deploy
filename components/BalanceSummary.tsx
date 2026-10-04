import { StudentBalance } from "@/lib/types";
import { formatRub } from "@/lib/money";
import { pluralRu } from "@/lib/pluralize";

const LESSONS: [string, string, string] = ["занятие", "занятия", "занятий"];

/** Текстовый статус баланса: "осталось 3 занятия" / "долг 2 занятия" / "в расчёте". */
export function balanceLabel(balance: number): string {
  if (balance > 0) return `осталось ${balance} ${pluralRu(balance, LESSONS)}`;
  if (balance < 0) {
    const n = -balance;
    return `долг ${n} ${pluralRu(n, LESSONS)}`;
  }
  return "в расчёте";
}

/** Статус баланса с учётом рублей: «долг 3 200 ₽» / «оплачено вперёд 2 000 ₽» / «в расчёте». */
export function balanceText(b: StudentBalance): string {
  if (b.balanceRub === null) return balanceLabel(b.balance);
  if (b.balanceRub < 0) return `долг ${formatRub(-b.balanceRub)}`;
  if (b.balanceRub > 0) return `оплачено вперёд ${formatRub(b.balanceRub)}`;
  return "в расчёте";
}

export function balanceTone(b: StudentBalance): string {
  return balanceColor(b.balanceRub === null ? b.balance : Math.sign(b.balanceRub));
}

export function balanceColor(balance: number): string {
  if (balance < 0) return "text-coral";
  if (balance > 0) return "text-pine-dark";
  return "text-ink-soft";
}

/** Три плашки на странице ученика: оплачено / проведено / остаток. */
export default function BalanceSummary({ balance }: { balance: StudentBalance }) {
  if (balance.balanceRub !== null) {
    const debt = balance.balanceRub < 0;
    return (
      <div className="mb-4 grid grid-cols-3 gap-3">
        <div className="card px-3 py-3 text-center">
          <p className="whitespace-nowrap font-mono text-base font-semibold leading-none text-ink">{formatRub(balance.paidRub)}</p>
          <p className="mt-1 text-[11px] text-ink-soft">оплачено</p>
        </div>
        <div className="card px-3 py-3 text-center">
          <p className="font-mono text-lg font-semibold leading-none text-ink">{balance.chargedLessons}</p>
          <p className="mt-1 text-[11px] text-ink-soft">
            {pluralRu(balance.chargedLessons, ["занятие", "занятия", "занятий"])} засчитано
          </p>
          <p className="mt-0.5 text-[11px] text-ink-soft">цена {formatRub(balance.priceRub ?? 0)}</p>
        </div>
        <div className={`card px-3 py-3 text-center ${debt ? "border-2 !border-coral bg-coral-light/40" : ""}`}>
          <p className={`whitespace-nowrap font-mono text-base font-semibold leading-none ${balanceTone(balance)}`}>
            {balance.balanceRub > 0 ? "+" : ""}
            {formatRub(balance.balanceRub)}
          </p>
          <p className={`mt-1 text-[11px] font-bold ${balanceTone(balance)}`}>{balanceText(balance)}</p>
        </div>
      </div>
    );
  }
  return (
    <div className="mb-4 grid grid-cols-3 gap-3">
      <div className="card px-3 py-3 text-center">
        <p className="font-mono text-lg font-semibold leading-none text-ink">{balance.paidLessons}</p>
        <p className="mt-1 text-[11px] text-ink-soft">оплачено занятий</p>
        <p className="mt-0.5 text-[11px] text-ink-soft">{formatRub(balance.paidRub)}</p>
      </div>
      <div className="card px-3 py-3 text-center">
        <p className="font-mono text-lg font-semibold leading-none text-ink">{balance.chargedLessons}</p>
        <p className="mt-1 text-[11px] text-ink-soft">засчитано</p>
        <p className="mt-0.5 text-[11px] text-ink-soft">по расписанию</p>
      </div>
      <div
        className={`card px-3 py-3 text-center ${balance.balance < 0 ? "border-2 !border-coral bg-coral-light/40" : ""}`}
      >
        <p className={`font-mono text-lg font-semibold leading-none ${balanceColor(balance.balance)}`}>
          {balance.balance > 0 ? `+${balance.balance}` : balance.balance}
        </p>
        <p className={`mt-1 text-[11px] font-bold ${balanceColor(balance.balance)}`}>
          {balanceLabel(balance.balance)}
        </p>
      </div>
    </div>
  );
}
