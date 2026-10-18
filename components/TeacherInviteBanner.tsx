"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { respondTeacherInviteAction } from "@/app/actions";

export interface TeacherInviteBannerItem {
  id: string;
  teacherName: string;
}

/**
 * «Репетитор X приглашает тебя заниматься вместе — Принять / Отклонить».
 * Показывается самостоятельному ученику на главной и в профиле. Права
 * проверяет сервер: принять или отклонить можно только своё приглашение.
 */
export default function TeacherInviteBanner({ invites }: { invites: TeacherInviteBannerItem[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [accepted, setAccepted] = useState<string | null>(null);
  const [hidden, setHidden] = useState<string[]>([]);
  const visible = invites.filter((i) => !hidden.includes(i.id));
  const invite = visible[0];

  if (accepted) {
    return (
      <div className="rounded-[20px] border-2 border-pine-light bg-pine-light/60 p-4" role="status">
        <p className="font-display text-[16px] font-black text-pine-darker">Готово! Теперь ты занимаешься с репетитором {accepted}</p>
        <p className="mt-1 text-[13px] text-ink-soft">Весь твой прогресс сохранился. Домашка и занятия от репетитора появятся здесь.</p>
      </div>
    );
  }
  if (!invite) return null;

  function respond(accept: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await respondTeacherInviteAction(invite.id, accept);
      if ("error" in res) {
        setError(res.error ?? "Не получилось — попробуй ещё раз");
        return;
      }
      if (accept) {
        // Страницу перерисует revalidatePath из экшена; баннер остаётся и показывает «Готово».
        setAccepted(invite.teacherName);
      } else {
        setHidden((h) => [...h, invite.id]);
        router.refresh();
      }
    });
  }

  return (
    <section className="rounded-[20px] border-2 border-violet-border bg-violet-light/60 p-4" aria-label="Приглашение от репетитора">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-[14px] bg-white text-[20px]" aria-hidden>
          ✉
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[16px] font-black leading-snug text-ink">
            Репетитор {invite.teacherName} приглашает тебя заниматься вместе
          </p>
          <p className="mt-1 text-[13px] text-ink-soft">
            Репетитор будет видеть твой прогресс, задавать домашку и проверять решения. Всё, что ты уже решил, сохранится.
          </p>
        </div>
      </div>
      {error && <p className="mt-2 text-[13px] font-bold text-coral-text">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button type="button" onClick={() => respond(true)} disabled={pending} className="btn-primary flex-1 !normal-case !tracking-normal !text-[15px]">
          Принять
        </button>
        <button type="button" onClick={() => respond(false)} disabled={pending} className="btn-secondary flex-1 !normal-case !tracking-normal !text-[15px]">
          Отклонить
        </button>
      </div>
      {visible.length > 1 && (
        <p className="mt-2 text-[12px] text-ink-soft">Ещё приглашений: {visible.length - 1}</p>
      )}
    </section>
  );
}
