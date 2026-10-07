import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";

// Цифры на лендинге берутся из базы — обновляем раз в час.
export const revalidate = 3600;

export const metadata: Metadata = {
  title: "Подготовка к ЕГЭ по профильной математике — Планиметрика",
  description: "Короткие уроки по всем темам профильного ЕГЭ — от №1 до задач с параметром: подсказки, разбор, черновик на чертеже и повторение ошибок. Начать можно бесплатно.",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Планиметрика",
    url: "/uchenikam",
    title: "Подготовка к ЕГЭ по профильной математике — Планиметрика",
    description: "Короткие уроки по всем темам профильного ЕГЭ — от №1 до задач с параметром: подсказки, разбор, черновик на чертеже и повторение ошибок. Начать можно бесплатно.",
    images: [{ url: "/og/uchenikam.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/og/uchenikam.png"] },
  alternates: { canonical: "/uchenikam" },
};

// Посадочная для рекламы и ссылок: тот же лендинг, открыт на нужной вкладке.
// Доступна и вошедшим — её могут прислать по ссылке.
export default function Page() {
  return <Landing initial="student" />;
}
