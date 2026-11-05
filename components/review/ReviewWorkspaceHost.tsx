"use client";

import { useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import type { ReviewItem } from "@/lib/review-item";

const ReviewWorkspace = dynamic(() => import("./ReviewWorkspace"), { ssr: false });

// Проверка живёт в оболочке кабинета, а не в карточке работы: после каждой
// оценки сервер обновляет страницу, карточка исчезает — а проверка должна
// остаться открытой и перейти к следующей работе.
type State = { items: ReviewItem[]; start: number; key: number } | null;
let state: State = null;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

/** Открыть полноэкранную проверку: работы items, начиная с startId. */
export function openReview(items: ReviewItem[], startId?: string) {
  if (!items.length) return;
  const i = startId ? items.findIndex((r) => r.attemptId === startId) : 0;
  state = { items, start: Math.max(0, i), key: Date.now() };
  emit();
}

function subscribe(l: () => void) {
  listeners.add(l);
  return () => listeners.delete(l);
}

export default function ReviewWorkspaceHost() {
  const router = useRouter();
  const s = useSyncExternalStore(subscribe, () => state, () => null);
  if (!s) return null;
  return (
    <ReviewWorkspace
      key={s.key}
      items={s.items}
      startIndex={s.start}
      onClose={(checked) => {
        state = null;
        emit();
        if (checked > 0) router.refresh();
      }}
    />
  );
}
