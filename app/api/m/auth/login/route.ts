import { clientIpFromHeaders, passwordLogin } from "@/lib/auth-flows";
import { fail, json, readJson } from "@/lib/mobile/api";
import { sessionPayload } from "@/lib/mobile/session";

export const dynamic = "force-dynamic";

/** Вход в приложении — те же проверки, что у формы на сайте (lib/auth-flows.ts). */
export async function POST(req: Request) {
  const body = await readJson<{ email?: unknown; password?: unknown }>(req, 4_000);
  if (!body) return fail("Некорректный запрос");
  const res = await passwordLogin(body.email, body.password, clientIpFromHeaders(req.headers));
  if ("error" in res) return fail(res.error, 401);
  return json(await sessionPayload(res.user));
}
