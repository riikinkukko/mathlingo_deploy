/**
 * Единая мобильная шапка для всех кабинетов (ученик, репетитор, родитель).
 *
 * Почему шапка «съезжала»: у каждого раздела была своя шапка разной высоты
 * (на главной ученика 97 px, на остальных 61 px), а отступ под системную
 * панель Android приходил от плагина safe-area уже ПОСЛЕ отрисовки — шапка
 * дёргалась вниз. Теперь:
 *  • высота строки всегда 56 px (h-14), что бы ни лежало слева и справа;
 *  • отступ сверху — var(--app-sat) (globals.css), а сохранённое с прошлого
 *    запуска значение подставляется скриптом в <head> ещё до первой
 *    отрисовки (app/layout.tsx + CapacitorBootstrap) — прыжка нет;
 *  • шапка закреплена (sticky) на всех экранах одинаково.
 */
export default function MobileAppBar({
  left,
  right,
  className = "",
}: {
  left: React.ReactNode;
  right?: React.ReactNode;
  className?: string;
}) {
  return (
    <header
      className={`sticky top-0 z-30 border-b border-line-soft bg-paper pt-[var(--app-sat)] lg:hidden ${className}`}
    >
      <div className="flex h-14 items-center gap-2 pl-4 pr-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">{left}</div>
        {right && <div className="flex shrink-0 items-center gap-1.5">{right}</div>}
      </div>
    </header>
  );
}

/** Заголовок раздела в шапке: маскот + название, обрезается многоточием. */
export function AppBarTitle({ href, title, mascot }: { href: string; title: string; mascot: React.ReactNode }) {
  return (
    <a href={href} className="flex min-w-0 items-center gap-2.5">
      <span className="shrink-0">{mascot}</span>
      <span className="truncate font-display text-[17px] font-black text-ink">{title}</span>
    </a>
  );
}
