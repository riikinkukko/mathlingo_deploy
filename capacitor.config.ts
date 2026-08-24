import type { CapacitorConfig } from "@capacitor/cli";
import { SystemBarsStyle } from "@capacitor-community/safe-area";

/**
 * Приложение — не статический экспорт, а полноценный SSR-сайт (Server
 * Actions, cookie-авторизация, вебхуки), поэтому Capacitor не может
 * упаковать код "внутрь" приложения так, как обычно делает со
 * статическими сайтами. Вместо этого WebView открывает напрямую
 * продакшен-URL (server.url ниже) — тот же подход, что webDir указывает
 * на папку "public" чисто формально (Capacitor требует эту опцию, но
 * реальный контент приложение вообще не берёт оттуда).
 *
 * Практическое следствие: при каждом обновлении сайта (через обычный
 * git push → автодеплой) содержимое в уже установленных на телефонах
 * приложениях обновляется АВТОМАТИЧЕСКИ, без публикации новой версии в
 * App Store/Google Play — пересборка и повторная публикация нужна
 * только когда меняется НАТИВНАЯ часть (иконка, разрешения, сам этот
 * конфиг и т.п.), не веб-контент.
 */
const config: CapacitorConfig = {
  appId: "ru.planimetrika.app",
  appName: "Планиметрика",
  webDir: "public",
  server: {
    url: "https://planimetrika.online",
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 800,
      backgroundColor: "#F2FAF5",
      androidSplashResourceName: "splash",
      showSpinner: false,
    },
    // Начиная с Android 15/16, edge-to-edge включается принудительно — у
    // Capacitor больше нет способа его отключить (старый подход через
    // @capacitor/status-bar с overlaysWebView:false перестал работать на
    // Android 16). Вместо этого используем специальный плагин-полифилл:
    // на новых WebView (Chromium 140+) он просто пропускает обычный CSS
    // env(safe-area-inset-*), а на более старых системных WebView (там
    // известный баг — insets возвращаются нулевыми) сам внедряет рабочие
    // значения через CSS-переменные var(--safe-area-inset-*) — это
    // происходит автоматически при подключении плагина, без явного кода
    // инициализации. См. app/globals.css.
    SystemBars: {
      insetsHandling: "disable",
    },
    SafeArea: {
      // Внимание: именование в этом enum обратное интуитивному — "Light"
      // означает ТЁМНЫЙ контент (иконки/текст статус-бара) на светлом
      // фоне, а "Dark" — наоборот, светлый контент на тёмном фоне. У
      // приложения светлый фон (палитра paper/pine-light), поэтому
      // нужны именно тёмные иконки — то есть Light, не Dark.
      statusBarStyle: SystemBarsStyle.Light,
      navigationBarStyle: SystemBarsStyle.Light,
    },
  },
};

export default config;
