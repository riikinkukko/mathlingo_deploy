# Архитектура Планиметрики

Карта модулей для тех, кто правит код (люди и Claude). Сначала общая картина, потом модули,
потом подводные камни. Ссылки вида `файл:функция`.

## 1. Общая картина

```
Браузер (Next.js App Router, React 19)          Мобильное приложение (Expo, mobile/)
   │ server actions (app/actions*.ts)               │ HTTP JSON + Bearer JWT (/api/m/*)
   ▼                                                ▼
 app/** страницы ──► lib/*-core, lib/*.ts ◄── app/api/m/** (тонкие обёртки)
                          │
                          ▼
              lib/queries.ts + lib/db/schema.ts (Drizzle) ──► Postgres

Фон: PM2-процесс planimetrika-tg (scripts/telegram-poller.ts) — Telegram long polling +
напоминания раз в 5 минут; системный cron → /api/cron/renew-teacher-subscriptions;
ЮKassa → /api/webhooks/yookassa.
```

- **Одна логика на сайт и приложение.** Отправка ответа — `lib/actions-core.ts:performSubmitAttempt`,
  урок — `lib/lesson-data.ts:getLessonData`, пробники — `lib/mock-queries.ts`, вопросы — `lib/questions-core.ts`.
  Server actions и `/api/m/*` только проверяют роль и вызывают их.
- **Все запросы к базе — в `lib/`** (в основном `lib/queries.ts`, 2500+ строк). Страницы Drizzle напрямую
  почти не трогают (исключения: `app/student/upgrade`, `components/mock/MockResults.tsx`).
- **Геймификация не хранится, а пересчитывается** из таблицы `attempts` при каждом открытии
  (XP, уровни, достижения, ошибки, цель дня). Хранятся только серия-заморозки, SRS и энергия.

## 2. Доступ и сессии

| Что | Где |
|---|---|
| Секрет JWT | `lib/session-secret.ts:getSessionSecret` (`SESSION_SECRET` ≥ 32 символов, в prod обязателен) |
| Токен | `lib/auth.ts:createSessionToken` — HS256, `{userId, role}`, 30 дней. Флаги (isAdmin, plan) в токен не кладутся |
| Cookie сайта | `mathapp_session`, httpOnly, lax |
| Текущий пользователь | `lib/auth.ts:getSessionUser` — читает БД, проверяет отзыв (`isSessionRevoked`: смена пароля / «выйти везде»). **При ошибке делает `redirect("/login")`, а не возвращает null** |
| Middleware | `middleware.ts` — только подпись JWT и роль по префиксу `/student`, `/teacher`, `/parent`. БД не видит. `/admin`, `/api`, `/pay`, `/onboarding` не покрывает |
| Админ | `lib/auth.ts:requireAdmin` — вызывается **в каждой** странице и экшене `app/admin/**` (в layout защиты нет) |
| Редактор курса | `lib/content-guard.ts:requireContentEditor` (TEACHER + `isPlatformOwner`/`isAdmin`) |
| Приложение | `lib/api-auth.ts:getBearerUser` — тот же JWT в `Authorization: Bearer`; обёртки `lib/mobile/api.ts:requireUser/requireStudent`. `/api/m/me` при каждом запуске выдаёт свежий токен |
| Из приложения на сайт | `lib/mobile/web-link.ts:createWebLink` (одноразовый токен на 2 мин) → `app/auth/app/route.ts` ставит cookie |

**Правила владения** проверяются вручную в каждом экшене/странице (единого хелпера нет):
- свой ученик: `student.role === "STUDENT" && student.teacherId === teacher.id` —
  `app/actions.ts:isOwnStudent`, `actions-schedule.ts:assertOwnsStudent`, `actions-student-payments.ts:ownsStudent`,
  `actions-student-goals.ts`, инлайн в `app/teacher/student/[id]/page.tsx` и др.;
- своя строка: `lesson.teacherId`, `payment.teacherId`, `q.teacherId === teacher.id`; группы — `lib/groups.ts:getGroupForTeacher`;
- родитель: `queries.isParentOf`;
- ученик и задача: `queries.canStudentAccessProblem(user, problem, source)` (ДЗ, Free-ограничения, авторские задачи).

