/** @type {import('next').NextConfig} */
const nextConfig = {
  // Убирает заголовок "X-Powered-By: Next.js" из всех ответов — по
  // просьбе пользователя из внешнего security-ревью: раскрытие стека
  // само по себе не уязвимость, но упрощает целевой поиск известных CVE
  // под конкретную версию, если она когда-то появится.
  poweredByHeader: false,
  // Базовые заголовки безопасности для всех страниц. CSP сознательно не
  // включаем: для Next.js он требует аккуратной настройки nonce, иначе
  // ломает страницы — это отдельная задача.
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
        ],
      },
    ];
  },
};
module.exports = nextConfig;
