import { getSessionUser } from "@/lib/auth";
import {
  getHomeworksForStudent,
  homeworkStatus,
  computeXp,
  computeStreak,
  isStandaloneStudent,
  isEffectivelyPro,
} from "@/lib/queries";
import AppHeader from "@/components/AppHeader";
import FractionBadge from "@/components/FractionBadge";
import Mascot from "@/components/Mascot";
import { IconMap, IconClipboard, IconCheck, IconCrown } from "@/components/icons";

const KIND_META: Record<string, { label: string; bg: string }> = {
  homework: { label: "Домашнее задание", bg: "bg-amber" },
  test: { label: "Контрольная работа", bg: "bg-violet" },
  exam: { label: "Пробный экзамен", bg: "bg-coral" },
};

export default async function HomeworkListPage() {
  const user = (await getSessionUser())!;
  const xp = await computeXp(user.id);
  const streak = await computeStreak(user.id);
  const homeworks = await getHomeworksForStudent(user.id);
  const statusPairs = await Promise.all(homeworks.map(async (hw) => [hw.id, await homeworkStatus(hw, user.id)] as const));
  const statusById = new Map(statusPairs);

  const standalone = isStandaloneStudent(user);
  const isPro = standalone && isEffectivelyPro(user);
  const tabLabel = standalone ? "Пробники" : "Домашнее задание";

  return (
    <div className="min-h-screen pb-16">
      <AppHeader
        user={user}
        gamification={{ xp, streak }}
        subTabs={[
          { label: "Путь обучения", href: "/student", active: false, icon: <IconMap className="h-4 w-4" /> },
          { label: tabLabel, href: "/student/homework", active: true, icon: <IconClipboard className="h-4 w-4" /> },
        ]}
      />

      <main className="mx-auto max-w-3xl px-4 pt-6">
        {standalone && !isPro ? (
          // Free-самостоятельный: своей домашки нет и авторские пробники
          // не открыты — вместо пустого списка честный апсейл на Pro.
          <div className="card p-8 text-center">
            <Mascot mood="hint" size={84} className="mx-auto mb-4" />
            <p className="mb-1 flex items-center justify-center gap-1.5 font-display text-lg font-black text-ink">
              <IconCrown className="h-5 w-5 text-amber" />
              Пробники — только на Pro
            </p>
            <p className="mx-auto mb-5 max-w-sm text-sm text-ink-soft">
              Пользуйся Pro-версией, чтобы решать авторские варианты пробных экзаменов
              — составлены так же тщательно, как обычные задачи, но по формату ближе
              к настоящему ЕГЭ.
            </p>
            <a href="/student/upgrade" className="btn-primary !bg-amber inline-block !text-sm">
              Открыть Pro
            </a>
          </div>
        ) : homeworks.length === 0 ? (
          <div className="card p-10 text-center">
            <Mascot mood="idle" size={72} className="mx-auto mb-3" />
            <p className="font-display text-lg font-black text-ink">
              {standalone ? "Пока нет доступных пробников" : "Пока нет заданий"}
            </p>
            <p className="mt-1 text-sm text-ink-soft">
              {standalone
                ? "Загляни попозже — авторские пробники добавляются постепенно."
                : "Домашка, контрольные и пробники от репетитора появятся здесь."}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {homeworks.map((hw) => {
              const st = statusById.get(hw.id)!;
              const meta = KIND_META[hw.kind] ?? KIND_META.homework;
              const due = new Date(hw.dueDate).toLocaleDateString("ru-RU", {
                day: "numeric",
                month: "long",
              });
              return (
                <a
                  key={hw.id}
                  href={`/student/homework/${hw.id}`}
                  className="card flex items-center gap-4 p-4 transition hover:-translate-y-0.5 hover:shadow-lg"
                >
                  <span
                    className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white ${
                      st.complete ? "bg-pine" : st.overdue ? "bg-coral" : meta.bg
                    }`}
                  >
                    <IconClipboard className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="mb-0.5 text-[10px] font-extrabold uppercase tracking-wide text-ink-soft">
                      {meta.label}
                      {hw.audience === "pro_standalone" && " · авторский"}
                    </p>
                    <p className="truncate font-display text-base font-black text-ink">{hw.title}</p>
                    <p
                      className={`mt-0.5 text-xs font-bold ${
                        st.overdue ? "text-coral" : st.complete ? "text-pine" : "text-ink-soft"
                      }`}
                    >
                      {st.complete ? "Выполнено" : st.overdue ? "Просрочено · срок был " : "Сдать до "}
                      {!st.complete && due}
                    </p>
                  </div>
                  {st.complete ? (
                    <IconCheck className="h-6 w-6 shrink-0 text-pine" />
                  ) : (
                    <FractionBadge solved={st.done} total={st.total} size="sm" />
                  )}
                </a>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}
