import { Fragment } from "react";
import "@fontsource/caveat/cyrillic-700.css";
import "@fontsource/caveat/latin-700.css";
import Mascot from "@/components/Mascot";
import PublicFooter from "@/components/PublicFooter";
import HeroProblem from "./HeroProblem";
import AudienceSwitcher from "./AudienceSwitcher";
import LandingMotion from "./LandingMotion";
import { AUDIENCE_HASH, type Audience } from "./audience";
import { getStudentProPrice } from "@/lib/tariffs";
import { getCurriculum } from "@/lib/queries";
import { db } from "@/lib/db/client";
import * as schema from "@/lib/db/schema";
import { sql } from "drizzle-orm";
import { pluralRu } from "@/lib/pluralize";

/** Каракули на полях первого экрана: что, где, насколько заметно и как плывёт. */
const DOODLES: { t: string; cls: string; style: Record<string, string> }[] = [
  { t: "π", cls: "left-[4%] top-[18%] hidden text-[46px] text-pine sm:block", style: { "--o": "0.28", "--t": "11s", "--dl": "0s", "--dx": "8px", "--dy": "-14px", "--r": "-8deg" } },
  { t: "√x", cls: "left-[42%] top-[8%] hidden text-[38px] text-coral lg:block", style: { "--o": "0.32", "--t": "13s", "--dl": "0.6s", "--dx": "-12px", "--dy": "10px", "--r": "6deg" } },
  { t: "x²", cls: "right-[6%] top-[10%] text-[40px] text-pine", style: { "--o": "0.26", "--t": "12s", "--dl": "0.3s", "--dx": "-10px", "--dy": "-12px", "--r": "-5deg" } },
  { t: "180°", cls: "left-[46%] bottom-[10%] hidden text-[34px] text-coral lg:block", style: { "--o": "0.3", "--t": "14s", "--dl": "0.9s", "--dx": "14px", "--dy": "-8px", "--r": "4deg" } },
  { t: "∠", cls: "right-[3%] bottom-[16%] text-[44px] text-pine", style: { "--o": "0.24", "--t": "10s", "--dl": "1.2s", "--dx": "-6px", "--dy": "-16px", "--r": "9deg" } },
  { t: "log₂", cls: "left-[2%] bottom-[6%] hidden text-[32px] text-pine sm:block", style: { "--o": "0.24", "--t": "15s", "--dl": "0.4s", "--dx": "12px", "--dy": "-10px", "--r": "-4deg" } },
];

const HEADLINE = ["Профильная", "математика"];
const HEADLINE_MARKED = ["по", "задаче", "за", "раз"];

/** Цифры для первого экрана и «Частых вопросов» — из базы, чтобы не врать. */
async function getStats() {
  try {
    const curriculum = await getCurriculum();
    const skills = curriculum.reduce((n, t) => n + t.chapters.reduce((m, c) => m + c.skills.length, 0), 0);
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(schema.problems);
    return { topics: curriculum.map((t) => t.topic.title), skills, problems: Number(n) };
  } catch {
    return { topics: [] as string[], skills: 0, problems: 0 };
  }
}

const DOORS: { aud: Audience; label: string; sub: string }[] = [
  { aud: "tutor", label: "Я репетитор", sub: "кабинет и ученики" },
  { aud: "student", label: "Я ученик", sub: "готовлюсь к ЕГЭ" },
  { aud: "parent", label: "Я родитель", sub: "слежу за прогрессом" },
];

