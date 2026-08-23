import LoginForm from "./LoginForm";
import Mascot from "@/components/Mascot";
import PublicFooter from "@/components/PublicFooter";

export default function LoginPage() {
  return (
    <div className="flex min-h-screen flex-col bg-paper">
      <div className="flex flex-1 items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="mb-4 text-center">
            <Mascot mood="happy" size={88} />
            <h1 className="mt-1 font-display text-2xl font-black text-pine-dark">
              Планиметрика
            </h1>
            <p className="mt-1 text-sm font-semibold text-ink-soft">
              Теория, задачи и прогресс подготовки к ЕГЭ
            </p>
          </div>
          <div className="card p-6">
            <LoginForm />
          </div>
          <p className="mt-4 text-center text-sm text-ink-soft">
            Нет аккаунта репетитора?{" "}
            <a href="/register" className="font-bold text-pine hover:underline">
              Зарегистрироваться самостоятельно
            </a>
          </p>
          {process.env.NODE_ENV !== "production" && (
            <div className="mt-6 rounded-2xl border-2 border-line bg-white/60 p-4 text-xs leading-relaxed text-ink-soft">
              <p className="mb-1.5 font-extrabold text-ink">Демо-доступы:</p>
              <p>Учитель — teacher@demo.ru</p>
              <p>Ученик — student@demo.ru</p>
              <p>Родитель — parent@demo.ru</p>
              <p className="mt-1">Пароль везде: demo1234</p>
            </div>
          )}
        </div>
      </div>
      <PublicFooter />
    </div>
  );
}
