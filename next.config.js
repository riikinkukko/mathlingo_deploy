// ---------- Content-Security-Policy ----------
// Хосты ЮKassa: оплата — это redirect на confirmation_url (yoomoney.ru), а не
// form post, но серверный экшен делает этот redirect в ответ на отправку
// формы — если форма ушла до гидратации (обычный POST), браузер применяет
// form-action и к редиректу. Поэтому разрешаем их в form-action.
const PAYMENT_HOSTS = "https://yoomoney.ru https://*.yoomoney.ru https://yookassa.ru https://*.yookassa.ru";
// Яндекс.Метрика (components/Analytics.tsx, только если задан счётчик):
// скрипт tag.js и отправка хитов.
const METRIKA_SCRIPT = "https://mc.yandex.ru https://yastatic.net";
const METRIKA_CONNECT = "https://mc.yandex.ru https://mc.yandex.com";

// ПРИНУДИТЕЛЬНАЯ политика — только директивы, которые не могут сломать
// встроенные скрипты Next.js (гидратация, __next_f) и inline-стили:
// запрет <object>/<embed>, подмены <base>, встраивания в чужие iframe и
// отправки форм на чужие сайты.
const CSP_ENFORCED = [
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  `form-action 'self' ${PAYMENT_HOSTS}`,
].join("; ");

// Полная политика пока в режиме Report-Only: браузер только пишет нарушения в
// консоль, ничего не блокирует. 'unsafe-inline' для скриптов нужен Next.js без
// nonce (inline-данные RSC и скрипт в app/layout.tsx). Шрифты — @fontsource,
// отдаются со своего домена. Когда в консоли продакшена не останется
// нарушений, можно переносить в принудительную.
const CSP_REPORT_ONLY = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline' ${METRIKA_SCRIPT}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://mc.yandex.ru",
  "font-src 'self' data:",
  `connect-src 'self' ${METRIKA_CONNECT}`,
  "frame-src 'self' https://mc.yandex.ru",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'self'",
  `form-action 'self' ${PAYMENT_HOSTS}`,
].join("; ");

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Убирает заголовок "X-Powered-By: Next.js" из всех ответов — по
  // просьбе пользователя из внешнего security-ревью: раскрытие стека
  // само по себе не уязвимость, но упрощает целевой поиск известных CVE
  // под конкретную версию, если она когда-то появится.
  poweredByHeader: false,
  // next/image в проекте не используется — оптимизатор /_next/image
  // отключён целиком (меньше поверхности атаки; в прошлом в нём были CVE).
  images: { unoptimized: true },
  // instrumentation.ts (пересылка ошибок сервера владельцу в Telegram) в
  // Next 15 включён по умолчанию — флаг instrumentationHook больше не нужен.
  experimental: {
    // Фото решения (сжимается в браузере до ~650 КБ) уходит через серверный
    // экшен; стандартный предел Next — 1 МБ впритык, даём запас.
    serverActions: { bodySizeLimit: "1.5mb" },
  },
  // Базовые заголовки безопасности для всех страниц. CSP — см. выше:
  // принудительно только безопасные директивы, полная — в Report-Only.
  async headers() {
    return [
      {
        source: "/:path*",
        headers: [
          // Запрет встраивать сайт в чужой iframe (защита от кликджекинга).
          { key: "X-Frame-Options", value: "SAMEORIGIN" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          { key: "Content-Security-Policy", value: CSP_ENFORCED },
          { key: "Content-Security-Policy-Report-Only", value: CSP_REPORT_ONLY },
        ],
      },
    ];
  },
};
module.exports = nextConfig;
