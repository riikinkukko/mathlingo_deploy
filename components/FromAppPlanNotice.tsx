import Mascot from "./Mascot";

/**
 * Вместо страницы тарифа, когда сайт открыт из мобильного приложения
 * (lib/app-context.ts). Правила Google Play не разрешают вести к оплате
 * из Android-приложения — показываем только, что сейчас действует.
 */
export default function FromAppPlanNotice({ planLine }: { planLine: string }) {
  return (
    <div className="px-4 py-10 lg:px-8">
      <div className="card mx-auto max-w-md p-6 text-center">
        <Mascot mood="happy" size={72} float={false} className="mx-auto" />
        <h1 className="mt-3 font-display text-xl font-black text-ink">Твой тариф</h1>
        <p className="mt-1 text-[15px] font-bold text-ink">{planLine}</p>
        <p className="mt-3 text-[13px] leading-snug text-ink-soft">
          В приложении тариф не оформляется. Если захочешь поменять его — зайди на planimetrika.online
          с компьютера или из браузера.
        </p>
      </div>
    </div>
  );
}