const faq = (topics: string[]): [string, string][] => [
  [
    "Для какого экзамена задачи?",
    topics.length
      ? `Для профильного ЕГЭ по математике. ${topics.length} ${pluralRu(topics.length, ["тема", "темы", "тем"])}: ${topics.map((t) => t.toLowerCase()).join(", ")}.`
      : "Для профильного ЕГЭ по математике — от задания №1 до задач с параметром.",
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
export default async function Landing({ initial = "tutor" }: { initial?: Audience }) {
  const studentPrice = getStudentProPrice().priceRub;
  const stats = await getStats();
  const problemsRounded = stats.problems >= 100 ? Math.floor(stats.problems / 100) * 100 : stats.problems;
  const FAQ = faq(stats.topics);

  return (
    <div className="lp-root min-h-screen bg-paper pt-[var(--app-sat)]">
      <script
        dangerouslySetInnerHTML={{
          __html: `try{if(window.Capacitor&&window.Capacitor.isNativePlatform&&window.Capacitor.isNativePlatform()){document.documentElement.style.visibility="hidden";location.replace("/login")}else{document.documentElement.classList.add("lp-js")}}catch(e){}`,
        }}
      />
      <LandingMotion />

      <header className="lp-grid relative overflow-hidden border-b border-line">
        {DOODLES.map((d) => (
          <span key={d.t} aria-hidden className={`lp-doodle ${d.cls}`} style={d.style as React.CSSProperties}>
            {d.t}
          </span>
        ))}
        <div className="relative mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
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
        <section className="relative mx-auto grid max-w-6xl gap-8 px-4 pb-14 pt-6 sm:px-6 lg:grid-cols-[1.1fr_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-8 lg:pb-20 lg:pt-14">
          <div className="lg:self-end">
            <h1 className="max-w-[15ch] text-[34px] font-black leading-[1.04] tracking-[-0.01em] text-ink sm:text-[54px] lg:text-[62px]">
              {HEADLINE.map((w, i) => (
                <Fragment key={w}>
                  <span className="lp-word" style={{ "--i": i } as React.CSSProperties}>
                    {w}
                  </span>{" "}
                </Fragment>
              ))}
              {/* «по задаче за раз» не разрывается — под ним одна линия ручкой. */}
              <span className="relative inline-block whitespace-nowrap">
                {HEADLINE_MARKED.map((w, i) => (
                  <span key={w + i} className="lp-word" style={{ "--i": HEADLINE.length + i } as React.CSSProperties}>
                    {w}
                    {i < HEADLINE_MARKED.length - 1 ? "\u00a0" : ""}
                  </span>
                ))}
                {/* Красная ручка подчёркивает, как учитель в тетради. */}
                <svg aria-hidden viewBox="0 0 300 20" preserveAspectRatio="none" className="lp-underline pointer-events-none absolute -bottom-[0.14em] left-0 h-[0.32em] w-full">
                  <path d="M 4 14 C 60 6, 120 4, 180 9 S 270 15, 296 6" fill="none" stroke="#F0555A" strokeWidth="5" strokeLinecap="round" pathLength={1} />
                </svg>
              </span>
            </h1>
            <p
              className="lp-hero-in mt-4 max-w-[46ch] text-[16px] leading-normal text-ink-soft sm:mt-5 sm:text-[18px] sm:leading-relaxed"
              style={{ "--d": "0.75s" } as React.CSSProperties}
            >
              Короткие уроки с подсказками и разбором для учеников. Расписание, домашки и проверка решений для репетиторов.
              Прогресс без расспросов для родителей.
            </p>
          </div>

          <div className="lp-sheet-in lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-center">
            <HeroProblem moreCount={problemsRounded} />
          </div>

          <div className="lg:self-start">
            <div className="grid max-w-[520px] gap-2 sm:grid-cols-3">
              {DOORS.map((d, i) => (
                <a
                  key={d.aud}
                  href={`#${AUDIENCE_HASH[d.aud]}`}
                  style={{ "--d": `${0.95 + i * 0.1}s` } as React.CSSProperties}
                  className="lp-hero-in lp-btn group flex items-baseline justify-between gap-2 rounded-2xl border-2 border-line bg-white px-4 py-3 hover:border-pine hover:shadow-[0_8px_18px_-12px_rgba(12,61,40,0.5)] focus-visible:border-pine sm:block sm:px-3"
                >
                  <span className="block text-[16px] font-black leading-tight text-ink group-hover:text-pine-dark">{d.label}</span>
                  <span className="block text-[13px] leading-tight text-ink-soft sm:mt-0.5">{d.sub}</span>
                </a>
              ))}
            </div>
            {stats.problems > 0 && (
              <p className="lp-hero-in mt-5 max-w-[46ch] text-[14px] text-ink-soft" style={{ "--d": "1.3s" } as React.CSSProperties}>
                <b className="font-black text-ink" data-count={stats.topics.length}>{stats.topics.length}</b>{" "}
                {pluralRu(stats.topics.length, ["тема", "темы", "тем"])} профильного ЕГЭ,{" "}
                <b className="font-black text-ink" data-count={stats.skills}>{stats.skills}</b>{" "}
                {pluralRu(stats.skills, ["навык", "навыка", "навыков"])} и{" "}
                <b className="font-black text-ink" data-count={problemsRounded} data-suffix="+">
                  {problemsRounded.toLocaleString("ru-RU")}+
                </b>{" "}
                задач — от №1 до задач с параметром.
              </p>
            )}
          </div>
        </section>
      </header>

      <main>
        {/* Якоря для кнопок первого экрана: все три ведут к переключателю. */}
        <section className="relative mx-auto max-w-6xl px-4 py-16 sm:px-6 lg:py-24">
          {(Object.values(AUDIENCE_HASH) as string[]).map((h) => (
            <span key={h} id={h} className="absolute -top-2" aria-hidden />
          ))}
          <div data-reveal>
            <AudienceSwitcher initial={initial} studentPrice={studentPrice} />
          </div>
        </section>

        <section className="border-t border-line bg-white">
          <div className="mx-auto max-w-3xl px-4 py-16 sm:px-6">
            <h2 data-reveal className="text-[28px] font-black text-ink sm:text-[34px]">Частые вопросы</h2>
            <div className="mt-6 divide-y divide-line border-y border-line">
              {FAQ.map(([q, a], i) => (
                <details key={q} data-reveal style={{ "--i": i } as React.CSSProperties} className="lp-faq group py-1">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 py-4 text-[17px] font-extrabold text-ink [&::-webkit-details-marker]:hidden">
                    {q}
                    <span aria-hidden className="text-[22px] font-bold text-pine transition duration-300 group-open:rotate-45">
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
          <div data-reveal className="mx-auto flex max-w-6xl flex-col items-start gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
            <span className="lp-wave inline-block">
              <Mascot mood="happy" size={88} float={false} />
            </span>
            <div className="flex-1">
              <h2 className="max-w-[22ch] text-[28px] font-black leading-tight sm:text-[34px]">До ЕГЭ меньше года. Начните с одной задачи сегодня.</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              <a href="/register" className="lp-btn inline-flex h-12 items-center rounded-2xl bg-white px-5 text-[15px] font-black text-pine-darker hover:bg-pine-light">
                Я ученик
              </a>
              <a
                href="/register/teacher"
                className="lp-btn inline-flex h-12 items-center rounded-2xl border-2 border-white/40 px-5 text-[15px] font-black text-white hover:border-white"
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
