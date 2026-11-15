import { runAsUser } from "@/lib/auth";
import { json, requireUser } from "@/lib/mobile/api";
import { resendVerificationEmailAction } from "@/app/actions";

export const dynamic = "force-dynamic";

/** Отправить письмо для подтверждения email ещё раз (то же, что кнопка на сайте). */
export async function POST(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  await runAsUser(user, () => resendVerificationEmailAction());
  return json({ ok: true });
}
