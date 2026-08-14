import RegisterForm from "./RegisterForm";
import Mascot from "@/components/Mascot";

export default function RegisterPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-paper px-4">
      <div className="w-full max-w-sm">
        <div className="mb-4 text-center">
          <Mascot mood="celebrating" size={88} />
          <h1 className="mt-1 font-display text-2xl font-black text-pine-dark">
            Начни готовиться к ЕГЭ
          </h1>
          <p className="mt-1 text-sm font-semibold text-ink-soft">
            Без репетитора — сам себе ученик. Бесплатно, с ограничением по энергии
            в день, без домашки и журнала занятий (это только у учеников репетитора).
          </p>
        </div>
        <div className="card p-6">
          <RegisterForm />
        </div>
        <p className="mt-4 text-center text-sm text-ink-soft">
          Уже есть аккаунт?{" "}
          <a href="/login" className="font-bold text-pine hover:underline">
            Войти
          </a>
        </p>
      </div>
    </div>
  );
}
