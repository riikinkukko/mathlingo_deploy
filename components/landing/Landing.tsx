import "@fontsource/caveat/cyrillic-700.css";
import "@fontsource/caveat/latin-700.css";
import Mascot from "@/components/Mascot";
import PublicFooter from "@/components/PublicFooter";
import HeroProblem from "./HeroProblem";
import AudienceSwitcher from "./AudienceSwitcher";
import { AUDIENCE_HASH, type Audience } from "./audience";
import { getStudentProPrice } from "@/lib/tariffs";

const DOORS: { aud: Audience; label: string; sub: string }[] = [
  { aud: "tutor", label: "Я репетитор", sub: "кабинет и ученики" },
  { aud: "student", label: "Я ученик", sub: "готовлюсь к ЕГЭ" },
  { aud: "parent", label: "Я родитель", sub: "слежу за прогрессом" },
];

const FAQ: [string, string][] = [
  [
    "Для какого экзамена задачи?",
    "Для профильного ЕГЭ по математике. Все 10 тем: планиметрия, стереометрия, вероятность, тригонометрия, производная, логарифмы, текстовые задачи, графики, векторы и экономическая задача.",
  ],
  [
    "Можно заниматься без репетитора?",
    "Да. Ученик регистрируется сам и сразу решает уроки: подсказки и разбор есть у каждой задачи. Первая глава каждой темы открыта бесплатно.",
  ],
  [
    "Нужно что-то устанавливать?",
    "Нет. Планиметрика работает в браузере на телефоне и компьютере. На телефоне сайт можно добавить на главный экран — он откроется как приложение.",
  ],
  [
    "Как родителю получить доступ?",
    "Кабинет родителя создаёт репетитор в карточке ученика — вам придут логин и пароль. Если репетитор пока не пользуется Планиметрикой, отправьте ему ссылку: до 3 учеников сервис для него бесплатный.",
  ],
  [
    "Сколько стоит репетитору?",
    "До 3 учеников — бесплатно. «Репетитор» — 690 ₽ в месяц до 15 учеников, «Профи» — 1 290 ₽ без лимита, при оплате за год два месяца в подарок. Первые 14 дней после регистрации — «Профи» бесплатно, карта не нужна.",
  ],
];

/**
 * Публичная главная для гостей: воронка для трёх аудиторий. Внутри
 * приложения (Capacitor) лендинг не нужен — скрипт ниже сразу уводит на вход.
 */
export default function Landing({ initial = "tutor" }: { initial?: Audience }) {
  const studentPrice = getStudentProPrice().priceRub;

  return (
    <div className="min-h-screen bg-paper pt-[var(--app-sat)]">
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){document.documentElement.style.visibility="hidden";location.replace("/login")}}catch(e){}`,
        }}
      />

      <header className="lp-grid border-b border-line">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <a href="/" className="flex items-center gap-2" aria-label="Планиметрика — на главную">
            <Mascot mood="idle" size={40} float={false} />
            <span className="text-[19px] font-black text-ink">Планиметрика</span>
          </a>
          <nav className="ml-auto flex items-center gap-1">
            <a href="/tariffs" className="hidden h-10 items-center rounded-xl px-3 text-[15px] font-bold text-ink-soft hover:text-ink sm:inline-flex">
              Тарифы
            </a>
            <a
              href="/login"
              className="inline-flex h-10 items-center rounded-xl border-2 border-line bg-white px-4 text-[15px] font-black text-ink hover:border-pine"
            >
              Войти
            </a>
          </nav>
        </div>

        {/* Телефон: заголовок → задача → кнопки «Я …». Десктоп: задача справа на всю высоту. */}
        <section className="mx-auto grid max-w-6xl gap-8 px-4 pb-14 pt-6 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-8 lg:pb-20 lg:pt-14">
          <div className="lg:self-end">
            <h1 className="max-w-[15ch] text-[34px] font-black leading-[1.04] tracking-[-0.01em] text-ink sm:text-[54px] lg:text-[62px]">
              Профильная математика по задаче за раз
            </h1>
            <p className="mt-4 max-w-[46ch] text-[16px] leading-normal text-ink-soft sm:mt-5 sm:text-[18px] sm:leading-relaxed">
              Короткие уроки с подсказками и разбором для учеников. Расписание, домашки и проверка решений для репетиторов.
              Прогресс без расспросов для родителей.
            </p>
          </div>

          <div className="lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <HeroProblem />
          </div>

          <div className="lg:self-start">
            <div className="grid max-w-[520px] gap-2 sm:grid-cols-3">
              {DOORS.map((d) => (
                <a
                  key={d.aud}
                  href={`#${AUDIENCE_HASH[d.aud]}`}
                  className="group flex items-baseline justify-between gap-2 rounded-2xl border-2 border-line bg-white px-4 py-3 transition hover:border-pine focus-visible:border-pine sm:block sm:px-3"
                >
                  <span className="block text-[16px] font-black leading-tight text-ink group-hover:text-pine-dark">{d.label}</span>
                  <span className="block text-[13px] leading-tight text-ink-soft sm:mt-0.5">{d.sub}</span>
                </a>
              ))}
            </div>
            <p className="mt-5 max-w-[46ch] text-[14px] text-ink-soft">
              10 тем профильного ЕГЭ, 76 навыков и 400+ задач — от №1 до экономической.
            </p>
          </div>
        </section>
      </header>

      <main>
        {/* Якоря для кнопок первого экрана: все три ведут к переключателю. */}
        <section className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          {(Object.values(AUDIENCE_HASH) as string[]).map((h) => (
            <span key={h} id={h} className="absolute -top-2" aria-hidden />
          ))}
          <AudienceSwitcher initial={initial} studentPrice={studentPrice} />
        </section>

        <section className="border-t border-line bg-white">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 className="text-[28px] font-black text-ink sm:text-[34px]">Частые вопросы</h2>
            <div className="mt-6 divide-y divide-line border-y border-line">
              {FAQ.map(([q, a]) => (
                <details key={q} className="group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-extrabold text-ink [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden className="text-[22px] font-bold text-pine transition group-open:rotate-45">
                      +
                    </span>
                  </summary>
                  <p className="max-w-[62ch] pb-5 text-[16px] leading-relaxed text-ink-soft">{a}</p>
                </details>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-pine-darker text-white">
          <div className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
            <Mascot mood="happy" size={88} float={false} />
            <div className="flex-1">
              <h2 className="max-w-[22ch] text-[28px] font-black leading-tight sm:text-[34px]">До ЕГЭ меньше года. Начните с одной задачи сегодня.</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/register" className="inline-flex h-12 items-center rounded-2xl bg-white px-5 text-[15px] font-black text-pine-darker hover:bg-pine-light">
                Я ученик
              </a>
              <a
                href="/register/teacher"
                className="inline-flex h-12 items-center rounded-2xl border-2 border-white/40 px-5 text-[15px] font-black text-white hover:border-white"
              >
                Я репетитор
              </a>
            </div>
          </div>
        </section>
      </main>

      <PublicFooter />
    </div>
  );
}
