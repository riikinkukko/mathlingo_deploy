// Создание учеников репетитором: по одному (форма) и списком (импорт из таблицы).
// Email ученика не обязателен: многие репетиторы знают только телефоны мам.
// Без email ученику выдаётся логин вида ivan.ivanov.4821@u.planimetrika.online —
// по нему и паролю ученик входит; писем на такие адреса не отправляем
// (lib/email.ts:isLoginOnlyEmail).
import { randomInt } from "node:crypto";
import { db } from "./db/client";
import * as schema from "./db/schema";
import { genId, getUserByEmail } from "./queries";
import { hashPassword } from "./auth";
import { generatePassword } from "./secure-random";
import type { User } from "./types";

export const LOGIN_DOMAIN = "u.planimetrika.online";

const TR: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l", м: "m",
  н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "h", ц: "ts", ч: "ch", ш: "sh", щ: "sch",
  ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya",
};

export function translitLogin(name: string): string {
  const base = name
    .toLowerCase()
    .split("")
    .map((c) => (c in TR ? TR[c] : /[a-z0-9]/.test(c) ? c : c === " " || c === "-" ? "." : ""))
    .join("")
    .replace(/\.+/g, ".")
    .replace(/^\.|\.$/g, "")
    .slice(0, 30);
  return base || "student";
}

async function freeLogin(name: string): Promise<string> {
  const base = translitLogin(name);
  for (let i = 0; i < 20; i++) {
    const email = `${base}.${randomInt(1000, 9999)}@${LOGIN_DOMAIN}`;
    if (!(await getUserByEmail(email))) return email;
  }
  return `${base}.${Date.now().toString(36)}@${LOGIN_DOMAIN}`;
}

export interface NewStudentInput {
  name: string;
  email?: string | null;
  password?: string | null;
  grade?: number | null;
  lessonPriceRub?: number | null;
}

export type NewStudentResult =
  | { ok: true; studentId: string; name: string; email: string; password: string; loginOnly: boolean }
  | { ok: false; error: string; existing?: User };

/** Разобрать класс и цену из строк формы/таблицы. */
export function parseGrade(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/\D/g, ""));
  return n >= 5 && n <= 11 ? n : null;
}
export function parsePrice(v: unknown): number | null {
  const n = Number(String(v ?? "").replace(/[^\d]/g, ""));
  return n >= 100 && n <= 100_000 ? n : null;
}

/**
 * Создать ученика репетитора. Проверки тарифа и согласия — у вызывающего.
 * Если email уже занят — возвращает existing (форма отправит приглашение).
 */
export async function createStudentForTeacher(teacher: Pick<User, "id">, input: NewStudentInput): Promise<NewStudentResult> {
  const name = input.name.trim().slice(0, 80);
  if (name.length < 2) return { ok: false, error: "Укажите имя ученика" };
  let email = (input.email ?? "").trim().toLowerCase().slice(0, 254);
  if (email) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 200) return { ok: false, error: `Проверьте email: ${email}` };
    const existing = await getUserByEmail(email);
    if (existing) return { ok: false, error: "Email уже зарегистрирован", existing };
  }
  const loginOnly = !email;
  if (loginOnly) email = await freeLogin(name);
  const password = (input.password ?? "").trim() || generatePassword();
  const studentId = genId("u");
  await db.insert(schema.users).values({
    id: studentId,
    name,
    email,
    passwordHash: await hashPassword(password),
    role: "STUDENT",
    teacherId: teacher.id,
    consentGivenAt: new Date(),
    // Логин без почты подтверждать нечем — не показываем ученику «подтверди email».
    emailVerifiedAt: loginOnly ? new Date() : null,
    grade: input.grade ?? null,
    lessonPriceRub: input.lessonPriceRub ?? null,
  });
  return { ok: true, studentId, name, email, password, loginOnly };
}

export interface ImportRow {
  line: number;
  name: string;
  email: string | null;
  grade: number | null;
  price: number | null;
  error?: string;
}

/**
 * Разобрать список, вставленный из таблицы: строка — ученик, колонки через
 * табуляцию, «;» или «,»: имя, затем в любом порядке email, класс, цена.
 * Первая строка-заголовок («Имя», «ФИО»…) пропускается.
 */
export function parseImport(text: string): ImportRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean).slice(0, 200);
  const rows: ImportRow[] = [];
  lines.forEach((l, i) => {
    const cells = l.split(/\t|;|,(?=\s*\S)/).map((c) => c.trim()).filter((c) => c !== "");
    if (!cells.length) return;
    if (i === 0 && /^(имя|фио|ученик|name)/i.test(cells[0])) return;
    const row: ImportRow = { line: i + 1, name: cells[0].slice(0, 80), email: null, grade: null, price: null };
    for (const c of cells.slice(1)) {
      if (c.includes("@")) row.email = c.toLowerCase();
      else if (/^\d{1,2}(\s*(кл|класс)\.?)?$/i.test(c) && parseGrade(c)) row.grade = parseGrade(c);
      else if (parsePrice(c)) row.price = parsePrice(c);
    }
    if (row.name.length < 2 || /\d{5,}/.test(row.name)) row.error = "Не похоже на имя";
    else if (row.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(row.email)) row.error = "Неверный email";
    rows.push(row);
  });
  return rows;
}
