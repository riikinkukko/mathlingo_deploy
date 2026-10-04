import type { Metadata, Viewport } from "next";
import { Suspense } from "react";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import CapacitorBootstrap from "@/components/CapacitorBootstrap";
import Analytics from "@/components/Analytics";

export const metadata: Metadata = {
  // Абсолютные адреса для og:image и canonical.
  metadataBase: new URL("https://planimetrika.online"),
  title: "Планиметрика — платформа для подготовки к ЕГЭ",
  description:
    "Подготовка к ЕГЭ по профильной математике: уроки для ученика, кабинет репетитора и прогресс для родителя",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Планиметрика",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/icon-180.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1CAE6B",
  width: "device-width",
  initialScale: 1,
  // viewport-fit=cover — обязательно для мобильного приложения (Capacitor):
  // без него контент на iPhone с "чёлкой"/Dynamic Island либо обрезается
  // белой полосой сверху/снизу, либо (в других браузерах) наезжает на
  // системные элементы. С этим флагом страница простирается под них, а
  // дальше сами элементы интерфейса отступают на нужное расстояние через
  // CSS-переменные env(safe-area-inset-*) — см. globals.css.
  viewportFit: "cover",
  // Запрет пользовательского зума жестом (pinch-to-zoom) и через двойной тап.
  // Это одна из двух превентивных мер против репортов "мобильная версия
  // плохо масштабируется, нижняя панель навигации 'плавает'" — сам эффект
  // связан со сворачиванием/разворачиванием адресной строки мобильного
  // браузера при скролле и не всегда воспроизводится в автоматизированном
  // тестировании, так что эта мера — лучшее, что можно сделать без
  // возможности проверить на реальном устройстве пользователя.
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <head>
        {/* До первой отрисовки: подставляем отступы под системные панели,
            сохранённые с прошлого запуска приложения (CapacitorBootstrap).
            Без этого плагин safe-area присылает их уже после загрузки, и
            шапка дёргается вниз. Самый первый запуск в приложении — типичные
            28px, точное значение плагин пришлёт следом. В браузере — ничего. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `try{var r=document.documentElement.style,t=localStorage.getItem("pm-sat"),b=localStorage.getItem("pm-sab");if(t)r.setProperty("--safe-area-inset-top",t);else if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform())r.setProperty("--safe-area-inset-top","28px");if(b)r.setProperty("--safe-area-inset-bottom",b)}catch(e){}`,
          }}
        />
      </head>
      <body className="font-sans bg-paper text-ink antialiased">
        <ServiceWorkerRegister />
        <CapacitorBootstrap />
        {/* useSearchParams в Analytics требует Suspense-границы в App Router */}
        <Suspense fallback={null}>
          <Analytics />
        </Suspense>
        {children}
      </body>
    </html>
  );
}