**Функции `lib/queries.ts` сами доступ не проверяют** — это обязанность вызывающего кода.

Вход/регистрация: `lib/auth-flows.ts` (`passwordLogin`, `registerStudent`), лимиты — `lib/login-limits.ts`
(8 ошибок на email+IP за 15 мин, 30 на IP), 3 регистрации с IP в сутки. `registerTeacherAction` в
`app/actions.ts` — **отдельная копия** проверок регистрации.

## 3. База данных (`lib/db/schema.ts`, миграции `drizzle/`)

- **Программа:** `topics` → `subtopics` (глава) → `skills` (урок-навык, `theoryCards` jsonb) → `problems`
  (`answerType` NUMBER/CHOICE/DETAILED, `tier` core/bank, `diagram` jsonb, `hints`, `explanation`, `egeTaskNumber`).
  `problems.skillId = NULL` — авторская задача репетитора.
- **Пользователи:** одна таблица `users` на все роли; `teacherId` — самоссылка без FK. Там же план ученика
  (`plan`, `proUntil`, `energy`), тариф репетитора (`teacherPlan`, `teacherProUntil`, `teacherTrialUntil`, карта ЮKassa),
  Telegram, серия (`streakFreezes`, `freezeAwardedOn`), напоминания (`comebackStage`, `eveningRemindedOn`), цели.
- **Учёба:** `attempts` (неизменяемый журнал ответов, `source` lesson/assignment/review/mock, `reviewStatus`),
  `srs_states` (Лейтнер), `streak_freeze_days`, `attempt_images`, `mock_attempts`, `mock_images`.
- **Репетитор:** `homeworks` (строка на ученика, у групп общий `batchId`), `assignment_sessions`, `lesson_logs`,
  `scheduled_lessons`, `student_payments` (ручной учёт, не ЮKassa), `mock_scores`, `student_notes`,
  `student_questions`, `student_groups(+_members)`, `teacher_invites`, `parent_links`.
- **Платежи и прочее:** `payments` (ЮKassa, уникальный `yookassaPaymentId`), `review_orders`, `pay_requests`,
  `promo_codes`/`promo_redemptions`, `notifications`, `push_tokens`, `auth_tokens`, `app_login_tokens`,
  `login_failures`, `registration_attempts`.

Клиент — `lib/db/client.ts` (пул `pg` max 5, ленивый Proxy, чтобы скрипты успели прочитать `.env`).
Новая миграция: правим `schema.ts` → `npx drizzle-kit generate` → проверяем SQL → коммит. На проде
миграции применяет `scripts/deploy.sh`.

## 4. Ученик

### Страницы `app/student/*`
У раздела нет `layout.tsx`: каждая страница сама вызывает `getSessionUser()`. Обёртка навигационных
страниц — `components/StudentShell.tsx` (сайдбар `StudentSidebar` на компьютере, `BottomTabBar` +
`MobileAppBar` на телефоне).

| Страница | Суть |
|---|---|
| `page.tsx` | Дашборд: 14 запросов в одном `Promise.all`. Тема: `?topic=` → cookie → первая. Телефон: `StudentDashboardHeader` + `VerticalSkillPath`; компьютер: `HorizontalSkillPath` + `StudentRightColumn` |
| `skill/[id]` | Урок: `getLessonData` → `toPublicProblem` (без ответов) → `LessonFlow` |
| `review` | Повторение: `getDueReviewProblems` (≤ 15) → `ReviewFlow` |
| `mistakes` | `getMistakesForStudent`: «не решено» и «решено потом» |
| `homework/*` | ДЗ и контрольные: `AssignmentFlow` |
| `mock/*` | Пробники ЕГЭ (раздел 6) |
| `profile`, `achievements`, `program`, `subjects`, `questions`, `checks`, `upgrade` | Профиль, достижения, вся программа, выбор темы, вопросы репетитору, платные проверки, тарифы |

