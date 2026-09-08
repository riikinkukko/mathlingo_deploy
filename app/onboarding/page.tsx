import OnboardingForm from "./OnboardingForm";
import Mascot from "@/components/Mascot";

export const metadata = { title: "Расскажите о себе — Планиметрика" };

export default function OnboardingPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper pt-[env(safe-area-inset-top)]">
      <div className="flex flex-1 items-center justify-center px-4 py-8">
        <div className="w-full max-w-sm">
          <div className="mb-4 text-center">
            <Mascot mood="idle" size={80} />
            <h1 className="mt-1 font-display text-2xl font-black text-pine-dark">
              Расскажите о себе
            </h1>
            <p className="mt-1 text-sm font-semibold text-ink-soft">
              Два коротких вопроса — дальше сразу к занятиям
            </p>
          </div>
          <div className="card p-6">
            <OnboardingForm />
          </div>
        </div>
      </div>
    </div>
  );
}
