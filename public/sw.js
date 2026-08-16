// Осознанно МИНИМАЛЬНЫЙ service worker. Это приложение показывает
// постоянно меняющиеся данные конкретного пользователя (энергия, прогресс,
// уведомления, список задач) — агрессивное кэширование HTML-страниц или
// API-ответов означало бы показывать устаревшее состояние, что для
// обучающего приложения хуже, чем отсутствие офлайн-режима вообще.
//
// Кэшируем ТОЛЬКО то, что физически не может устареть некорректно:
// - статику Next.js из /_next/static/ — файлы там версионируются хэшем в
//   имени, один и тот же URL всегда отдаёт один и тот же контент;
// - иконки и манифест.
// Всё остальное (страницы, /api/*) — всегда идёт в сеть, кэш не участвует.

const CACHE_NAME = "planimetrika-static-v1";

self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

function isSafeToCacheAggressively(url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    url.pathname.startsWith("/icons/") ||
    url.pathname === "/manifest.webmanifest"
  );
}

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Не свой origin (внешние запросы) и не GET — не трогаем вообще.
  if (url.origin !== self.location.origin || event.request.method !== "GET") {
    return;
  }

  if (!isSafeToCacheAggressively(url)) {
    // Страницы, /api/*, всё динамическое — всегда напрямую в сеть, без кэша.
    return;
  }

  event.respondWith(
    caches.open(CACHE_NAME).then(async (cache) => {
      const cached = await cache.match(event.request);
      if (cached) return cached;
      const response = await fetch(event.request);
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
  );
});