### Ответ на задачу
```
ProblemCard → app/actions.ts:submitAttemptAction → lib/actions-core.ts:performSubmitAttempt
  1. доступ canStudentAccessProblem; правила задания assignmentRules (таймер, без подсказок)
  2. первая попытка → spendEnergy (Free)
  3. DETAILED: есть репетитор → pending + уведомление; нет → self_checked + предложение платной проверки
  4. NUMBER/CHOICE: answersMatch → insert attempts → updateSrsState (lesson/review)
  5. навык закрыт → уведомление родителям; ошибка → подсказка, после 3 ошибок можно открыть решение
```
Сравнение ответов — `actions-core.ts:answersMatch` (запятая→точка, дроби, допуск 1e-9).

### Механики
- **Серия** — `lib/streak.ts`. День по Москве засчитан, если была **любая** попытка (даже неверная)
  или день заморожен. `settleStreak` автоматически тратит заморозки за пропуски (макс. 2, +1 за каждые 7 дней).
- **Энергия** (только Free без репетитора) — `lib/queries.ts`: 15 макс, +1 за 30 мин (лениво),
  тратится на первую попытку задачи; без подтверждённого email не восстанавливается.
- **XP** — `queries.ts:computeXp`: 10 за верную попытку + 30 за навык без ошибок; 6 уровней.
- **Цель дня** — `computeDailyGoal`: 3 задачи (фиксировано).
- **Достижения** — `lib/achievements.ts` + `getAchievementStats`, 7 линеек, пересчитываются при открытии.
- **Повторение (SRS)** — коробки 1/3/7/14/30 дней, ошибка → коробка 1. (`lib/review-item.ts` — это
  НЕ SRS, а карточка проверки для репетитора.)
- **Тарифы** — `lib/tariffs.ts`: Pro 249 ₽/30 дней, «До ЕГЭ» 1490 ₽ (ранняя цена 1190 ₽). Free:
  первая глава целиком + первый навык каждой главы, без DETAILED (`isSkillAccessibleOnFree`).
- **Напоминания:** `lib/student-reminders.ts` (вечер 19–21 МСК, Telegram + push),
  `lib/comeback-reminders.ts` (письма «возвращайся» через 20/68/164 ч простоя).

## 5. Контент (`scripts/seed.ts`, `scripts/content/*`)

- Всё собирается в память и пишется `commitToDatabase`: контент — upsert (никогда не удаляется),
  демо-пользователи — только в пустую базу.
- **Id детерминированные (`stableId`: `sk_N`, `p_N`).** Новые блоки — только в конец раздела, иначе
  сдвинутся id и прогресс учеников. Модули в `scripts/content/*` используют явные id (`<prefix>_<key>_<n>`).
- 13 тем. Номера ЕГЭ пересчитываются в формат 2027 (`toEge2027Numbers`, `normalizePlanimetryNumbers`).
- `tier: "bank"` — задача только для конструктора ДЗ, в уроке не показывается.
- Правка **существующих** задач на проде — миграцией с `UPDATE`.

## 6. Чертежи, черновик, пробники

### Чертежи `components/diagrams/*`
- `DiagramRenderer.tsx` по `spec.kind` (20 видов, тип `DiagramSpec` в `lib/types.ts`) выбирает компонент.
  Пропсы не типизированы — опечатка в seed даст чертёж со значениями по умолчанию без ошибки.
- Общие помощники и палитра `D` — `shared.tsx` (`fitPoints`, `angleArcPath`, `VertexLabel`…).
- **ABCD:** A левый нижний, B левый верхний, C правый верхний, D правый нижний (`RectangleShape`,
  `Parallelogram`, `Trapezoid`). У `BoxDiagram`/`PyramidDiagram` AD — переднее ребро.
- **В приложении** чертёж рендерится на сервере в строку SVG (`lib/mobile/diagram-svg.ts` +
  `svg-serialize.ts`). Поэтому в компонентах чертежей **нельзя хуки, контекст и Tailwind-классы** — только
  hex-цвета и атрибуты.
- `node scripts/dev/geometry-audit.js` проверяет координаты, но копии, а не сами компоненты.

