"use client";

import { useEffect } from "react";

import { TOPIC_COOKIE } from "@/lib/topic-cookie";

/**
 * Запоминает выбранный предмет. Без этого вкладка «Путь» (ссылка на
 * /student без ?topic=) после Профиля/Домашки/Ошибок всегда открывала
 * первый предмет — Планиметрию, а не тот, который ученик выбрал.
 * Cookie, а не localStorage: значение нужно серверу при рендере.
 */
export default function RememberTopic({ topicId }: { topicId: string }) {
  useEffect(() => {
    document.cookie = `${TOPIC_COOKIE}=${encodeURIComponent(topicId)}; path=/; max-age=${60 * 60 * 24 * 365}; samesite=lax`;
  }, [topicId]);
  return null;
}
