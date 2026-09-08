import nodemailer from "nodemailer";

/**
 * Универсальный SMTP-слой — намеренно не завязан на конкретного
 * провайдера (Rusender/Яндекс/любой другой). Все настройки — через
 * переменные окружения, поменять провайдера позже можно будет без
 * единой правки кода, только .env.local на сервере.
 */
export function isEmailConfigured(): boolean {
  return !!(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASSWORD);
}

let cachedTransporter: ReturnType<typeof nodemailer.createTransport> | null = null;

function getTransporter() {
  if (cachedTransporter) return cachedTransporter;
  cachedTransporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    // true только для порта 465 (implicit TLS) — большинство транзакционных
    // сервисов (в т.ч. Rusender) используют 587 со STARTTLS, где это должно
    // быть false, иначе соединение не установится вообще.
    secure: Number(process.env.SMTP_PORT || 587) === 465,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASSWORD,
    },
  });
  return cachedTransporter;
}

export async function sendEmail(params: { to: string; subject: string; html: string }): Promise<void> {
  if (!isEmailConfigured()) {
    // Не бросаем ошибку наружу — вызывающий код (регистрация, сброс
    // пароля) не должен падать целиком только из-за того, что email ещё
    // не настроен технически. Ссылки/токены всё равно создаются и
    // сохраняются в БД, просто письмо реально не уйдёт.
    console.warn("Email не настроен (SMTP_* переменные отсутствуют) — письмо не отправлено:", params.subject);
    return;
  }
  const transporter = getTransporter();
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: params.to,
    subject: params.subject,
    html: params.html,
  });
}

const BRAND_HEADER = `
  <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto">
    <p style="font-size:20px;font-weight:900;color:#0F5132;margin:0 0 24px">Планиметрика</p>
`;
const BRAND_FOOTER = `
    <p style="font-size:12px;color:#8A8F8C;margin-top:32px">
      Если вы не запрашивали это письмо — просто проигнорируйте его, никаких действий не потребуется.
    </p>
  </div>
`;

export async function sendVerificationEmail(email: string, token: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const link = `${appUrl}/verify-email?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Подтвердите email — Планиметрика",
    html: `${BRAND_HEADER}
      <p style="font-size:15px;color:#132A20">Подтвердите свой email, чтобы завершить регистрацию:</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#22C55E;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:800">
          Подтвердить email
        </a>
      </p>
      <p style="font-size:13px;color:#8A8F8C">Ссылка действительна 24 часа.</p>
      ${BRAND_FOOTER}`,
  });
}

export async function sendPasswordResetEmail(email: string, token: string): Promise<void> {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const link = `${appUrl}/reset-password?token=${token}`;
  await sendEmail({
    to: email,
    subject: "Восстановление пароля — Планиметрика",
    html: `${BRAND_HEADER}
      <p style="font-size:15px;color:#132A20">Запрошен сброс пароля для аккаунта на Планиметрике.</p>
      <p style="margin:24px 0">
        <a href="${link}" style="background:#22C55E;color:#fff;padding:12px 24px;border-radius:999px;text-decoration:none;font-weight:800">
          Придумать новый пароль
        </a>
      </p>
      <p style="font-size:13px;color:#8A8F8C">Ссылка действительна 1 час.</p>
      ${BRAND_FOOTER}`,
  });
}
