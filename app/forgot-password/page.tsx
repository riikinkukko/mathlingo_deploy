import ForgotPasswordForm from "./ForgotPasswordForm";
import Mascot from "@/components/Mascot";
import PublicFooter from "@/components/PublicFooter";

export const metadata = { title: "Восстановление пароля — Планиметрика" };

export default function ForgotPasswordPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper pt-[env(safe-area-inset-top)]">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-4 text-center">
            <Mascot mood="idle" size={88} />
            <h1 className="mt-1 font-display text-2xl font-black text-pine-dark">
              Забыли пароль?
            </h1>
            <p className="mt-1 text-sm font-semibold text-ink-soft">
              Введите email — пришлём ссылку для восстановления
            </p>
          </div>
          <div className="card p-6">
            <ForgotPasswordForm />
          </div>
          <p className="mt-4 text-center text-sm text-ink-soft">
            Вспомнили пароль?{" "}
            <a href="/login" className="font-bold text-pine hover:underline">
              Войти
            </a>
          </p>
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