### Черновик
- Модель — `lib/sketch.ts` (сайт) и **копия** `mobile/src/lib/sketch.ts` (приложение): править оба.
- UI — `components/diagrams/DiagramScratchpad.tsx`, хранение в localStorage `pm-sketch:v1:<problemId>`.
- Снимок для «Не понял» → `student_questions.sketch`, отдаёт `api/question-sketch/[id]` (только cookie).

### Пробники ЕГЭ
- Логика формата — `lib/mock-exam.ts` (20 заданий, №1–13 краткий, 33 первичных; режимы full/part1/free;
  вариант собирается детерминированно из пула по номеру). **Добавление задачи в банк меняет состав вариантов.**
- Сервер — `lib/mock-queries.ts` (`startMock`, `saveMockProgress`, `saveMockPhoto`, `finishMock` с защитой от
  двойной сдачи, `recomputeMock` → `mock_scores` для репетитора и родителя).
- UI — `components/mock/*` (`MockRunner` с автосохранением, `MockResults`, `SelfCheck`, `PhotoSlot`).
- Критерии ФИПИ — `lib/ege-criteria.ts`, баллы второй части — `lib/ege-points.ts`.

## 7. Репетитор и родитель

- Обёртка — `components/TeacherShell.tsx` (у `/teacher` нет layout). Главная `app/teacher/page.tsx`,
  карточка ученика `app/teacher/student/[id]/page.tsx` (ДЗ, журнал, оплаты, родители, пробники, заметки).
- **ДЗ:** `createHomeworkAction` (банк + свои задачи), быстрое ДЗ — `actions-quick-homework.ts` + `lib/quick-homework.ts`.
- **Проверка развёрнутых:** `components/review/ReviewWorkspace.tsx` (пометки на фото — `lib/review-markup.ts`) →
  `reviewAttemptAction`.
- **Расписание:** `app/actions-schedule.ts` (серии, группы, перенос), отметка «было/не было» — `lib/lesson-status.ts:applyLessonStatus`
  (общая для сайта и Telegram-кнопок), время — `lib/lesson-time.ts` (МСК).
- **Учёт оплат учеников** (деньги мимо платформы): `app/actions-student-payments.ts`, баланс —
  `queries.ts:getStudentBalances`, напоминания — `lib/payment-reminders.ts`.
- **Тарифы репетитора:** `lib/teacher-plan.ts` (бесплатно 3 ученика; «Репетитор» 690 ₽ до 15; «Профи» 1290 ₽;
  пробный 14 дней), приглашения — `lib/teacher-invites.ts`.
- **Родитель:** `app/parent/child/[id]` (проверка `isParentOf`), создаётся репетитором (`addParentLinkAction`),
  недельный отчёт — `lib/parent-weekly.ts` (вс 19–23 МСК).

## 8. Платежи ЮKassa

```
app/actions-payments.ts: createYooKassaPayment → createPendingPayment → redirect на оплату
ЮKassa → app/api/webhooks/yookassa: проверка IP → перезапрос статуса getYooKassaPayment → сверка суммы
       → queries.ts:markPaymentSucceeded (атомарный захват статуса в транзакции)
           student_pro  → +дни к proUntil (exam → до EXAM_ACCESS_UNTIL)
           teacher_pro  → продление teacherProUntil, сохранение карты (только isRecurringSetup)
           review_check → заказ платной проверки оплачен
```
- Автопродление репетитора: cron → `app/api/cron/renew-teacher-subscriptions` (`CRON_SECRET`).
- Промокоды — `lib/promo.ts`, рефералы — `lib/referral-rules.ts`, оплата родителем по ссылке — `lib/pay-requests.ts` + `/pay/[token]`.
- Платная проверка эксперта — `lib/paid-review.ts`.

## 9. Уведомления, Telegram, почта, фон

- **Единая точка:** `queries.ts:pushNotification(tx, …)` — запись в колокольчик + Expo push (`lib/push.ts`) + Telegram.
- **Telegram:** `lib/telegram.ts`, обработка — `lib/telegram-updates.ts`, кнопки репетитора — `lib/teacher-telegram.ts`.
  Основной канал — long polling в `scripts/telegram-poller.ts` (PM2 `planimetrika-tg`), вебхук — запасной.
