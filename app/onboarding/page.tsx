import OnboardingForm from "./OnboardingForm";
import Mascot from "@/components/Mascot";
import { getCurriculum } from "@/lib/queries";

export const metadata = { title: "Расскажи о себе — Планиметрика" };

export default async function OnboardingPage() {
  const topics = (await getCurriculum()).map(({ topic }) => ({ id: topic.id, title: topic.title }));
  return (
    <div className="flex min-h-screen flex-col bg-paper pt-[var(--app-sat)]">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-4 text-center">
            <Mascot mood="idle" size={80} />
            <h1 className="mt-1 font-display text-2xl font-black text-pine-dark">
              Расскажи о себе
            </h1>
            <p className="mt-1 text-sm font-semibold text-ink-soft">
              Три коротких вопроса — дальше сразу к занятиям
            </p>
          </div>
          <div className="card p-6">
            <OnboardingForm topics={topics} />
          </div>
        </div>
      </div>
    </div>
  );
}
