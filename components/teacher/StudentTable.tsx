"use client";

import { useMemo, useState } from "react";
import { pluralRu } from "@/lib/pluralize";

/** Строка таблицы учеников (всё посчитано на сервере в app/teacher/page.tsx). */
export interface StudentTableRow {
  id: string;
  name: string;
  grade: number | null;
  targetScore: number | null;
  /** для сортировки: ms последней активности (0 — ни разу) */
  lastActiveMs: number;
  lastLabel: string;
  /** не заходит 3+ дня */
  idle: boolean;
  solvedWeek: number;
  accuracyWeek: number | null;
  pendingReviews: number;
  hwOpen: number;
  hwOverdue: number;
  hwTotal: number;
  mock: number | null;
  groups: string[];
  debtLabel: string | null;
}

export interface PendingInviteRow {
  id: string;
  name: string;
  email: string;
  sentLabel: string;
}

type SortKey = "name" | "goal" | "last" | "week" | "reviews" | "hw" | "mock";

const COLUMNS: { key: SortKey; label: string; title?: string; className?: string }[] = [
  { key: "name", label: "Ученик" },
  { key: "goal", label: "Класс / цель" },
  { key: "last", label: "Активность" },
  { key: "week", label: "За неделю", title: "Решено задач за 7 дней / точность" },
  { key: "reviews", label: "Проверка", title: "Развёрнутые решения на проверке" },
  { key: "hw", label: "ДЗ" },
  { key: "mock", label: "Пробник", className: "text-right" },
];

function hwRank(r: StudentTableRow): number {
  // Просроченное важнее открытого, открытое — важнее «всё сдано».
  return r.hwOverdue * 1000 + r.hwOpen;
}

function compare(a: StudentTableRow, b: StudentTableRow, key: SortKey): number {
  switch (key) {
    case "name":
      return a.name.localeCompare(b.name, "ru");
    case "goal":
      return (a.targetScore ?? -1) - (b.targetScore ?? -1) || (a.grade ?? -1) - (b.grade ?? -1);
    case "last":
      return a.lastActiveMs - b.lastActiveMs;
    case "week":
      return a.solvedWeek - b.solvedWeek || (a.accuracyWeek ?? -1) - (b.accuracyWeek ?? -1);
    case "reviews":
      return a.pendingReviews - b.pendingReviews;
    case "hw":
      return hwRank(a) - hwRank(b);
    case "mock":
      return (a.mock ?? -1) - (b.mock ?? -1);
  }
}

/** По умолчанию: имя — по алфавиту, остальное — «больше/свежее сверху». */
const DEFAULT_DIR: Record<SortKey, 1 | -1> = { name: 1, goal: -1, last: -1, week: -1, reviews: -1, hw: -1, mock: -1 };

/**
 * Таблица учеников для десктопа (lg+): поиск по имени, сортировка по клику на
 * заголовок, фильтр по группе. На телефоне остаются карточки — таблица скрыта.
 */
