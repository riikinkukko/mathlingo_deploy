import { applyPromoAction, clearPromoAction } from "@/app/actions-promo";

/**
 * Ввод промокода на странице тарифа. Активный код-скидка показывается
 * плашкой (его можно убрать), ошибки и успех — сообщением над полем.
 */
export default function PromoBox({
  active,
  error,
  success,
}: {
  active?: { code: string; label: string } | null;
  error?: string | null;
  success?: string | null;
}) {
  return (
    <div className="mb-6">
      {success && (
        <p className="mb-2 rounded-xl bg-pine-light px-3 py-2 text-[13px] font-bold text-pine-dark" role="status">
          {success}
        </p>
      )}
      {error && (
        <p className="mb-2 rounded-xl bg-coral-light px-3 py-2 text-[13px] font-bold text-coral" role="alert">
          {error}
        </p>
      )}
      {active ? (
        <div className="flex items-center justify-between gap-3 rounded-2xl border-2 border-dashed border-pine/50 bg-white px-4 py-3">
          <p className="text-[14px] text-ink">
            Промокод <span className="font-black">{active.code}</span>: {active.label}
          </p>
          <form action={clearPromoAction}>
            <button type="submit" className="text-[13px] font-bold text-ink-soft hover:text-coral">
              Убрать
            </button>
          </form>
        </div>
      ) : (
        <details className="group">
          <summary className="cursor-pointer list-none text-center text-[14px] font-bold text-ink-soft hover:text-pine [&::-webkit-details-marker]:hidden">
            Есть промокод?
          </summary>
          <form action={applyPromoAction} className="mx-auto mt-3 flex max-w-sm gap-2">
            <input
              name="promo"
              required
              autoComplete="off"
              aria-label="Промокод"
              placeholder="Промокод"
              className="input h-11 flex-1 uppercase"
            />
            <button type="submit" className="h-11 shrink-0 rounded-xl bg-pine px-4 text-[14px] font-black text-white hover:bg-pine-dark">
              Применить
            </button>
          </form>
        </details>
      )}
    </div>
  );
}