- **Фоновые задачи (poller, раз в 5 мин):** напоминания о занятиях, вопрос «было ли занятие», утренняя сводка
  репетитору, недельный отчёт родителю, вечерние напоминания ученику, письма о пробном периоде, письма «возвращайся».
  Все сначала атомарно «забирают» строки через `UPDATE … RETURNING`.
- **Почта:** `lib/email.ts` (nodemailer, без SMTP тихо не шлёт), правила — `lib/email-rules.ts`.
- **Ошибки:** `instrumentation-node.ts` → `lib/alerts.ts:reportError` (Telegram владельцу).

## 10. Мобильное приложение (`mobile/`)

- Expo SDK 58, expo-router, React Query с офлайн-кэшем (AsyncStorage). Версия `2.1.0`, `versionCode` 21 (`app.json`).
- Роуты: `(auth)` login/register; `(tabs)` Путь, Повтор, Пробники, Ошибки, Профиль; `skill/[id]`, `mock/[id]`,
  `homework/*`, `topics`, `achievements`, `questions`, `notifications`.
- **Репетитор** — `teacher/*` (вкладки Ученики, Расписание, Проверка, Оплаты, Ещё + экраны ученика, занятия,
  оплаты, группы, задания, вопросы, настройки). Данные — `GET /api/m/teacher/data?view=…`
  (`lib/mobile/teacher-data.ts`), действия — `POST /api/m/teacher/action {name, fields}`
  (`lib/mobile/teacher-actions.ts`): вызывает ТЕ ЖЕ server actions сайта от имени владельца токена
  (`lib/auth.ts:runAsUser`), ошибки-редиректы `?error=код` переводятся в текст. Новое действие репетитора
  в приложении = строка в белом списке `TEACHER_ACTIONS`.
- **Родитель** — `parent/*`, данные `GET /api/m/parent` (`lib/mobile/parent-data.ts`), недельный отчёт — `POST`.
- API — `mobile/src/lib/api.ts` (Bearer, тайм-аут 20 с); токен в SecureStore.
- **Офлайн-ответы:** `attempt-queue.ts` проверяет ответ по отпечатку `answerFingerprint` (копия `lib/answer-key.ts` —
  менять оба, их сверяет тест) и отправляет при появлении сети.
- **Push:** `mobile/src/lib/push.ts` → `/api/m/push-token`; нажатие → `routeForLink`.
- **Оплаты в приложении нет.** Pro только упоминается.
- Старая обёртка Capacitor и старые `/api/{attempts,dashboard,notifications,curriculum,auth}` удалены
  (ноябрь 2026): приложение ходит только в `/api/m/*`.
- Веб-сборка для проверки: `cd mobile && npx expo export --platform web` → `mobile/dist`. У `/api/m/*` нет CORS —
  веб-сборка работает только с того же адреса, что и API.

## 11. Публичные страницы

- `app/page.tsx` (гость → `components/landing/Landing.tsx`, вошедший → свой кабинет), `repetitoram`, `uchenikam`,
  `roditelyam` (тот же лендинг с другой вкладкой), `tariffs`, `sitemap.ts`, `robots.ts`.
- Аналитика — `components/Analytics.tsx` + `lib/ym.ts` (Яндекс Метрика, если задан `NEXT_PUBLIC_YM_COUNTER_ID`).
- `app/legal/*` и `components/PublicFooter.tsx` — **не трогать**.

## 12. Тесты и CI

- `tests/unit/*.test.ts` — node:test на настоящей тестовой базе (`tests/setup.ts` подменяет `DATABASE_URL`,
  отключает Telegram, почту, push, ЮKassa). Хелперы — `tests/helpers.ts`.
- `tests/e2e/smoke.ts` — Playwright: вход за каждую роль, основные страницы на телефоне, нет ли ошибок и
  горизонтальной прокрутки, запрещённые адреса.
- `.github/workflows/deploy.yml`: test (Postgres 16, test:db, test, build, smoke) → deploy по SSH → `scripts/deploy.sh`.

## 13. Подводные камни

