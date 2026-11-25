/**
 * Смоук-тест страниц: входит за каждую роль, открывает основные экраны на
 * телефоне и проверяет, что страница открылась без ошибки и без
 * горизонтальной прокрутки. Нужен запущенный сервер на ТЕСТОВОЙ базе:
 *   npm run test:db && npm run build && DATABASE_URL=$TEST_DATABASE_URL npx next start -p 3100
 *   BASE_URL=http://localhost:3100 npm run test:e2e
 */
import { chromium, type Page } from "playwright-core";
import assert from "node:assert/strict";
import { cleanup, makeHomework, makeUser, problems } from "../helpers";
import { hashPassword } from "../../lib/auth";
import { getUserById } from "../../lib/queries";

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
      ["/teacher/groups", /Группы/],
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

async function login(email: string, password = PW) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const p = await ctx.newPage();
  const errors: string[] = [];
  p.on("pageerror", (e) => errors.push(e.message));
  await p.goto(BASE + "/login");
  await p.fill('input[name="email"]', email);
  await p.fill('input[name="password"]', password);
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

async function checkUnlink() {
  const dbUrl = process.env.TEST_DATABASE_URL;
  assert.ok(dbUrl && /test/i.test(new URL(dbUrl).pathname), "Отвязку проверяем только на TEST_DATABASE_URL");
  process.env.DATABASE_URL = dbUrl;
  const password = "test-unlink-temporary";
  const personalPassword = "test-unlink-personal";
  const teacher = await makeUser({ role: "TEACHER", passwordHash: await hashPassword(password) });
  const student = await makeUser({
    email: `e2e-unlink-${Date.now()}@u.planimetrika.online`,
    teacherId: teacher.id,
    passwordHash: await hashPassword(password),
  });
  const loginName = student.email.split("@")[0];
  const [problem] = await problems(1);
  assert.ok(problem);
  const homework = await makeHomework({
    studentId: student.id, teacherId: teacher.id, problemIds: [problem.id], title: "Задание для проверки отвязки",
  });
  const t = await login(teacher.email, password);
  const st = await login(loginName, password);
  try {
    const card = BASE + `/teacher/student/${student.id}`;
    await t.p.goto(card);
    t.p.on("dialog", (dialog) => dialog.accept());
    st.p.on("dialog", (dialog) => dialog.accept());
    const detach = t.p.getByRole("button", { name: "Отвязать ученика" });
    await detach.click();
    await t.p.getByRole("alert").filter({ hasText: "задать свой пароль" }).waitFor();

    await st.p.goto(BASE + "/student/profile");
    await st.p.locator('input[name="currentPassword"]').fill(password);
    await st.p.locator('input[name="password"]').fill(personalPassword);
    await Promise.all([
      st.p.waitForURL("**/login"),
      st.p.getByRole("button", { name: "Сменить пароль" }).click(),
    ]);
    const stNew = await login(loginName, personalPassword);
    try {
      await stNew.p.goto(BASE + "/student/profile");
      stNew.p.on("dialog", (dialog) => dialog.accept());
      await stNew.p.getByRole("button", { name: "Запросить удаление аккаунта" }).click();
      await stNew.p.getByRole("button", { name: "Отменить запрос" }).waitFor();
      await Promise.all([
        t.p.waitForURL("**/teacher?ok=student_unlinked"),
        detach.click(),
      ]);
      assert.equal((await t.p.goto(card))?.status(), 404);
      assert.equal((await getUserById(student.id))?.teacherId, undefined);
      assert.ok((await getUserById(student.id))?.deletionRequestedAt);
      await stNew.p.goto(BASE + "/student/homework");
      await stNew.p.getByRole("link", { name: /Задание для проверки отвязки/ }).waitFor();
      assert.equal((await stNew.p.goto(BASE + `/student/homework/${homework}`))?.status(), 200);
      await stNew.p.goto(BASE + "/student/profile");
      await stNew.p.getByRole("button", { name: "Отменить запрос" }).click();
      await stNew.p.getByRole("button", { name: "Запросить удаление аккаунта" }).waitFor();
      assert.equal((await getUserById(student.id))?.deletionRequestedAt, undefined);
      const fresh = await login(loginName, personalPassword);
      await fresh.ctx.close();
    } finally {
      await stNew.ctx.close();
    }
    console.log("ok   веб-отвязка, передача пароля, задания и запрос удаления");
  } finally {
    await Promise.all([t.ctx.close(), st.ctx.close()]);
    await cleanup();
  }
}

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
  for (const api of ["/api/m/home", "/api/m/notifications", "/api/m/practice"]) {
    const r = await fetch(BASE + api);
    if (r.status === 401) console.log(`ok   аноним не получает ${api}`);
    else fail(`аноним получил ${api}: ${r.status}`);
  }
  await checkUnlink();
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
