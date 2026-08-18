import Mascot from "./Mascot";
import { IconMap, IconRepeat, IconClipboard, IconBook } from "./icons";

export default function StudentSidebar({
  active,
  reviewCount,
  homeworkCount,
  homeworkLabel,
  energy,
  energyMax,
  isPro,
}: {
  active: "path" | "review" | "homework" | "mistakes";
  reviewCount: number;
  homeworkCount: number;
  homeworkLabel: string;
  energy: number | null;
  energyMax: number;
  isPro: boolean;
}) {
  const items = [
    { key: "path", label: "Путь обучения", href: "/student", icon: IconMap, badge: 0 },
    { key: "review", label: "Повторение", href: "/student/review", icon: IconRepeat, badge: reviewCount },
    { key: "homework", label: homeworkLabel, href: "/student/homework", icon: IconClipboard, badge: homeworkCount },
    { key: "mistakes", label: "Мои ошибки", href: "/student/homework", icon: IconBook, badge: 0 },
  ] as const;

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-[236px] flex-col bg-pine-dark px-4 py-5 lg:flex">
      <a href="/student" className="mb-6 flex items-center gap-2.5 px-1">
        <Mascot mood="happy" size={36} float={false} />
        <div>
          <p className="font-display text-[15px] font-black leading-tight text-white">Планиметрика</p>
          <p className="text-[10px] font-bold uppercase tracking-wide text-white/50">ЕГЭ · Профиль</p>
        </div>
      </a>

      <nav className="flex flex-col gap-1">
        {items.map((item) => {
          const Icon = item.icon;
          const isActive = item.key === active;
          return (
            <a
              key={item.key}
              href={item.href}
              className={`flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-[13.5px] font-bold transition ${
                isActive ? "bg-white text-pine-dark" : "text-white/80 hover:bg-white/10"
              }`}
            >
              <Icon className="h-[18px] w-[18px] shrink-0" />
              <span className="flex-1 truncate">{item.label}</span>
              {item.badge > 0 && (
                <span
                  className={`rounded-pill px-1.5 py-0.5 text-[10px] font-black ${
                    isActive ? "bg-violet text-white" : "bg-white/15 text-white"
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </a>
          );
        })}
      </nav>

      <div className="mt-auto space-y-3 pt-4">
        {energy !== null && (
          <div className="rounded-2xl bg-white/10 p-3.5">
            <p className="text-[11px] font-black uppercase tracking-wide text-white/60">Энергия</p>
            <p className="mt-1 font-display text-lg font-black text-white">
              {energy} / {energyMax}
            </p>
            <div className="mt-2 flex gap-1">
              {Array.from({ length: energyMax }).map((_, i) => (
                <span
                  key={i}
                  className={`h-1.5 flex-1 rounded-pill ${i < energy ? "bg-teal" : "bg-white/15"}`}
                />
              ))}
            </div>
          </div>
        )}
        {!isPro && (
          <a
            href="/student/upgrade"
            className="block rounded-2xl bg-gradient-to-br from-amber to-coral p-3.5 transition hover:brightness-105"
          >
            <p className="text-[11px] font-black uppercase tracking-wide text-white/80">PRO</p>
            <p className="mt-1 text-[13px] font-extrabold leading-snug text-white">
              Без лимита энергии и все 6 глав
            </p>
          </a>
        )}
      </div>
    </aside>
  );
}