export default function StudentTable({
  rows,
  groups,
  invites,
  cancelInvite,
}: {
  rows: StudentTableRow[];
  groups: string[];
  invites: PendingInviteRow[];
  cancelInvite: (formData: FormData) => void | Promise<void>;
}) {
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: "name", dir: 1 });

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows
      .filter((r) => (!q || r.name.toLowerCase().includes(q)) && (!group || r.groups.includes(group)))
      .sort((a, b) => compare(a, b, sort.key) * sort.dir || a.name.localeCompare(b.name, "ru"));
  }, [rows, query, group, sort]);

  function toggle(key: SortKey) {
    setSort((s) => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: DEFAULT_DIR[key] }));
  }

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <label className="relative min-w-[200px] max-w-md flex-1">
          <span className="sr-only">Поиск по имени</span>
          <svg
            aria-hidden
            viewBox="0 0 24 24"
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-soft"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.4"
            strokeLinecap="round"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M20 20l-3.5-3.5" />
          </svg>
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Поиск по имени"
            className="input !h-10 !py-0 !pl-9 text-sm"
          />
        </label>
        {groups.length > 0 && (
          <label className="flex items-center gap-2 text-[13px] font-bold text-ink-soft">
            Группа
            <select value={group} onChange={(e) => setGroup(e.target.value)} className="input !h-10 !w-auto max-w-[220px] !py-0 text-sm">
              <option value="">Все ученики</option>
              {groups.map((g) => (
                <option key={g} value={g}>
                  {g}
                </option>
              ))}
            </select>
          </label>
        )}
        {(query || group) && (
          <span className="text-[12px] font-bold text-ink-soft">
            {visible.length} из {rows.length}
          </span>
        )}
      </div>

      <div className="overflow-x-auto rounded-[20px] border border-line-soft bg-white">
        <table className="w-full min-w-[600px] border-collapse text-left text-[13px]">
          <thead>
            <tr className="border-b border-line-soft bg-paper/60">
              {COLUMNS.map((c) => {
                const active = sort.key === c.key;
                return (
                  <th
                    key={c.key}
                    scope="col"
                    aria-sort={active ? (sort.dir === 1 ? "ascending" : "descending") : "none"}
                    className={`whitespace-nowrap px-2 py-2 first:pl-4 last:pr-4 ${c.className ?? ""}`}
                  >
                    <button
                      type="button"
                      onClick={() => toggle(c.key)}
                      title={c.title}
                      className={`inline-flex items-center gap-1 text-[11px] font-black uppercase tracking-wide transition hover:text-ink ${
                        active ? "text-ink" : "text-ink-soft"
                      }`}
                    >
                      {c.label}
                      <span aria-hidden className={`text-[10px] ${active ? "" : "opacity-0"}`}>
                        {active && sort.dir === -1 ? "▼" : "▲"}
                      </span>
                    </button>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {visible.map((r) => {
              const href = `/teacher/student/${r.id}`;
              return (
                <tr key={r.id} className="group border-b border-line-soft last:border-b-0 hover:bg-paper/70">
                  <td className="py-2.5 pl-4 pr-2">
                    <a href={href} className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] bg-pine-light font-display text-[12px] font-black text-pine-dark">
                        {r.name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase()}
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[170px] truncate font-display text-[14px] font-black text-ink group-hover:text-pine-dark">
                          {r.name}
                        </span>
                        {(r.groups.length > 0 || r.debtLabel) && (
                          <span className="mt-0.5 flex flex-wrap gap-1">
                            {r.groups.slice(0, 2).map((g) => (
                              <span key={g} className="max-w-[110px] truncate rounded-pill bg-violet-light px-1.5 py-px text-[10px] font-black text-violet-text">
                                {g}
                              </span>
                            ))}
                            {r.debtLabel && (
                              <span className="rounded-pill bg-coral-light px-1.5 py-px text-[10px] font-black text-coral-text">
                                долг {r.debtLabel}
                              </span>
                            )}
                          </span>
                        )}
                      </span>
                    </a>
                  </td>
                  <td className="px-2 py-2.5 text-ink">
                    {r.grade || r.targetScore ? (
                      <>
                        {r.grade ? <span className="whitespace-nowrap">{r.grade} кл</span> : ""}
                        {r.grade && r.targetScore ? " · " : ""}
                        {r.targetScore ? <span className="whitespace-nowrap text-ink-soft">цель {r.targetScore}</span> : ""}
                      </>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                  <td className={`px-2 py-2.5 ${r.idle ? "font-bold text-amber-dark" : "text-ink"}`}>{r.lastLabel}</td>
                  <td className="px-2 py-2.5">
                    {r.solvedWeek > 0 || r.accuracyWeek !== null ? (
                      <span title={`${r.solvedWeek} ${pluralRu(r.solvedWeek, ["задача решена", "задачи решено", "задач решено"])} за 7 дней`}>
                        <span className="font-mono font-semibold text-ink">{r.solvedWeek}</span>
                        <span className="text-ink-soft"> зад.</span>
                        {r.accuracyWeek !== null && <span className="whitespace-nowrap text-ink-soft"> · {r.accuracyWeek}%</span>}
                      </span>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="px-2 py-2.5">
                    {r.pendingReviews > 0 ? (
                      <a
                        href="/teacher/reviews"
                        className="inline-block whitespace-nowrap rounded-pill bg-violet-light px-2 py-0.5 text-[11px] font-black text-violet-text hover:underline"
                      >
                        на проверке {r.pendingReviews}
                      </a>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap px-2 py-2.5">
                    {r.hwOverdue > 0 ? (
                      <span className="font-bold text-coral-text">просрочено {r.hwOverdue}</span>
                    ) : r.hwOpen > 0 ? (
                      <span className="text-ink">открыто {r.hwOpen}</span>
                    ) : r.hwTotal > 0 ? (
                      <span className="font-bold text-pine-dark">всё сдано</span>
                    ) : (
                      <span className="text-ink-soft">нет ДЗ</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 pl-2 pr-4 text-right">
                    {r.mock !== null ? (
                      <span
                        className={`font-mono text-[14px] font-semibold ${
                          r.targetScore && r.mock >= r.targetScore ? "text-pine-dark" : "text-ink"
                        }`}
                      >
                        {r.mock}
                      </span>
                    ) : (
                      <span className="text-ink-soft">—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {visible.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="px-4 py-6 text-center text-sm text-ink-soft">
                  {rows.length === 0 ? "Пока нет учеников." : "Никого не нашлось — измените поиск или фильтр."}
                </td>
              </tr>
            )}
            {!query &&
              !group &&
              invites.map((inv) => (
                <tr key={inv.id} className="border-t border-dashed border-line-soft bg-paper/40">
                  <td className="py-2.5 pl-4 pr-3">
                    <span className="flex items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px] border border-dashed border-line bg-white text-[13px]" aria-hidden>
                        ✉
                      </span>
                      <span className="min-w-0">
                        <span className="block max-w-[170px] truncate font-display text-[14px] font-black text-ink-soft">{inv.name}</span>
                        <span className="block max-w-[170px] truncate text-[11px] text-ink-soft" title={inv.email}>{inv.email}</span>
                      </span>
                    </span>
                  </td>
                  <td colSpan={5} className="px-3 py-2.5 text-ink-soft">
                    <span className="rounded-pill bg-amber-light px-2 py-0.5 text-[11px] font-black text-amber-dark">Приглашение отправлено</span>{" "}
                    {inv.sentLabel} · ждём, когда ученик примет
                  </td>
                  <td className="py-2.5 pl-3 pr-4 text-right">
                    <form action={cancelInvite}>
                      <input type="hidden" name="inviteId" value={inv.id} />
                      <button type="submit" className="text-[12px] font-bold text-ink-soft hover:text-coral-text hover:underline">
                        Отозвать
                      </button>
                    </form>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
