/**
 * Смоук-тест страниц: входит за каждую роль, открывает основные экраны на
 * телефоне и проверяет, что страница открылась без ошибки и без
 * горизонтальной прокрутки. Нужен запущенный сервер на ТЕСТОВОЙ базе:
 *   npm run test:db && npm run build && DATABASE_URL=$TEST_DATABASE_URL npx next start -p 3100
 *   BASE_URL=http://localhost:3100 npm run test:e2e
 */
import { chromium, type Page } from "playwright-core";

const BASE = process.env.BASE_URL ?? "http://localhost:3100";
const PW = process.env.DEMO_PASSWORD ?? "demo1234";

const ROLES: { email: string; pages: [string, RegExp][] }[] = [
  {
    email: "student@demo.ru",
    pages: [
      ["/student", /Цель дня/],
      ["/student/review", /Повтор/],
      ["/student/homework", /задани|Домашн/i],
      ["/student/homework/h_1", /Задача 1 из/],
      ["/student/mistakes", /ошибк/i],
      ["/student/profile", /Эта неделя/],
      ["/student/skill/sk_1", /Теория|задача|Дальше/i],
      ["/student/subjects", /Планиметрия/],
    ],
  },
  { email: "free@demo.ru", pages: [["/student", /Цель дня/], ["/student/upgrade", /pro/i]] },
  {
    email: "teacher@demo.ru",
    pages: [
      ["/teacher", /Мои ученики/],
      ["/teacher/schedule", /Запланировать/],
      ["/teacher/payments", /Балансы/],
      ["/teacher/student/u_2", /Максим/],
      ["/teacher/homework/new?studentId=u_2", /задачи из банка/i],
      ["/teacher/settings", /Telegram/],
    ],
  },
  { email: "parent@demo.ru", pages: [["/parent/child/u_2", /эта неделя/i]] },
];

// Куда пускать нельзя: [кто, адрес] → должен быть 404 или редирект в свой кабинет.
const FORBIDDEN: [string, string][] = [
  ["student2@demo.ru", "/student/homework/h_1"],
  ["parent@demo.ru", "/parent/child/u_4"],
  ["student@demo.ru", "/teacher/student/u_2"],
];

let failures = 0;
const fail = (m: string) => {
  failures++;
  console.log("FAIL " + m);
};

async function login(email: string) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/login");
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', PW);
  await Promise.all([p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }), p.click('main button[type="submit"], form button[type="submit"]')]);
  return { p, errors, ctx };
}

async function check(p: Page, errors: string[], path: string, expect: RegExp, who: string) {
  errors.length = 0;
  const res = await p.goto(BASE + path, { waitUntil: "load" });
  const status = res?.status() ?? 0;
  await p.waitForTimeout(300);
  const body = await p.locator("body").innerText();
  const wide = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if (status >= 400) return fail(`${who} ${path}: HTTP ${status}`);
  if (!expect.test(body)) return fail(`${who} ${path}: нет текста ${expect}`);
  if (wide) return fail(`${who} ${path}: горизонтальная прокрутка`);
  if (errors.length) return fail(`${who} ${path}: ошибка в браузере — ${errors[0]}`);
  console.log(`ok   ${who} ${path}`);
}

let browser: Awaited<ReturnType<typeof chromium.launch>>;

async function main() {
  browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined });
  try {
  for (const r of ROLES) {
    const { p, errors, ctx } = await login(r.email);
    for (const [path, re] of r.pages) await check(p, errors, path, re, r.email);
    await ctx.close();
  }
  for (const [email, path] of FORBIDDEN) {
    const { p, ctx } = await login(email);
    const res = await p.goto(BASE + path);
    const blocked = res?.status() === 404 || !new URL(p.url()).pathname.startsWith(path.split("?")[0]);
    if (blocked) console.log(`ok   ${email} не пускают на ${path}`);
    else fail(`${email} открыл чужую страницу ${path}`);
    await ctx.close();
  }
  for (const api of ["/api/dashboard", "/api/notifications", "/api/curriculum"]) {
    const r = await fetch(BASE + api);
    if (r.status === 401) console.log(`ok   аноним не получает ${api}`);
    else fail(`аноним получил ${api}: ${r.status}`);
  }
  } finally {
    await browser.close();
  }
  console.log(failures ? `\n✗ Ошибок: ${failures}` : "\n✓ Все страницы в порядке");
  process.exit(failures ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
