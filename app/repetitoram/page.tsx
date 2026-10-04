import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Кабинет репетитора по математике — Планиметрика",
  description: "Расписание с группами, домашки всей группе, проверка решений с пометками на фото, оплаты и Telegram-бот. До 3 учеников бесплатно, 14 дней «Профи» после регистрации.",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Планиметрика",
    url: "/repetitoram",
    title: "Кабинет репетитора по математике — Планиметрика",
    description: "Расписание с группами, домашки всей группе, проверка решений с пометками на фото, оплаты и Telegram-бот. До 3 учеников бесплатно, 14 дней «Профи» после регистрации.",
    images: [{ url: "/og/repetitoram.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/og/repetitoram.png"] },
  alternates: { canonical: "/repetitoram" },
};

// Посадочная для рекламы и ссылок: тот же лендинг, открыт на нужной вкладке.
// Доступна и вошедшим — её могут прислать по ссылке.
export default function Page() {
  return <Landing initial="tutor" />;
}
