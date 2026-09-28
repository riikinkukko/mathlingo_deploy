"use client";

import LineChart, { LinePoint } from "./charts/LineChart";
import ColumnChart from "./charts/ColumnChart";
import { ChartTable } from "./charts/chartKit";
import { pluralRu } from "@/lib/pluralize";

// Все подписи дат приходят готовыми с сервера (StudentDynamicsSection), чтобы
// текст на сервере и в браузере совпадал и не было ошибок гидрации.

export interface DynamicsWeek {
  axisLabel: string; // "14 сен"
  rangeLabel: string; // "14–20 сентября"
  solved: number;
  accuracy: number | null;
  attempts: number;
}

export interface DynamicsMock {
  x: number; // 0..1 по времени
  score: number;
  axisLabel: string;
  dateLabel: string;
  note: string | null;
}

const TASKS: [string, string, string] = ["задача", "задачи", "задач"];

function Card({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <div className="card p-4">
      <p className="text-sm font-bold text-ink">{title}</p>
      {subtitle && <p className="mb-2 text-[11px] text-ink-soft">{subtitle}</p>}
      {children}
    </div>
  );
}

export default function StudentDynamics({
  weeks,
  mocks,
  targetScore,
}: {
  weeks: DynamicsWeek[];
  mocks: DynamicsMock[];
  targetScore?: number;
}) {
  const hasActivity = weeks.some((w) => w.attempts > 0);

  // Шкала пробников: от «чуть ниже минимума» до 100, круглые деления.
  const lows = [...mocks.map((m) => m.score), ...(targetScore ? [targetScore] : [])];
  const yMin = Math.max(0, Math.floor((Math.min(...lows) - 10) / 10) * 10);
  const tickStep = 100 - yMin > 50 ? 20 : 10;
  const mockTicks: number[] = [];
  for (let t = yMin; t <= 100; t += tickStep) mockTicks.push(t);
  if (mockTicks[mockTicks.length - 1] !== 100) mockTicks.push(100);

  const mockPoints: LinePoint[] = mocks.map((m) => ({
    x: m.x,
    y: m.score,
    axisLabel: m.axisLabel,
    tooltipLabel: `пробник ${m.dateLabel}`,
    detail: m.note ?? undefined,
  }));

  const accuracyPoints: LinePoint[] = weeks.map((w, i) => ({
    x: (i + 0.5) / weeks.length,
    y: w.accuracy,
    axisLabel: w.axisLabel,
    tooltipLabel: `неделя ${w.rangeLabel}`,
    detail: w.attempts > 0 ? `${w.attempts} ${pluralRu(w.attempts, ["ответ", "ответа", "ответов"])}` : undefined,
  }));

  return (
    <div className="space-y-3">
      <Card
        title="Пробники ЕГЭ, баллы"
        subtitle={targetScore ? `Пунктир — цель ${targetScore}` : "Цель не задана — её можно указать в разделе «Цель и пробники»"}
      >
        {mocks.length >= 2 ? (
          <>
            <LineChart
              points={mockPoints}
              yMin={yMin}
              yMax={100}
              yTicks={mockTicks}
              reference={targetScore ? { value: targetScore, label: `цель ${targetScore}` } : undefined}
              ariaLabel={`Баллы за пробники: ${mocks.map((m) => `${m.dateLabel} — ${m.score}`).join(", ")}`}
            />
            <ChartTable
              caption="Результаты пробников"
              columns={["Дата", "Балл"]}
              rows={mocks.map((m) => ({ label: m.dateLabel, value: String(m.score) }))}
            />
          </>
        ) : (
          <p className="py-6 text-center text-sm text-ink-soft">
            {mocks.length === 1
              ? `Пока один пробник (${mocks[0].score}). Запишите ещё один — появится график.`
              : "Запишите хотя бы два пробника — появится график движения к цели."}
          </p>
        )}
      </Card>

      {hasActivity ? (
        <>
          <Card title="Решено задач по неделям" subtitle="Разные задачи, решённые верно, за последние 12 недель">
            <ColumnChart
              columns={weeks.map((w) => ({
                value: w.solved,
                axisLabel: w.axisLabel,
                tooltipLabel: `неделя ${w.rangeLabel}`,
              }))}
              unit={(n) => `${n} ${pluralRu(n, TASKS)}`}
              ariaLabel={`Решено задач по неделям: ${weeks.map((w) => `${w.rangeLabel} — ${w.solved}`).join(", ")}`}
            />
            <ChartTable
              caption="Решено задач по неделям"
              columns={["Неделя", "Задач"]}
              rows={weeks.map((w) => ({ label: w.rangeLabel, value: String(w.solved) }))}
            />
          </Card>

          <Card
            title="Точность ответов по неделям, %"
            subtitle="Доля верных ответов; разрыв линии — неделя без занятий"
          >
            <LineChart
              points={accuracyPoints}
              yMin={0}
              yMax={100}
              yTicks={[0, 50, 100]}
              valueSuffix="%"
              ariaLabel={`Точность по неделям: ${weeks
                .filter((w) => w.accuracy !== null)
                .map((w) => `${w.rangeLabel} — ${w.accuracy}%`)
                .join(", ")}`}
            />
            <ChartTable
              caption="Точность ответов по неделям"
              columns={["Неделя", "Точность"]}
              rows={weeks.map((w) => ({
                label: w.rangeLabel,
                value: w.accuracy === null ? "—" : `${w.accuracy}%`,
              }))}
            />
          </Card>
        </>
      ) : (
        <div className="card p-6 text-center text-sm text-ink-soft">
          За последние 12 недель ученик не решал задач на платформе — графики активности появятся, когда начнёт.
        </div>
      )}
    </div>
  );
}
