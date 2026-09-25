import Mascot from "@/components/Mascot";
import PublicFooter from "@/components/PublicFooter";
import { IconCheck, IconCrown } from "@/components/icons";
import {
  getStudentProPrice,
  getTeacherProPrice,
  STUDENT_FREE_FEATURES,
  STUDENT_PRO_FEATURES,
  TEACHER_FREE_FEATURES,
  TEACHER_PRO_FEATURES,
} from "@/lib/tariffs";

export const metadata = { title: "Тарифы — Планиметрика" };
// Цены берутся из переменных окружения на сервере — страница не должна
// запекаться при сборке со значениями по умолчанию.
export const dynamic = "force-dynamic";

/**
 * Публичная страница тарифов — доступна без входа в аккаунт. Требование
 * ЮKassa: стоимость услуг и условия автопродления должны быть видны любому
 * посетителю сайта, а не только внутри личного кабинета. На неё ссылается
 * публичная оферта (раздел 1).
 */
function FeatureList({ items, accent }: { items: string[]; accent?: boolean }) {
  return (
    <ul className="space-y-2 text-sm text-ink-soft">
      {items.map((f) => (
        <li key={f} className="flex items-start gap-2">
          <IconCheck className={`mt-0.5 h-4 w-4 shrink-0 ${accent ? "text-amber" : "text-ink-soft"}`} />
          {f}
        </li>
      ))}
    </ul>
  );
}

export default function TariffsPage() {
  const student = getStudentProPrice();
  const teacher = getTeacherProPrice();

  return (
    <div className="flex min-h-screen flex-col bg-paper pt-[env(safe-area-inset-top)]">
      <main className="mx-auto w-full max-w-3xl flex-1 px-4 py-8">
        <a href="/" className="mb-6 inline-flex items-center gap-1.5 text-sm font-bold text-ink-soft hover:text-pine">
          ← На главную
        </a>
        <div className="mb-8 text-center">
          <Mascot mood="happy" size={80} />
          <h1 className="mt-2 font-display text-3xl font-black text-ink">Тарифы</h1>
          <p className="mt-1 text-sm text-ink-soft">
            Онлайн-сервис подготовки к ЕГЭ по математике «Планиметрика»
          </p>
        </div>

        <section className="mb-10">
          <h2 className="mb-1 font-display text-xl font-black text-ink">Для учеников</h2>
          <p className="mb-4 text-sm text-ink-soft">Самостоятельная подготовка, без репетитора.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">Free</p>
              <p className="mb-3 font-display text-xl font-black text-ink">0 ₽</p>
              <FeatureList items={STUDENT_FREE_FEATURES} />
            </div>
            <div className="card bg-gradient-to-br from-amber-light to-white p-5">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-amber">
                <IconCrown className="h-4 w-4" /> Pro
              </p>
              <p className="mb-3 font-display text-xl font-black text-ink">
                {student.priceRub} ₽ / {student.periodDays} дн.
              </p>
              <FeatureList items={STUDENT_PRO_FEATURES} accent />
              <p className="mt-4 rounded-xl bg-white/70 p-3 text-xs text-ink-soft">
                Разовая оплата за период. Автоматического продления нет — по
                окончании периода доступ к Pro прекращается, пока вы не оплатите
                снова.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="mb-1 font-display text-xl font-black text-ink">Для репетиторов</h2>
          <p className="mb-4 text-sm text-ink-soft">Кабинет для ведения учеников: домашние задания, журнал, прогресс.</p>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="card p-5">
              <p className="mb-1 text-xs font-extrabold uppercase tracking-wide text-ink-soft">Free</p>
              <p className="mb-3 font-display text-xl font-black text-ink">0 ₽</p>
              <FeatureList items={TEACHER_FREE_FEATURES} />
            </div>
            <div className="card bg-gradient-to-br from-amber-light to-white p-5">
              <p className="mb-1 flex items-center gap-1.5 text-xs font-extrabold uppercase tracking-wide text-amber">
                <IconCrown className="h-4 w-4" /> Pro
              </p>
              <p className="mb-3 font-display text-xl font-black text-ink">
                {teacher.priceRub} ₽ / {teacher.periodDays} дн.
              </p>
              <FeatureList items={TEACHER_PRO_FEATURES} accent />
              <p className="mt-4 rounded-xl bg-white/70 p-3 text-xs text-ink-soft">
                <strong className="text-ink">Подписка с автопродлением.</strong>{" "}
                При оформлении вы даёте отдельное согласие на автоматическое
                списание {teacher.priceRub} ₽ каждые {teacher.periodDays} дней с
                привязанной банковской карты до момента отмены подписки.
              </p>
            </div>
          </div>
        </section>

        <section className="card mb-6 p-5 text-sm leading-relaxed text-ink-soft">
          <h2 className="mb-2 font-display text-base font-black text-ink">Как отменить автопродление</h2>
          <p>
            Отменить подписку и отвязать карту можно самостоятельно в любой момент:
            личный кабинет репетитора → раздел «Тариф» → «Отменить подписку».
            Обращаться в поддержку не нужно. После отмены новые списания не
            производятся, а доступ сохраняется до конца уже оплаченного периода.
          </p>
          <h2 className="mb-2 mt-4 font-display text-base font-black text-ink">Оплата</h2>
          <p>
            Оплата банковской картой через платёжный сервис ЮKassa. Мы не получаем
            и не храним данные вашей карты. Условия оказания услуг, порядок оплаты
            и возврата — в{" "}
            <a href="/legal/offer" className="font-bold text-pine hover:underline">
              Публичной оферте
            </a>
            .
          </p>
        </section>

        <div className="flex flex-wrap justify-center gap-3">
          <a href="/register" className="btn-primary">Начать как ученик</a>
          <a href="/register/teacher" className="btn-secondary">Я репетитор</a>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
