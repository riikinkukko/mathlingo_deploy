"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { YM_ID, ymGoal, ymHit } from "@/lib/ym";

/**
 * Яндекс.Метрика: счётчик + отслеживание переходов между страницами (SPA) +
 * цели воронки, которые нельзя привязать просто к URL.
 *
 * Всё включается только если задан NEXT_PUBLIC_YM_COUNTER_ID — иначе компонент
 * ничего не делает (локально и до настройки счётчика).
 *
 * Часть целей приходит через query-параметр от серверных экшенов, которые
 * делают redirect и не могут сами дёрнуть клиентский reachGoal:
 *   ?ym=register  — после успешной регистрации
 *   ?paid=1       — возврат с оплаты (цель payment_success)
 * Параметр после срабатывания убираем из URL, чтобы цель не повторялась при
 * обновлении страницы.
 */
export default function Analytics() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Инициализация счётчика — один раз.
  useEffect(() => {
    if (!YM_ID) return;
    const w = window as unknown as { ym?: (...a: unknown[]) => void; __ymInit?: boolean };
    if (w.__ymInit) return;
    w.__ymInit = true;
    // Стандартный инициализатор Метрики.
    /* eslint-disable */
    (function (m: any, e: any, t: any, r: any, i: any) {
      m[i] = m[i] || function () { (m[i].a = m[i].a || []).push(arguments); };
      m[i].l = 1 * (new Date() as any);
      for (let j = 0; j < e.scripts.length; j++) { if (e.scripts[j].src === r) return; }
      const k = e.createElement(t), a = e.getElementsByTagName(t)[0];
      k.async = 1; k.src = r; a.parentNode.insertBefore(k, a);
    })(window, document, "script", "https://mc.yandex.ru/metrika/tag.js", "ym");
    /* eslint-enable */
    (window as any).ym(YM_ID, "init", {
      clickmap: true,
      trackLinks: true,
      accurateTrackBounce: true,
      webvisor: false,
    });
  }, []);

  // Просмотр страницы при каждом переходе (в SPA обычной перезагрузки нет).
  // Первый показ страницы Метрика считает сама при init — поэтому первый
  // прогон эффекта пропускаем, иначе входная страница засчиталась бы дважды.
  const firstHit = useRef(true);
  useEffect(() => {
    if (!YM_ID) return;
    if (firstHit.current) {
      firstHit.current = false;
      return;
    }
    const url = pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
    ymHit(url);
  }, [pathname, searchParams]);

  // Цели из query-параметров + чистка URL.
  useEffect(() => {
    if (!YM_ID) return;
    const ym = searchParams.get("ym");
    const paid = searchParams.get("paid");
    let changed = false;
    const next = new URLSearchParams(searchParams.toString());
    if (ym) { ymGoal(ym); next.delete("ym"); changed = true; }
    if (paid === "1") { ymGoal("payment_success"); }
    if (changed) {
      const qs = next.toString();
      router.replace(pathname + (qs ? `?${qs}` : ""), { scroll: false });
    }
  }, [pathname, searchParams, router]);

  return null;
}
