import type { Metadata, Viewport } from "next";
import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import CapacitorBootstrap from "@/components/CapacitorBootstrap";

export const metadata: Metadata = {
  title: "Планиметрика — платформа для подготовки к ЕГЭ",
  description:
    "Теория, задачи и прогресс по планиметрии для ученика, родителя и репетитора",
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
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="font-sans bg-paper text-ink antialiased">
        <ServiceWorkerRegister />
        <CapacitorBootstrap />
        {children}
      </body>
    </html>
  );
}
