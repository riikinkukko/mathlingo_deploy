import { clientIpFromHeaders, registerStudent } from "@/lib/auth-flows";
import { getUserById } from "@/lib/queries";
import { fail, json, readJson } from "@/lib/mobile/api";
import { sessionPayload } from "@/lib/mobile/session";

export const dynamic = "force-dynamic";

/** Регистрация ученика в приложении — те же проверки и согласие на ПДн, что на сайте. */
export async function POST(req: Request) {
  const body = await readJson<{ name?: unknown; email?: unknown; password?: unknown; consent?: unknown }>(req, 4_000);
  if (!body) return fail("Некорректный запрос");
  const res = await registerStudent(
    { name: body.name, email: body.email, password: body.password, consent: body.consent === true },
    clientIpFromHeaders(req.headers)
  );
  if ("error" in res) return fail(res.error);
  const user = await getUserById(res.userId);
  if (!user) return fail("Не удалось создать аккаунт", 500);
  return json(await sessionPayload(user));
}
