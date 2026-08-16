/**
 * Достижения — по мотивам вкладки профиля Duolingo (тиры с порогами), но
 * без новой инфраструктуры: всё считается из уже существующих данных
 * (попытки, streak, прогресс по навыкам). Никакой отдельной таблицы
 * "earned achievements" нет — статус пересчитывается каждый раз при
 * заходе на страницу. Дешёво, зато не может рассинхронизироваться с
 * реальным прогрессом.
 */

export interface AchievementDef {
  id: string;
  title: string;
  icon: string; // эмодзи — без новых SVG-иконок для первой версии
  description: string;
  tiers: number[]; // пороги по возрастанию, напр. [10, 50, 100, 250, 500]
}

export const ACHIEVEMENTS: AchievementDef[] = [
  {
    id: "problems",
    title: "Задачи решены",
    icon: "📐",
    description: "Количество верно решённых задач за всё время",
    tiers: [10, 50, 100, 250, 500],
  },
  {
    id: "streak",
    title: "Дней подряд",
    icon: "🔥",
    description: "Самая длинная серия дней с решённой задачей",
    tiers: [3, 7, 14, 30, 100],
  },
  {
    id: "skills",
    title: "Навыков пройдено",
    icon: "🎯",
    description: "Навыки, пройденные на 100%",
    tiers: [5, 10, 20, 29],
  },
  {
    id: "perfect",
    title: "Идеально, без единой ошибки",
    icon: "⭐",
    description: "Навыки, пройденные без единого неверного ответа",
    tiers: [1, 3, 5, 10],
  },
  {
    id: "detailed",
    title: "Развёрнутых решений принято",
    icon: "✍️",
    description: "Задачи с развёрнутым ответом, одобренные (или принятые самопроверкой)",
    tiers: [1, 5, 10, 20],
  },
  {
    id: "reviews",
    title: "Повторений пройдено",
    icon: "🧠",
    description: "Задачи, успешно повторённые через интервальное повторение",
    tiers: [5, 20, 50],
  },
  {
    id: "chapters",
    title: "Глав пройдено",
    icon: "🏆",
    description: "Главы, пройденные полностью",
    tiers: [1, 3, 6],
  },
];

export interface AchievementStats {
  problems: number;
  streak: number;
  skills: number;
  perfect: number;
  detailed: number;
  reviews: number;
  chapters: number;
}

export interface AchievementProgress {
  def: AchievementDef;
  value: number;
  tierIndex: number; // -1 — ещё ни один порог не достигнут
  nextThreshold: number | null; // null — максимальный тир уже достигнут
  progressPct: number; // до следующего порога, 0..100
}

export function computeAchievementProgress(stats: AchievementStats): AchievementProgress[] {
  return ACHIEVEMENTS.map((def) => {
    const value = stats[def.id as keyof AchievementStats] ?? 0;
    let tierIndex = -1;
    for (let i = 0; i < def.tiers.length; i++) {
      if (value >= def.tiers[i]) tierIndex = i;
    }
    const next = def.tiers[tierIndex + 1] ?? null;
    const prevThreshold = tierIndex >= 0 ? def.tiers[tierIndex] : 0;
    const progressPct = next
      ? Math.round(((value - prevThreshold) / (next - prevThreshold)) * 100)
      : 100;
    return { def, value, tierIndex, nextThreshold: next, progressPct: Math.min(100, Math.max(0, progressPct)) };
  });
}
