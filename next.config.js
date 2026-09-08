/** @type {import('next').NextConfig} */
const nextConfig = {
  // Убирает заголовок "X-Powered-By: Next.js" из всех ответов — по
  // просьбе пользователя из внешнего security-ревью: раскрытие стека
  // само по себе не уязвимость, но упрощает целевой поиск известных CVE
  // под конкретную версию, если она когда-то появится.
  poweredByHeader: false,
};
module.exports = nextConfig;
