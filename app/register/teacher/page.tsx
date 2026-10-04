import RegisterTeacherForm from "./RegisterTeacherForm";
import Mascot from "@/components/Mascot";
import PublicFooter from "@/components/PublicFooter";
import { findTeacherByReferral, normalizePromoCode, REFERRAL_BONUS_DAYS } from "@/lib/promo";

export const metadata = { title: "Регистрация репетитора — Планиметрика" };

export const dynamic = "force-dynamic";

export default async function RegisterTeacherPage({ searchParams }: { searchParams: { ref?: string; promo?: string } }) {
  const inviter = await findTeacherByReferral(searchParams.ref);
  const promo = normalizePromoCode(searchParams.promo) ?? undefined;
  return (
    <div className="flex min-h-screen flex-col bg-paper pt-[var(--app-sat)]">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-4 text-center">
            <Mascot mood="celebrating" size={88} />
            <h1 className="mt-1 font-display text-2xl font-black text-pine-dark">
              Планиметрика для репетитора
            </h1>
            <p className="mt-1 text-sm font-semibold text-ink-soft">
              Ведите учеников, задавайте домашку, следите за прогрессом — в одном
              приложении. 14 дней тарифа «Профи» бесплатно, дальше — до 3 учеников бесплатно или тариф от 690 ₽/мес.
            </p>
          </div>
          {inviter && (
            <p className="mb-3 rounded-2xl bg-pine-light px-4 py-3 text-sm font-semibold text-pine-darker">
              Вас пригласил(а) {inviter.name}. После первой оплаты тарифа вам обоим — +{REFERRAL_BONUS_DAYS} дней.
            </p>
          )}
          <div className="card p-6">
            <RegisterTeacherForm refCode={inviter ? searchParams.ref!.trim().toUpperCase() : undefined} promo={promo} />
          </div>
          <p className="mt-4 text-center text-sm text-ink-soft">
            Уже есть аккаунт?{" "}
            <a href="/login" className="font-bold text-pine hover:underline">
              Войти
            </a>
          </p>
          <p className="mt-3 text-center text-sm">
            <a href="/tariffs" className="font-bold text-ink-soft underline hover:text-pine">
              Тарифы и цены
            </a>
          </p>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
