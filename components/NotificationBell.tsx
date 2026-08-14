"use client";

import { useState, useTransition, useEffect, useRef } from "react";
import { markNotificationReadAction, markAllNotificationsReadAction } from "@/app/actions";
import { Notification } from "@/lib/types";
import { IconBell } from "./icons";

function timeAgo(iso: string) {
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "только что";
  if (mins < 60) return `${mins} мин назад`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} ч назад`;
  const days = Math.floor(hours / 24);
  return `${days} дн назад`;
}

export default function NotificationBell({
  initialNotifications,
  initialUnread,
}: {
  initialNotifications: Notification[];
  initialUnread: number;
}) {
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState(initialNotifications);
  const [unread, setUnread] = useState(initialUnread);
  const [, startTransition] = useTransition();
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleOpenItem(n: Notification) {
    if (!n.read) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read: true } : x)));
      setUnread((u) => Math.max(0, u - 1));
      startTransition(() => {
        markNotificationReadAction(n.id);
      });
    }
    window.location.href = n.link;
  }

  function handleMarkAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read: true })));
    setUnread(0);
    startTransition(() => {
      markAllNotificationsReadAction();
    });
  }

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="relative flex h-9 w-9 items-center justify-center rounded-full border-2 border-line text-ink-soft transition hover:border-pine hover:text-pine"
        aria-label="Уведомления"
      >
        <IconBell className="h-4 w-4" />
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-coral px-1 text-[10px] font-extrabold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 top-12 z-30 w-80 max-w-[90vw] animate-scale-in rounded-2xl border border-line bg-white p-2 shadow-soft">
          <div className="mb-1 flex items-center justify-between px-2 py-1.5">
            <p className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">Уведомления</p>
            {unread > 0 && (
              <button onClick={handleMarkAll} className="text-xs font-bold text-pine hover:underline">
                Прочитать всё
              </button>
            )}
          </div>
          <div className="max-h-96 overflow-y-auto">
            {items.length === 0 && (
              <p className="px-2 py-6 text-center text-sm text-ink-soft">Пока пусто</p>
            )}
            {items.map((n) => (
              <button
                key={n.id}
                onClick={() => handleOpenItem(n)}
                className={`block w-full rounded-xl px-2.5 py-2.5 text-left text-sm transition hover:bg-pine-light/30 ${
                  !n.read ? "bg-pine-light/40" : ""
                }`}
              >
                <div className="flex items-start gap-2">
                  {!n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pine" />}
                  {n.read && <span className="mt-1.5 h-1.5 w-1.5 shrink-0" />}
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-ink">{n.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-ink-soft">{n.body}</p>
                    <p className="mt-1 text-[11px] text-ink-soft/70">{timeAgo(n.createdAt)}</p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
