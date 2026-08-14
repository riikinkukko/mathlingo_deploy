import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Планиметрика — платформа для подготовки к ЕГЭ",
  description:
    "Теория, задачи и прогресс по планиметрии для ученика, родителя и репетитора",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ru">
      <body className="font-sans bg-paper text-ink antialiased">{children}</body>
    </html>
  );
}
