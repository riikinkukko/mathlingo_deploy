import type { CapacitorConfig } from "@capacitor/cli";

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
    StatusBar: {
      style: "DARK",
      backgroundColor: "#F2FAF5",
    },
  },
};

export default config;
