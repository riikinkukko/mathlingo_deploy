"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PublicProblem } from "@/lib/types";
import DiagramRenderer from "../diagrams/DiagramRenderer";
import PhotoSlot from "./PhotoSlot";
import { finishMockAction, saveMockProgressAction } from "@/app/actions-mock";
import { blankAnswerProblem, formatDuration, isPart1, maxPointsForSlot } from "@/lib/mock-exam";

export interface RunnerItem {
  n: number;
  problem: PublicProblem;
}

type SaveState = "saved" | "saving" | "dirty" | "error";

/** Отметки времени, после которых показываем напоминание (минут до конца). */
const WARN_AT_MIN = [30, 10, 5];

/** «до 1 балла», «до 3 баллов» */
function pointsWord(p: number) {
  return p === 1 ? "балла" : "баллов";
}

export default function MockRunner({
  mockId,
  variant,
  modeTitle,
  deadlineAt,
  items,
  initialAnswers,
  initialFlags,
  initialTimeSpent,
  initialImages,
  hasTeacher,
  resumed,
}: {
  mockId: string;
  variant: number;
  modeTitle: string;
  deadlineAt: string | null;
  items: RunnerItem[];
  initialAnswers: Record<string, string>;
  initialFlags: string[];
  initialTimeSpent: Record<string, number>;
  initialImages: Record<string, string>;
  hasTeacher: boolean;
  resumed: boolean;
}) {
  const [index, setIndex] = useState(() => {
    // Продолжаем с первого задания без ответа.
    const i = items.findIndex((it) => !initialAnswers[it.problem.id] && !initialImages[it.problem.id]);
    return i >= 0 ? i : 0;
  });
  const [answers, setAnswers] = useState<Record<string, string>>(initialAnswers);
  const [flags, setFlags] = useState<string[]>(initialFlags);
  const [images, setImages] = useState<Record<string, string>>(initialImages);
  const [save, setSave] = useState<SaveState>("saved");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [finishOpen, setFinishOpen] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);
  const [timerHidden, setTimerHidden] = useState(false);
  const [remaining, setRemaining] = useState<number | null>(() =>
    deadlineAt ? Math.round((new Date(deadlineAt).getTime() - Date.now()) / 1000) : null
  );
  const [warning, setWarning] = useState<string | null>(null);
  const [showTextFor, setShowTextFor] = useState<Record<string, boolean>>({});
  const [resumedNote, setResumedNote] = useState(resumed);
  useEffect(() => {
    if (!resumedNote) return;
    const t = setTimeout(() => setResumedNote(false), 7000);
    return () => clearTimeout(t);
  }, [resumedNote]);
  const [elapsedTotal, setElapsedTotal] = useState(() => Object.values(initialTimeSpent).reduce((s, x) => s + x, 0));

  const expired = remaining !== null && remaining <= 0;
  const hasPart2 = items.some((it) => !isPart1(it.n));
  const current = items[index];
  const pid = current.problem.id;

  // ---------- Время на каждое задание ----------
  const timeRef = useRef<Record<string, number>>({ ...initialTimeSpent });
  const activeRef = useRef<{ pid: string; since: number } | null>(null);
  const flushTime = useCallback(() => {
    const a = activeRef.current;
    if (!a) return;
    const now = Date.now();
    timeRef.current[a.pid] = (timeRef.current[a.pid] ?? 0) + (now - a.since) / 1000;
    a.since = now;
  }, []);

  useEffect(() => {
    flushTime();
    activeRef.current = document.visibilityState === "visible" && !expired ? { pid, since: Date.now() } : null;
  }, [pid, expired, flushTime]);

  useEffect(() => {
    const onVis = () => {
      flushTime();
      activeRef.current = document.visibilityState === "visible" && !expired ? { pid, since: Date.now() } : null;
      if (document.visibilityState === "hidden") void doSave();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => document.removeEventListener("visibilitychange", onVis);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pid, expired]);

  // ---------- Автосохранение ----------
  const stateRef = useRef({ answers, flags });
  stateRef.current = { answers, flags };
  const savingRef = useRef(false);
  const dirtyRef = useRef(false);

  const doSave = useCallback(async () => {
    if (savingRef.current) {
      dirtyRef.current = true;
      return;
    }
    flushTime();
    savingRef.current = true;
    dirtyRef.current = false;
    setSave("saving");
    const timeSpent = Object.fromEntries(Object.entries(timeRef.current).map(([k, v]) => [k, Math.round(v)]));
    try {
      const res = await saveMockProgressAction(mockId, { ...stateRef.current, timeSpent });
      setSave("error" in res ? "error" : dirtyRef.current ? "dirty" : "saved");
    } catch {
      setSave("error");
    } finally {
      savingRef.current = false;
    }
    if (dirtyRef.current) void doSave();
  }, [mockId, flushTime]);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markDirty = useCallback(() => {
    setSave("dirty");
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => void doSave(), 900);
  }, [doSave]);

  // Время копится и без ввода — раз в 20 секунд сохраняем счётчики. При
  // ошибке связи тот же таймер повторяет попытку.
  useEffect(() => {
    const t = setInterval(() => {
      if (!expired) void doSave();
    }, 20_000);
    return () => clearInterval(t);
  }, [doSave, expired]);

  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (save === "dirty" || save === "saving") {
        e.preventDefault();
      }
    };
    window.addEventListener("beforeunload", onUnload);
    return () => window.removeEventListener("beforeunload", onUnload);
  }, [save]);

  // ---------- Таймер ----------
  useEffect(() => {
    if (!deadlineAt) {
      const t = setInterval(() => setElapsedTotal((s) => s + 1), 1000);
      return () => clearInterval(t);
    }
    const end = new Date(deadlineAt).getTime();
    const warned = new Set<number>();
    const t = setInterval(() => {
      const left = Math.round((end - Date.now()) / 1000);
      setRemaining(left);
      for (const m of WARN_AT_MIN) {
        if (left <= m * 60 && left > m * 60 - 5 && !warned.has(m)) {
          warned.add(m);
          setWarning(`До конца ${m} минут. Проверь, что ответы перенесены в бланк.`);
          setTimeout(() => setWarning(null), 8000);
        }
      }
      if (left <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [deadlineAt]);

  useEffect(() => {
    if (expired) {
      flushTime();
      activeRef.current = null;
      void doSave();
      setFinishOpen(true);
    }
  }, [expired, doSave, flushTime]);

  // ---------- Навигация ----------
  const go = useCallback(
    (i: number) => {
      setIndex(Math.max(0, Math.min(items.length - 1, i)));
      setSheetOpen(false);
      window.scrollTo({ top: 0 });
    },
    [items.length]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
      if (e.key === "Escape") setSheetOpen(false);
      if (finishOpen) return;
      if (e.key === "ArrowRight") go(index + 1);
      if (e.key === "ArrowLeft") go(index - 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [go, index, finishOpen]);

  function setAnswer(problemId: string, value: string) {
    setAnswers((prev) => {
      const next = { ...prev };
      if (value) next[problemId] = value;
      else delete next[problemId];
      return next;
    });
    markDirty();
  }

  function toggleFlag(problemId: string) {
    setFlags((prev) => (prev.includes(problemId) ? prev.filter((f) => f !== problemId) : [...prev, problemId]));
    markDirty();
  }

  async function finish() {
    setFinishing(true);
    setFinishError(null);
    flushTime();
    const timeSpent = Object.fromEntries(Object.entries(timeRef.current).map(([k, v]) => [k, Math.round(v)]));
    try {
      const res = await finishMockAction(mockId, expired ? undefined : { answers, flags, timeSpent });
      if ("error" in res) {
        setFinishError(res.error);
        setFinishing(false);
        return;
      }
      window.location.href = `/student/mock/${mockId}`;
    } catch {
      setFinishError("Нет связи с сервером. Ответы сохранены — попробуй сдать ещё раз.");
      setFinishing(false);
    }
  }

  // ---------- Сводка для бланка ----------
  const part1Items = useMemo(() => items.filter((it) => isPart1(it.n)), [items]);
  const part2Items = useMemo(() => items.filter((it) => !isPart1(it.n)), [items]);
  const answeredPart1 = part1Items.filter((it) => answers[it.problem.id]).length;
  const donePart2 = part2Items.filter((it) => images[it.problem.id] || answers[it.problem.id]).length;
  const unanswered = part1Items.filter((it) => !answers[it.problem.id]);
  const flagged = items.filter((it) => flags.includes(it.problem.id));

  const value = answers[pid] ?? "";
  const formatIssue = isPart1(current.n) ? blankAnswerProblem(value) : null;
  const isFlagged = flags.includes(pid);

  const sheet = (
    <AnswerSheet
      items={items}
      index={index}
      answers={answers}
      images={images}
      flags={flags}
      onPick={go}
    />
  );

  return (
    <div className="min-h-screen bg-paper">
      {/* ---------- Шапка ---------- */}
      <header className="sticky top-0 z-30 border-b border-line-soft bg-white/95 pt-[var(--app-sat)] backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-2 px-3 py-2.5 sm:gap-3 sm:px-5">
          <a
            href="/student/mock"
            aria-label="Выйти к списку пробников (ответы сохранятся)"
            title="Выйти — ответы сохранятся"
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-line bg-white text-ink-soft transition hover:border-pine hover:text-pine"
            onClick={() => void doSave()}
          >
            ←
          </a>
          <div className="min-w-0 flex-1">
            <p className="truncate font-display text-[16px] font-black leading-tight text-ink">Вариант {variant}</p>
            <p className="truncate text-[12px] font-bold text-ink-soft">
              <span className="hidden sm:inline">{modeTitle} · </span>
              <SaveBadge state={save} />
            </p>
          </div>
          {remaining !== null ? (
            <button
              type="button"
              onClick={() => setTimerHidden((h) => !h)}
              aria-label={timerHidden ? "Показать оставшееся время" : "Скрыть таймер"}
              title={timerHidden ? "Показать таймер" : "Скрыть таймер, чтобы не отвлекал"}
              className={`rounded-pill px-3 py-1.5 font-display text-[15px] font-black tabular-nums transition ${
                remaining <= 300
                  ? "bg-coral text-white"
                  : remaining <= 1800
                    ? "bg-amber-light text-amber-text"
                    : "bg-pine-light text-pine-dark"
              }`}
            >
              {timerHidden && remaining > 600 ? "⏱ скрыт" : formatDuration(remaining)}
            </button>
          ) : (
            <span className="rounded-pill bg-paper px-3 py-1.5 font-display text-[15px] font-black tabular-nums text-ink-soft" title="Сколько времени прошло">
              {formatDuration(elapsedTotal)}
            </span>
          )}
          <button type="button" onClick={() => setFinishOpen(true)} className="btn-primary !px-4 !py-2 !text-[12px]">
            Сдать
          </button>
        </div>
        {warning && (
          <div role="status" className="bg-amber-light px-4 py-2 text-center text-[13px] font-bold text-amber-text">
            {warning}
          </div>
        )}
      </header>

      <div className="mx-auto flex max-w-6xl gap-6 px-3 pb-28 pt-4 sm:px-5 lg:pb-10">
        {/* ---------- Задание ---------- */}
        <main className="min-w-0 flex-1">
          {resumedNote && (
            <p role="status" className="mb-3 rounded-2xl bg-pine-light px-4 py-2.5 text-[13px] font-bold text-pine-dark">
              Ты уже начал этот вариант — продолжаем с того места, где остановился.{deadlineAt ? " Таймер шёл всё это время, как на экзамене." : ""}
            </p>
          )}
          <article className="rounded-[22px] border border-line-soft bg-white p-4 sm:p-6">
            <div className="mb-4 flex items-start justify-between gap-3">
              <div>
                <p className="font-display text-3xl font-black leading-none text-ink">
                  {current.n}
                  <span className="ml-2 align-middle text-[13px] font-bold text-ink-soft">
                    из {items.length}
                  </span>
                </p>
                <p className="mt-1.5 text-[12px] font-bold text-ink-soft">
                  {isPart1(current.n)
                    ? "Часть 1 · краткий ответ · 1 балл"
                    : `Часть 2 · развёрнутое решение · до ${maxPointsForSlot(current.n)} ${pointsWord(maxPointsForSlot(current.n))}`}
                </p>
              </div>
              <button
                type="button"
                onClick={() => toggleFlag(pid)}
                aria-pressed={isFlagged}
                className={`flex shrink-0 items-center gap-1.5 rounded-pill border-2 px-3 py-1.5 text-[12px] font-black transition ${
                  isFlagged ? "border-amber bg-amber-light text-amber-text" : "border-line text-ink-soft hover:border-amber"
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill={isFlagged ? "currentColor" : "none"} stroke="currentColor" strokeWidth="2.2" strokeLinejoin="round" aria-hidden>
                  <path d="M6 3h12v18l-6-4-6 4z" />
                </svg>
                {isFlagged ? "Вернусь" : "Вернуться позже"}
              </button>
            </div>

            {current.problem.diagram && (
              <div className="mb-4 h-48 rounded-2xl border border-line-soft bg-paper p-2 sm:h-56">
                <DiagramRenderer spec={current.problem.diagram} />
              </div>
            )}

            <p className="mb-5 whitespace-pre-line text-[16px] font-semibold leading-relaxed text-ink" style={{ textWrap: "pretty" as never }}>
              {current.problem.text}
            </p>

            {isPart1(current.n) ? (
              <div>
                <label htmlFor={`ans-${pid}`} className="mb-1.5 block text-[12px] font-black text-ink-soft">
                  Ответ в бланк
                </label>
                <div className="flex gap-2">
                  <input
                    id={`ans-${pid}`}
                    key={pid}
                    value={value}
                    disabled={expired}
                    onChange={(e) => setAnswer(pid, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        go(index + 1);
                      }
                    }}
                    inputMode="decimal"
                    autoComplete="off"
                    placeholder="Число"
                    aria-invalid={!!formatIssue}
                    aria-describedby={`fmt-${pid}`}
                    className={`min-w-0 flex-1 rounded-2xl border-2 bg-white px-4 py-3 font-mono text-[22px] font-black text-ink outline-none transition placeholder:text-ink-soft/40 focus:border-pine ${
                      formatIssue ? "border-coral" : "border-line"
                    }`}
                  />
                  {/* На iOS в цифровой клавиатуре нет минуса — даём кнопками. */}
                  <button
                    type="button"
                    disabled={expired}
                    onClick={() => setAnswer(pid, value.startsWith("-") ? value.slice(1) : `-${value}`)}
                    className="w-12 shrink-0 rounded-2xl border-2 border-line bg-white font-mono text-xl font-black text-ink-soft transition hover:border-pine"
                    aria-label="Поставить или убрать минус"
                  >
                    ±
                  </button>
                  <button
                    type="button"
                    disabled={expired}
                    onClick={() => !value.includes(",") && setAnswer(pid, `${value || "0"},`)}
                    className="w-12 shrink-0 rounded-2xl border-2 border-line bg-white font-mono text-xl font-black text-ink-soft transition hover:border-pine"
                    aria-label="Десятичная запятая"
                  >
                    ,
                  </button>
                </div>
                <div id={`fmt-${pid}`} className="mt-2 min-h-[2.25rem]">
                  {formatIssue ? (
                    <p className="text-[13px] font-bold text-coral">{formatIssue}</p>
                  ) : value ? (
                    <BlankCells value={value} />
                  ) : (
                    <p className="text-[12px] text-ink-soft">Целое число или десятичная дробь. Enter — следующее задание.</p>
                  )}
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <p className="rounded-2xl bg-paper p-3 text-[13px] leading-relaxed text-ink-soft">
                  Реши на бумаге, как на экзамене. Фото можно приложить сейчас или в самом конце — перед сдачей
                  мы напомним. {hasTeacher ? "Решение проверит твой репетитор по критериям ФИПИ." : "После сдачи сравнишь решение с эталоном и оценишь его по критериям ФИПИ."}
                </p>
                <PhotoSlot
                  mockId={mockId}
                  problemId={pid}
                  n={current.n}
                  image={images[pid] ?? null}
                  onChange={(img) =>
                    setImages((prev) => {
                      const next = { ...prev };
                      if (img) next[pid] = img;
                      else delete next[pid];
                      return next;
                    })
                  }
                />
                {showTextFor[pid] || answers[pid] ? (
                  <textarea
                    value={value}
                    disabled={expired}
                    onChange={(e) => setAnswer(pid, e.target.value)}
                    rows={5}
                    placeholder="Решение или ответ текстом"
                    className="w-full rounded-2xl border-2 border-line bg-white p-3 text-[15px] text-ink outline-none focus:border-pine"
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowTextFor((p) => ({ ...p, [pid]: true }))}
                    className="text-[13px] font-bold text-ink-soft underline decoration-dotted underline-offset-4 hover:text-pine"
                  >
                    Записать ответ текстом
                  </button>
                )}
              </div>
            )}
          </article>

          <div className="mt-4 hidden gap-2 lg:flex">
            <button type="button" onClick={() => go(index - 1)} disabled={index === 0} className="btn-secondary flex-1 disabled:opacity-30">
              ← Предыдущее
            </button>
            {index < items.length - 1 ? (
              <button type="button" onClick={() => go(index + 1)} className="btn-secondary flex-1">
                Следующее →
              </button>
            ) : (
              <button type="button" onClick={() => setFinishOpen(true)} className="btn-primary flex-1">
                Проверить и сдать
              </button>
            )}
          </div>
          <p className="mt-2 hidden text-center text-[12px] text-ink-soft lg:block">Стрелки ← → на клавиатуре тоже листают задания</p>
        </main>

        {/* ---------- Бланк (компьютер) ---------- */}
        <aside className="hidden w-[300px] shrink-0 lg:block">
          <div className="sticky top-24">{sheet}</div>
        </aside>
      </div>

      {/* ---------- Нижняя панель (телефон) ---------- */}
      <nav className="fixed inset-x-0 bottom-0 z-30 flex items-center gap-2 border-t border-line-soft bg-white px-3 pb-[max(10px,var(--app-sab))] pt-2 lg:hidden">
        <button type="button" onClick={() => go(index - 1)} disabled={index === 0} aria-label="Предыдущее задание" className="h-12 w-12 shrink-0 rounded-2xl border-2 border-line text-lg font-black text-ink-soft disabled:opacity-30">
          ←
        </button>
        <button type="button" onClick={() => setSheetOpen(true)} className="h-12 flex-1 rounded-2xl bg-paper text-[14px] font-black text-ink">
          Бланк · {answeredPart1 + donePart2} из {items.length}
          {flagged.length > 0 && <span className="ml-1.5 text-amber-text">· 🔖{flagged.length}</span>}
        </button>
        <button type="button" onClick={() => (index < items.length - 1 ? go(index + 1) : setFinishOpen(true))} aria-label="Следующее задание" className="h-12 w-12 shrink-0 rounded-2xl border-2 border-line text-lg font-black text-ink-soft">
          →
        </button>
      </nav>

      {sheetOpen && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Бланк ответов">
          <button type="button" aria-label="Закрыть бланк" className="absolute inset-0 bg-ink/40" onClick={() => setSheetOpen(false)} />
          <div className="absolute inset-x-0 bottom-0 max-h-[85vh] overflow-y-auto rounded-t-3xl bg-white p-4 pb-[max(1rem,var(--app-sab))]">
            {sheet}
            <button type="button" onClick={() => setSheetOpen(false)} className="btn-secondary mt-3 w-full">
              Закрыть
            </button>
          </div>
        </div>
      )}

      {/* ---------- Сдача работы ---------- */}
      {finishOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label="Сдать работу">
          <button type="button" aria-label="Закрыть" disabled={expired} className="absolute inset-0 bg-ink/50" onClick={() => !expired && setFinishOpen(false)} />
          <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5 sm:rounded-3xl sm:p-6">
            <h2 className="font-display text-xl font-black text-ink">{expired ? "Время вышло" : "Сдать работу?"}</h2>
            <p className="mt-1 text-sm text-ink-soft">
              {expired
                ? hasPart2
                  ? "Ответы первой части сохранены. Сфотографируй решения второй части — на это есть 30 минут — и сдай работу."
                  : "Все сохранённые ответы уйдут на проверку."
                : "После сдачи ответы уже не поменять — сразу покажем баллы и разбор."}
            </p>

            <dl className="mt-4 grid grid-cols-2 gap-2 text-center">
              <div className="rounded-2xl bg-paper p-3">
                <dt className="text-[12px] font-bold text-ink-soft">Часть 1</dt>
                <dd className="font-display text-xl font-black text-ink">
                  {answeredPart1} из {part1Items.length}
                </dd>
              </div>
              {hasPart2 && (
                <div className="rounded-2xl bg-paper p-3">
                  <dt className="text-[12px] font-bold text-ink-soft">Часть 2, с фото или текстом</dt>
                  <dd className="font-display text-xl font-black text-ink">
                    {donePart2} из {part2Items.length}
                  </dd>
                </div>
              )}
            </dl>

            {!expired && unanswered.length > 0 && (
              <div className="mt-4">
                <p className="text-[13px] font-black text-ink">Без ответа</p>
                <ChipRow items={unanswered} onPick={(i) => { setFinishOpen(false); go(i); }} all={items} />
              </div>
            )}
            {!expired && flagged.length > 0 && (
              <div className="mt-3">
                <p className="text-[13px] font-black text-amber-text">Отмечено «вернуться позже»</p>
                <ChipRow items={flagged} onPick={(i) => { setFinishOpen(false); go(i); }} all={items} />
              </div>
            )}

            {hasPart2 && (
              <div className="mt-4 space-y-2">
                <p className="text-[13px] font-black text-ink">Фото решений второй части</p>
                {part2Items.map((it) => (
                  <PhotoSlot
                    key={it.problem.id}
                    compact
                    mockId={mockId}
                    problemId={it.problem.id}
                    n={it.n}
                    image={images[it.problem.id] ?? null}
                    onChange={(img) =>
                      setImages((prev) => {
                        const next = { ...prev };
                        if (img) next[it.problem.id] = img;
                        else delete next[it.problem.id];
                        return next;
                      })
                    }
                  />
                ))}
                <p className="text-[12px] text-ink-soft">
                  Не решал задание — просто оставь без фото.
                </p>
              </div>
            )}

            {finishError && <p className="mt-3 text-sm font-bold text-coral">{finishError}</p>}
            <div className="sticky -bottom-5 -mx-5 mt-5 flex gap-2 border-t border-line-soft bg-white px-5 pb-[max(1.25rem,var(--app-sab))] pt-3 sm:-bottom-6 sm:-mx-6 sm:px-6">
              {!expired && (
                <button type="button" onClick={() => setFinishOpen(false)} className="btn-secondary flex-1">
                  Вернуться
                </button>
              )}
              <button type="button" onClick={() => void finish()} disabled={finishing} className="btn-primary flex-1">
                {finishing ? "Проверяем…" : "Сдать работу"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SaveBadge({ state }: { state: SaveState }) {
  if (state === "error") return <span className="text-coral">нет связи, повторим</span>;
  if (state === "saved") return <span className="text-pine-dark">сохранено</span>;
  return <span>сохраняем…</span>;
}

/** Как ответ будет выглядеть в клеточках бланка №1. */
function BlankCells({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px] font-bold text-ink-soft">В бланке:</span>
      <span className="flex" aria-label={`В бланке: ${value}`}>
        {value.split("").map((ch, i) => (
          <span
            key={i}
            className="-ml-px flex h-8 w-6 items-center justify-center border border-ink/30 bg-white font-mono text-[15px] font-bold text-ink first:ml-0"
          >
            {ch}
          </span>
        ))}
      </span>
    </div>
  );
}

function ChipRow({ items, all, onPick }: { items: RunnerItem[]; all: RunnerItem[]; onPick: (i: number) => void }) {
  return (
    <div className="mt-1.5 flex flex-wrap gap-1.5">
      {items.map((it) => (
        <button
          key={it.problem.id}
          type="button"
          onClick={() => onPick(all.indexOf(it))}
          className="h-9 min-w-9 rounded-xl border-2 border-line px-2 font-display text-[14px] font-black text-ink transition hover:border-pine"
        >
          {it.n}
        </button>
      ))}
    </div>
  );
}

/** Бланк ответов: клетки 1–13 с записанными ответами, 14–20 — отметка о фото. */
function AnswerSheet({
  items,
  index,
  answers,
  images,
  flags,
  onPick,
}: {
  items: RunnerItem[];
  index: number;
  answers: Record<string, string>;
  images: Record<string, string>;
  flags: string[];
  onPick: (i: number) => void;
}) {
  const part1 = items.map((it, i) => ({ it, i })).filter(({ it }) => isPart1(it.n));
  const part2 = items.map((it, i) => ({ it, i })).filter(({ it }) => !isPart1(it.n));
  const cell = (it: RunnerItem, i: number, content: React.ReactNode, filled: boolean) => {
    const flagged = flags.includes(it.problem.id);
    return (
      <li key={it.problem.id}>
        <button
          type="button"
          onClick={() => onPick(i)}
          aria-current={i === index ? "step" : undefined}
          aria-label={`Задание ${it.n}${filled ? ", есть ответ" : ", без ответа"}${flagged ? ", отмечено" : ""}`}
          className={`relative flex h-11 w-full items-center gap-2 rounded-xl border-2 px-2 text-left transition ${
            i === index ? "border-pine" : filled ? "border-transparent bg-pine-light" : "border-line-soft bg-white hover:border-line"
          }`}
        >
          <span className="w-5 shrink-0 font-display text-[13px] font-black text-ink-soft">{it.n}</span>
          <span className="min-w-0 flex-1 truncate font-mono text-[14px] font-bold text-ink">{content}</span>
          {flagged && <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-amber" aria-hidden />}
        </button>
      </li>
    );
  };
  return (
    <div className="rounded-[22px] border border-line-soft bg-white p-3.5">
      <p className="mb-2 font-display text-[15px] font-black text-ink">Бланк ответов №1</p>
      <ul className="grid grid-cols-2 gap-1.5">
        {part1.map(({ it, i }) => cell(it, i, answers[it.problem.id] ?? "", !!answers[it.problem.id]))}
      </ul>
      {part2.length > 0 && (
        <>
          <p className="mb-2 mt-4 font-display text-[15px] font-black text-ink">Часть 2</p>
          <ul className="grid grid-cols-2 gap-1.5">
            {part2.map(({ it, i }) => {
              const has = !!images[it.problem.id] || !!answers[it.problem.id];
              return cell(it, i, <span className="font-sans text-[12px]">{images[it.problem.id] ? "📷 фото" : answers[it.problem.id] ? "текст" : ""}</span>, has);
            })}
          </ul>
        </>
      )}
      <p className="mt-3 flex items-center gap-1.5 text-[11px] font-bold text-ink-soft">
        <span className="h-2.5 w-2.5 rounded-full bg-amber" aria-hidden /> вернуться позже
      </p>
    </div>
  );
}
