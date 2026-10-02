"use client";

import { useEffect } from "react";

/**
 * Подключается один раз в корневой layout — весь код внутри работает
 * ТОЛЬКО когда приложение реально запущено внутри нативной оболочки
 * Capacitor (Capacitor.isNativePlatform() === true). В обычном браузере
 * (веб-версия сайта) просто ничего не делает — динамический импорт
 * @capacitor/core в браузере тоже безопасен, никаких ошибок не бросает.
 */
export default function CapacitorBootstrap() {
  useEffect(() => {
    let cleanup: (() => void) | undefined;

    (async () => {
      const { Capacitor } = await import("@capacitor/core");
      if (!Capacitor.isNativePlatform()) return;

      // Плагин включён только через конфигурацию (capacitor.config.ts),
      // без явного вызова API — по официальной рекомендации в этом
      // случае его всё равно нужно один раз импортировать для регистрации.
      await import("@capacitor-community/safe-area");
      const { SplashScreen } = await import("@capacitor/splash-screen");
      const { App } = await import("@capacitor/app");

      // @capacitor-community/safe-area сам внедряет рабочие CSS-переменные
      // (var(--safe-area-inset-*)) при подключении плагина — никакого
      // явного вызова для этого не требуется (в отличие от более старых
      // версий этого же плагина, где нужно было звать enable() вручную).
      // Стиль системных панелей настроен статически в capacitor.config.ts.
      // Запоминаем отступы, которые прислал плагин, — при следующем запуске
      // скрипт в <head> (app/layout.tsx) подставит их до первой отрисовки.
      const rememberInsets = () => {
        try {
          const cs = getComputedStyle(document.documentElement);
          const top = cs.getPropertyValue("--safe-area-inset-top").trim();
          const bottom = cs.getPropertyValue("--safe-area-inset-bottom").trim();
          if (top) localStorage.setItem("pm-sat", top);
          if (bottom) localStorage.setItem("pm-sab", bottom);
        } catch {}
      };
      [300, 1500, 4000].forEach((ms) => window.setTimeout(rememberInsets, ms));
      window.addEventListener("resize", rememberInsets);

      await SplashScreen.hide().catch(() => {});

      // Аппаратная/программная кнопка "назад" на Android: по умолчанию
      // Capacitor закрывает всё приложение при первом же нажатии — вместо
      // этого сначала пробуем обычную навигацию назад в самом WebView
      // (как в браузере), и только если истории для отката уже нет
      // (пользователь на "корневом" экране) — сворачиваем приложение, а
      // не закрываем его насовсем.
      const listener = await App.addListener("backButton", () => {
        if (window.history.length > 1) {
          window.history.back();
        } else {
          App.minimizeApp().catch(() => {});
        }
      });
      cleanup = () => {
        listener.remove();
        window.removeEventListener("resize", rememberInsets);
      };
    })();

    return () => cleanup?.();
  }, []);

  return null;
}