**Доступ**
1. Проверка владения учеником скопирована во многих местах, `lib/queries.ts` ничего не проверяет. Новый экшен
   или страница без такой проверки откроет чужие данные.
2. Страница под `/teacher`, `/admin` без `getSessionUser()`/`requireAdmin()` пропустит отозванную сессию
   (middleware БД не видит, у `/admin` нет защиты в layout).
3. `getSessionUser()` делает redirect, поэтому `getSessionUser() ?? getBearerUser()` при плохой cookie даст 307, а не 401.
4. `mapUser` возвращает `passwordHash` — не передавать объект `User` целиком в клиентские компоненты и JSON.
5. ~~После смены репетитора новый видел данные прежнего~~ — исправлено: в карточке ученика оплаты, журнал,
   пробники, заметки, ДЗ и занятия фильтруются по `teacherId`; у `student_notes` ключ (ученик, репетитор).
   Новая функция «по studentId» для кабинета репетитора — тоже фильтровать по репетитору.
6. ~~`reviewAttemptAction` позволял перепроверить автоматический ответ~~ — теперь только развёрнутые решения на проверке.

**Деньги**
7. ~~Быстрый вебхук автопродления не находил платёж~~ — исправлено (`lib/renewal.ts`): cron сам засчитывает
   мгновенно оплаченный платёж, вебхук восстанавливает запись по метаданным; запись идемпотентна.
8. ~~Отклонённое автопродление повторялось каждый день~~ — теперь 3 попытки (сразу, через день, через 2 дня),
   репетитор получает уведомление (`lib/renewal-rules.ts`, `users.renewal_failures`).
9. ~~`pushNotification` слал push и Telegram до коммита~~ — теперь `deliverWhenCommitted` ждёт, пока запись
   уведомления станет видна (до ~5 с), и при откате ничего не шлёт.

**Логика**
10. Цель дня считается по UTC, а серия — по МСК (с 0 до 3 ночи по Москве цель дня «вчерашняя»).
11. ~~XP на экране «урок пройден» расходился с сервером~~ — теперь 10 за задачу, решённую в этом заходе.
12. «Мои ошибки» включают задачи из ДЗ/пробников/банка, но ссылка ведёт в урок, где этой задачи может не быть.
13. ~~`MathKeyboard` вставлял `√ π sin`~~ — остались «−», «,», «/»: ответ части 1 всегда число или дробь.
14. Нормализация ответа написана трижды (`actions-core`, `lib/answer-key.ts`, `mobile/src/lib/answer-key.ts`).
15. `settleStreak` (тратит заморозки, пишет уведомления) вызывается из простого чтения серии.
16. ~~Офлайн-попытки получали время синхронизации~~ — приложение шлёт `answeredAt`, сервер принимает его
    для урока/повторения не старше 3 суток (`actions-core.ts:offlineAnswerTime`).

**Производительность**
17. `computeXp`, `getAchievementStats`, `getMistakesForStudent`, `computeStudentProgress` читают всю таблицу
    `problems` и все попытки ученика; `StudentShell` зовёт `getMistakesForStudent` на каждой странице.
18. `assignmentRules` на каждый ответ перебирает ДЗ, где есть эта задача (обычно 0–1 — не проблема).
    Замер (ноябрь 2026, 1189 задач): `/api/m/home` ≈ 0,1 с, остальное < 0,04 с — оптимизировать пока незачем.

**Дубли кода, которые надо править вместе**
19. `lib/sketch.ts` ↔ `mobile/src/lib/sketch.ts`; `lib/answer-key.ts` ↔ `mobile/src/lib/answer-key.ts`;
    `PART1_LAST` в `lib/mock-exam.ts` ↔ `mobile/src/lib/mock-format.ts`; регистрация в `auth-flows.ts` ↔ `registerTeacherAction`.
20. Цены репетитора в FAQ лендинга записаны текстом, а не берутся из `lib/teacher-plan.ts`.

**Мобильное приложение**
21. Из профиля приложения (`openOnSite('/student/profile')`) на сайте видны ссылки на `/student/upgrade` —
    теоретический путь к оплате из Android-приложения.
