"use client";

import { useEffect, useRef, useState } from "react";
import { ymGoal } from "@/lib/ym";

import { AUDIENCE_HASH, type Audience } from "./audience";

const TABS: { key: Audience; label: string }[] = [
  { key: "tutor", label: "Репетитору" },
  { key: "student", label: "Ученику" },
  { key: "parent", label: "Родителю" },
];

interface Shot {
  src: string;
  alt: string;
}

interface Panel {
  title: string;
  lead: string;
  points: string[];
  shots: [Shot, Shot, Shot?];
  note: string;
}

function Phone({ shot, className = "", priority = false }: { shot: Shot; className?: string; priority?: boolean }) {
  return (
    <div className={`overflow-hidden rounded-[22px] border-[5px] border-ink bg-ink shadow-[0_20px_40px_-24px_rgba(12,61,40,0.55)] sm:rounded-[28px] sm:border-[6px] ${className}`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={shot.src}
        alt={shot.alt}
        width={540}
        height={909}
        loading="eager"
        fetchPriority={priority ? "high" : "auto"}
        decoding="async"
        className="block h-auto w-full rounded-[17px] sm:rounded-[22px]"
      />
    </div>
  );
}

/** Подпись «красной ручкой» со стрелкой к экрану. */
function HandNote({ children }: { children: React.ReactNode }) {
  return (
    <div aria-hidden className="pointer-events-none absolute right-0 top-0 z-10 flex max-w-[56%] items-start gap-1">
      <svg viewBox="0 0 60 50" className="mt-4 h-10 w-12 shrink-0 text-coral">
        <path d="M 56 6 C 38 4, 18 14, 10 40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" />
        <path d="M 4 30 L 10 42 L 20 34" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="-rotate-2 font-hand text-[21px] font-bold leading-[1.05] text-coral sm:text-[26px]">{children}</span>
    </div>
  );
}

export default function AudienceSwitcher({
  initial = "tutor",
  studentPrice,
}: {
  initial?: Audience;
  studentPrice: number;
}) {
  const [aud, setAud] = useState<Audience>(initial);
  // Бегунок под активной вкладкой: ширина и сдвиг меряются по самим кнопкам.
  const tabRefs = useRef<Partial<Record<Audience, HTMLButtonElement | null>>>({});
  const [thumb, setThumb] = useState<{ x: number; w: number } | null>(null);
  useEffect(() => {
    function measure() {
      const el = tabRefs.current[aud];
      if (el) setThumb({ x: el.offsetLeft, w: el.offsetWidth });
    }
    measure();
    window.addEventListener("resize", measure);
    return () => window.removeEventListener("resize", measure);
  }, [aud]);

  // Ссылки вида /#roditelyam (кнопки первого экрана, реклама) переключают вкладку.
  useEffect(() => {
    function fromHash() {
      const h = window.location.hash.replace("#", "");
      const found = (Object.keys(AUDIENCE_HASH) as Audience[]).find((k) => AUDIENCE_HASH[k] === h);
      if (found) setAud(found);
    }
    fromHash();
    window.addEventListener("hashchange", fromHash);
    return () => window.removeEventListener("hashchange", fromHash);
  }, []);

  const panels: Record<Audience, Panel & { cta: React.ReactNode; extra?: React.ReactNode; hand: string }> = {
    tutor: {
      title: "Кабинет репетитора вместо тетрадки, таблицы и пяти чатов",
      lead: "Ученики решают в приложении — вы видите каждую задачу и тратите время на объяснение, а не на учёт.",
      points: [
        "Расписание неделей: индивидуальные и групповые занятия, время начала и конца",
        "Домашка всей группе одной кнопкой — или каждому ученику своя",
        "Развёрнутые решения на фото: пометки ручкой прямо на снимке",
        "Оплаты в рублях, долги и напоминания родителям",
        "Telegram-бот: кто пришёл на занятие, отмечаете прямо в чате",
        "Кабинет родителя с вашими отчётами после урока",
      ],
      shots: [
        { src: "/landing/tutor-schedule.webp", alt: "Расписание репетитора на неделю с занятиями учеников и группы" },
        { src: "/landing/tutor-markup.webp", alt: "Разметка фото решения: галочки и замечания красной ручкой" },
        { src: "/landing/tutor-group-hw.webp", alt: "Домашка группы: прогресс каждого ученика" },
      ],
      hand: "группа — одним блоком",
      note: "До 3 учеников — бесплатно навсегда. «Репетитор» — 690 ₽ в месяц до 15 учеников, «Профи» — 1 290 ₽ без лимита. После регистрации — 14 дней «Профи» бесплатно.",
      cta: (
        <>
          <a
            href="/register/teacher"
            onClick={() => ymGoal("landing_cta_tutor")}
            className="lp-btn inline-flex h-12 items-center justify-center rounded-2xl bg-pine px-6 text-[15px] font-black text-white shadow-[0_3px_0_#0E5E3A] hover:bg-pine-dark"
          >
            Попробовать 14 дней бесплатно
          </a>
          <a href="/tariffs" className="inline-flex h-12 items-center justify-center rounded-2xl px-4 text-[15px] font-black text-pine-dark hover:bg-pine-light">
            Все тарифы
          </a>
        </>
      ),
      extra: (
        <ol className="mt-8 grid gap-3 sm:grid-cols-2">
          {[
            ["Регистрируетесь", "по email, без карты"],
            ["Добавляете учеников", "им приходит логин и пароль"],
            ["Ставите занятия и задаёте ДЗ", "из банка задач ЕГЭ или своими номерами"],
            ["Видите каждую решённую задачу", "и проверяете вторую часть по фото"],
          ].map(([t, s], i) => (
            <li key={t} className="flex gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-pine text-[14px] font-black text-pine-dark">
                {i + 1}
              </span>
              <span>
                <span className="block text-[15px] font-extrabold leading-tight text-ink">{t}</span>
                <span className="text-[13px] text-ink-soft">{s}</span>
              </span>
            </li>
          ))}
        </ol>
      ),
    },
    student: {
      title: "Пять минут в день — и задачи ЕГЭ перестают пугать",
      lead: "Как Дуолинго, только с профильной математикой: короткие уроки, серия дней и цель на день.",
      points: [
        "Уроки по навыкам — от простого к экзаменационному уровню",
        "Подсказка, если застрял, и разбор после ответа",
        "Черновик прямо на чертеже: проводи медианы и высоты",
        "Ошибки возвращаются на повторение, пока не закрепятся",
        "Вторую часть можно сфотографировать — репетитор проверит",
      ],
      shots: [
        { src: "/landing/student-home.webp", alt: "Главный экран ученика: цель дня, ближайшее занятие и урок" },
        { src: "/landing/student-sketch.webp", alt: "Черновик на чертеже задачи с построенной медианой" },
        { src: "/landing/student-review.webp", alt: "Ученик видит пометки репетитора на своём решении" },
      ],
      hand: "цель дня и серия",
      note: `Бесплатно — первая глава каждой темы и до 15 новых задач за раз (энергия восстанавливается). Pro — ${studentPrice.toLocaleString("ru-RU")} ₽ в месяц: все главы, вторая часть и без ограничений.`,
      cta: (
        <a
          href="/register"
          onClick={() => ymGoal("landing_cta_student")}
          className="lp-btn inline-flex h-12 items-center justify-center rounded-2xl bg-pine px-6 text-[15px] font-black text-white shadow-[0_3px_0_#0E5E3A] hover:bg-pine-dark"
        >
          Начать бесплатно
        </a>
      ),
    },
    parent: {
      title: "Видно, занимается ли ребёнок, — без расспросов за ужином",
      lead: "Отдельный кабинет родителя: всё, что важно, на одном экране.",
      points: [
        "Сколько дней в неделю занимался и сколько задач решил",
        "Сдана ли домашка и когда ближайший срок",
        "Ближайшее занятие и отчёт репетитора после урока",
        "Цель по баллам и результат последнего пробника",
        "Баланс оплат занятий",
      ],
      shots: [{ src: "/landing/parent-home.webp", alt: "Кабинет родителя: неделя занятий, цель по ЕГЭ, домашка и отчёт репетитора" }, { src: "/landing/tutor-student.webp", alt: "Карточка ученика у репетитора" }],
      hand: "всё за минуту",
      note: "Кабинет родителя подключает репетитор, если он занимается с ребёнком в Планиметрике. Если репетитор работает по-старому — отправьте ему ссылку: для небольшой группы учеников это бесплатно.",
      cta: (
        <>
          <ShareTutorButton />
          <a
            href="/register"
            onClick={() => ymGoal("landing_cta_parent_child")}
            className="inline-flex h-12 items-center justify-center rounded-2xl px-4 text-[15px] font-black text-pine-dark hover:bg-pine-light"
          >
            Ребёнок будет заниматься сам
          </a>
        </>
      ),
    },
  };

  const p = panels[aud];

  return (
    <div>
      <div className="flex justify-center">
        <div role="tablist" aria-label="Для кого" className="relative inline-flex rounded-2xl border border-line bg-white p-1">
          {thumb && (
            <span
              aria-hidden
              className="lp-tab-thumb absolute left-0 top-1 h-11 rounded-xl bg-pine-darker"
              style={{ width: thumb.w, transform: `translateX(${thumb.x}px)` }}
            />
          )}
          {TABS.map((t) => (
            <button
              key={t.key}
              ref={(el) => {
                tabRefs.current[t.key] = el;
              }}
              id={`lp-tab-${t.key}`}
              role="tab"
              type="button"
              aria-selected={aud === t.key}
              aria-controls="lp-panel"
              onClick={() => {
                setAud(t.key);
                history.replaceState(null, "", `#${AUDIENCE_HASH[t.key]}`);
              }}
              className={`relative z-[1] h-11 rounded-xl px-3.5 text-[15px] font-black transition-colors duration-300 sm:px-6 ${
                aud === t.key ? `text-white ${thumb ? "" : "bg-pine-darker"}` : "text-ink-soft hover:text-ink"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div id="lp-panel" role="tabpanel" aria-labelledby={`lp-tab-${aud}`} key={aud} className="mt-10 grid items-start gap-8 lg:grid-cols-[1.05fr_1fr] lg:grid-rows-[auto_1fr] lg:gap-x-14">
        <div className="lp-panel-in">
          <h2 className="max-w-[18ch] text-[30px] font-black leading-[1.08] text-ink sm:text-[40px]">{p.title}</h2>
          <p className="mt-4 max-w-[52ch] text-[17px] leading-relaxed text-ink-soft">{p.lead}</p>
        </div>
        <div className="relative mx-auto w-full max-w-[460px] pt-[68px] lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:sticky lg:top-6">
          {/* z-20: обёртка с анимацией — свой слой, подпись должна быть поверх телефонов */}
          <div className="lp-panel-in pointer-events-none absolute inset-0 z-20" style={{ "--i": 4 } as React.CSSProperties}>
            <HandNote>{p.hand}</HandNote>
          </div>
          <div className="relative aspect-[100/80]">
            {p.shots[1] && <Phone shot={p.shots[1]} className="lp-fan-l absolute left-0 top-[6%] w-[44%] -rotate-[5deg]" />}
            {p.shots[2] && <Phone shot={p.shots[2]} className="lp-fan-r absolute right-0 top-[6%] w-[44%] rotate-[5deg]" />}
            <div className={`lp-fan-c absolute top-0 w-[48%] ${p.shots[2] ? "left-[26%]" : "left-[40%]"}`}>
              <div className="lp-bob">
                <Phone shot={p.shots[0]} priority />
              </div>
            </div>
          </div>
        </div>
        <div className="lg:-mt-4">
          <ul className="mt-6 space-y-3">
            {p.points.map((pt, i) => (
              <li key={pt} className="lp-panel-in flex gap-3 text-[16px] leading-snug text-ink" style={{ "--i": i + 1 } as React.CSSProperties}>
                <svg aria-hidden viewBox="0 0 20 20" className="lp-check mt-0.5 h-5 w-5 shrink-0 text-pine" style={{ "--i": i } as React.CSSProperties}>
                  <path d="M4 10.5 8.2 14.5 16 5.5" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" pathLength={1} />
                </svg>
                {pt}
              </li>
            ))}
          </ul>
          <div className="lp-panel-in" style={{ "--i": p.points.length + 1 } as React.CSSProperties}>
            <p className="mt-6 max-w-[56ch] rounded-2xl bg-pine-light/70 px-4 py-3 text-[14px] leading-relaxed text-pine-darker">{p.note}</p>
            <div className="mt-5 flex flex-wrap items-center gap-2">{p.cta}</div>
            {p.extra}
          </div>
        </div>

      </div>
    </div>
  );
}

/** «Отправить ссылку репетитору»: системное меню «Поделиться» или копирование. */
function ShareTutorButton() {
  const [copied, setCopied] = useState(false);
  async function share() {
    ymGoal("landing_share_tutor");
    const url = `${window.location.origin}/repetitoram`;
    const text = "Посмотрите Планиметрику — расписание, домашки и проверка заданий ЕГЭ в одном кабинете.";
    try {
      if (navigator.share) {
        await navigator.share({ title: "Планиметрика", text, url });
        return;
      }
      await navigator.clipboard.writeText(`${text} ${url}`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch {
      /* пользователь закрыл меню — ничего не делаем */
    }
  }
  return (
    <button
      type="button"
      onClick={share}
      className="lp-btn inline-flex h-12 items-center justify-center rounded-2xl bg-pine px-6 text-[15px] font-black text-white shadow-[0_3px_0_#0E5E3A] hover:bg-pine-dark"
    >
      {copied ? "Ссылка скопирована" : "Отправить ссылку репетитору"}
    </button>
  );
}
