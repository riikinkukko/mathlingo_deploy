import ResetPasswordForm from "./ResetPasswordForm";
import Mascot from "@/components/Mascot";
import PublicFooter from "@/components/PublicFooter";

export const metadata = { title: "Новый пароль — Планиметрика" };

export default function ResetPasswordPage({ searchParams }: { searchParams: { token?: string } }) {
  const token = searchParams.token;

  return (
    <div className="flex min-h-screen flex-col bg-paper pt-[env(safe-area-inset-top)]">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-4 text-center">
            <Mascot mood="idle" size={88} />
            <h1 className="mt-1 font-display text-2xl font-black text-pine-dark">
              Новый пароль
            </h1>
          </div>
          <div className="card p-6">
            {token ? (
              <ResetPasswordForm token={token} />
            ) : (
              <p className="text-center text-sm text-coral">
                Ссылка неполная — в ней нет кода восстановления. Запросите
                новую ссылку на странице{" "}
                <a href="/forgot-password" className="font-bold underline">
                  восстановления пароля
                </a>
                .
              </p>
            )}
          </div>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
