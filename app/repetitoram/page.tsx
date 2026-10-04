import type { Metadata } from "next";
import Landing from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Кабинет репетитора по математике — Планиметрика",
  description: "Расписание с группами, домашки всей группе, проверка решений с пометками на фото, оплаты и Telegram-бот. До 3 учеников бесплатно, 14 дней «Профи» после регистрации.",
  alternates: { canonical: "/repetitoram" },
};

// Посадочная для рекламы и ссылок: тот же лендинг, открыт на нужной вкладке.
// Доступна и вошедшим — её могут прислать по ссылке.
export default function Page() {
  return <Landing initial="tutor" />;
}
