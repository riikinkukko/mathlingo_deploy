import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Подготовка к ЕГЭ по профильной математике — Планиметрика",
  description: "Короткие уроки по всем 10 темам профильного ЕГЭ: подсказки, разбор, черновик на чертеже и повторение ошибок. Начать можно бесплатно.",
  alternates: { canonical: "/uchenikam" },
};

// Посадочная для рекламы и ссылок: тот же лендинг, открыт на нужной вкладке.
// Доступна и вошедшим — её могут прислать по ссылке.
export default function Page() {
  return <Landing initial="student" />;
}
