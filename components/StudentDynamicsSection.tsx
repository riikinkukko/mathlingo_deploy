import { MockScore } from "@/lib/types";
import type { WeeklyStat } from "@/lib/queries";
import StudentDynamics, { DynamicsWeek, DynamicsMock } from "./StudentDynamics";

// Серверная часть блока «Динамика»: готовит подписи дат и позиции точек,
// клиентская часть (StudentDynamics) только рисует и обрабатывает наведение.

const MONTH_SHORT = ["янв", "фев", "мар", "апр", "мая", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTH_GEN = [
  "января", "февраля", "марта", "апреля", "мая", "июня",
  "июля", "августа", "сентября", "октября", "ноября", "декабря",
];

function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m: m - 1, d };
}

function shortLabel(iso: string): string {
  const { m, d } = parts(iso);
  return `${d} ${MONTH_SHORT[m]}`;
}

function fullLabel(iso: string): string {
  const { m, d } = parts(iso);
  return `${d} ${MONTH_GEN[m]}`;
}

/** "14–20 сентября" или "28 сентября – 4 октября". */
function weekRange(mondayIso: string): string {
  const start = new Date(`${mondayIso}T12:00:00Z`);
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 6);
  const s = { d: start.getUTCDate(), m: start.getUTCMonth() };
  const e = { d: end.getUTCDate(), m: end.getUTCMonth() };
  return s.m === e.m
    ? `${s.d}–${e.d} ${MONTH_GEN[e.m]}`
    : `${s.d} ${MONTH_GEN[s.m]} – ${e.d} ${MONTH_GEN[e.m]}`;
}

export default function StudentDynamicsSection({
  weekly,
  mocks,
  targetScore,
  readOnly = false,
}: {
  weekly: WeeklyStat[];
  mocks: MockScore[]; // новые сверху — как отдаёт getMockScores
  targetScore?: number;
  /** для родителя: без подсказок репетитору и БЕЗ комментариев к пробникам */
  readOnly?: boolean;
}) {
  const weeks: DynamicsWeek[] = weekly.map((w) => ({
    axisLabel: shortLabel(w.week),
    rangeLabel: weekRange(w.week),
    solved: w.solved,
    accuracy: w.accuracy,
    attempts: w.attempts,
  }));

  // Пробники по времени слева направо; X пропорционален дате, чтобы
  // промежутки между пробниками были честными. Поля по 4% по краям.
  const chrono = [...mocks].sort((a, b) => a.takenAt.localeCompare(b.takenAt) || a.createdAt.localeCompare(b.createdAt));
  const t = chrono.map((m) => new Date(`${m.takenAt}T12:00:00Z`).getTime());
  const t0 = t[0];
  const span = t.length ? t[t.length - 1] - t0 : 0;
  const mockData: DynamicsMock[] = chrono.map((m, i) => ({
    x: span > 0 ? 0.04 + (0.92 * (t[i] - t0)) / span : chrono.length > 1 ? 0.04 + (0.92 * i) / (chrono.length - 1) : 0.5,
    score: m.score,
    axisLabel: shortLabel(m.takenAt),
    dateLabel: fullLabel(m.takenAt),
    // Комментарий к пробнику репетитор писал для себя — родителю не показываем.
    note: readOnly ? null : m.note,
  }));

  return <StudentDynamics weeks={weeks} mocks={mockData} targetScore={targetScore} readOnly={readOnly} />;
}
