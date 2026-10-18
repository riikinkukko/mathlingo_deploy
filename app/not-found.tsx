import type { Metadata } from "next";
import { cookies } from "next/headers";
import Mascot from "@/components/Mascot";
import { getSessionUser } from "@/lib/auth";

export const metadata: Metadata = {
  title: "Страница не найдена — Планиметрика",
  robots: { index: false },
};

const CABINET: Record<string, { href: string; label: string }> = {
  TEACHER: { href: "/teacher", label: "В кабинет репетитора" },
  STUDENT: { href: "/student", label: "К занятиям" },
  PARENT: { href: "/parent", label: "В кабинет родителя" },
};

/** Брендированная 404 вместо английской заглушки Next.js. */
export default async function NotFound() {
  // Без cookie сессии не ходим в БД: 404 видят и боты, и случайные адреса.
  let role: string | undefined;
  if ((await cookies()).getAll().length > 0) {
    try {
      role = (await getSessionUser())?.role;
    } catch {
      role = undefined;
    }
  }
  const cabinet = role ? CABINET[role] : undefined;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-paper px-6 text-center">
      <Mascot mood="thinking" size={104} float={false} />
      <p className="mt-5 font-display text-[44px] font-black leading-none text-pine-dark">404</p>
      <h1 className="mt-2 font-display text-2xl font-black text-ink">Такой страницы нет</h1>
      <p className="mt-2 max-w-sm text-sm text-ink-soft">
        Возможно, ссылка устарела или в адресе опечатка. Ничего не потерялось — всё остальное на месте.
      </p>
      <div className="mt-6 flex flex-wrap justify-center gap-3">
        {cabinet ? (
          <>
            <a href={cabinet.href} className="btn-primary">
              {cabinet.label}
            </a>
            <a href="/" className="btn-secondary">
              На главную
            </a>
          </>
        ) : (
          <>
            <a href="/" className="btn-primary">
              На главную
            </a>
            <a href="/login" className="btn-secondary">
              Войти
            </a>
          </>
        )}
      </div>
    </div>
  );
}
