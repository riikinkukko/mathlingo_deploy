import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import Landing from "@/components/landing/Landing";

export const metadata: Metadata = {
  title: "Планиметрика — подготовка к ЕГЭ по профильной математике",
  description:
    "Короткие уроки с подсказками и разбором для учеников, кабинет с расписанием, домашками и проверкой решений для репетиторов, прогресс ребёнка для родителей.",
  openGraph: {
    type: "website",
    locale: "ru_RU",
    siteName: "Планиметрика",
    url: "/",
    title: "Планиметрика — подготовка к ЕГЭ по профильной математике",
    description: "Короткие уроки с подсказками и разбором для учеников, кабинет с расписанием, домашками и проверкой решений для репетиторов, прогресс ребёнка для родителей.",
    images: [{ url: "/og/home.png", width: 1200, height: 630 }],
  },
  twitter: { card: "summary_large_image", images: ["/og/home.png"] },
  alternates: { canonical: "/" },
};

// Гость видит лендинг, вошедший — сразу свой кабинет.
export default async function Home() {
  const user = await getSessionUser();
  if (user) redirect(`/${user.role.toLowerCase()}`);
  return <Landing />;
}
