import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Прогресс ребёнка в подготовке к ЕГЭ — Планиметрика",
  description: "Сколько ребёнок занимался, сдана ли домашка, ближайшее занятие и отчёт репетитора — в кабинете родителя.",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Планиметрика",
    url: "/roditelyam",
    title: "Прогресс ребёнка в подготовке к ЕГЭ — Планиметрика",
    description: "Сколько ребёнок занимался, сдана ли домашка, ближайшее занятие и отчёт репетитора — в кабинете родителя.",
    images: [{ url: "/og/roditelyam.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/og/roditelyam.png"] },
  alternates: { canonical: "/roditelyam" },
};

// Посадочная для рекламы и ссылок: тот же лендинг, открыт на нужной вкладке.
// Доступна и вошедшим — её могут прислать по ссылке.
export default function Page() {
  return <Landing initial="parent" />;
}
