import { verifyEmailAction } from "@/app/actions";
import Mascot from "@/components/Mascot";
import PublicFooter from "@/components/PublicFooter";

export const metadata = { title: "Подтверждение email — Планиметрика" };

export default async function VerifyEmailPage({ searchParams }: { searchParams: { token?: string } }) {
  const result = searchParams.token ? await verifyEmailAction(searchParams.token) : { success: false };

  return (
    <div className="flex min-h-screen flex-col bg-paper pt-[env(safe-area-inset-top)]">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm text-center">
          <Mascot mood={result.success ? "celebrating" : "idle"} size={96} />
          {result.success ? (
            <>
              <h1 className="mt-2 font-display text-2xl font-black text-pine-dark">Email подтверждён!</h1>
              <p className="mt-1 text-sm text-ink-soft">Спасибо — теперь мы точно знаем, что этот адрес ваш.</p>
            </>
          ) : (
            <>
              <h1 className="mt-2 font-display text-2xl font-black text-ink">Ссылка не сработала</h1>
              <p className="mt-1 text-sm text-ink-soft">
                Возможно, она уже была использована раньше, либо срок её
                действия (24 часа) истёк. Запросить новую ссылку можно в
                разделе «Профиль» после входа в аккаунт.
              </p>
            </>
          )}
          <a href="/login" className="btn-primary mt-5 inline-block !px-8">
            {result.success ? "Войти" : "На страницу входа"}
          </a>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
