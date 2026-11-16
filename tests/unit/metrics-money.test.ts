import { test, after } from "node:test";
import assert from "node:assert/strict";
import { db } from "../../lib/db/client";
import * as schema from "../../lib/db/schema";
import { getMoney, getSources, getTutorFunnel, getWeekly } from "../../lib/metrics";
import { recordSignupSource } from "../../lib/signup-source";
import { eq } from "drizzle-orm";
import { makeUser, cleanup } from "../helpers";

after(cleanup);

test("метрики: неделя, воронка репетиторов, деньги и источники считаются", async () => {
  const before = await getMoney();
  const t = await makeUser({ role: "TEACHER", email: `t${Date.now()}@real-tutor.ru` });
  await makeUser({ teacherId: t.id });
  await recordSignupSource(t.id, "telegram|/repetitoram");
  const [row] = await db.select({ s: schema.users.signupSource }).from(schema.users).where(eq(schema.users.id, t.id));
  assert.equal(row.s, "telegram|/repetitoram");
  await db.insert(schema.payments).values({
    id: `pay_${t.id}`,
    userId: t.id,
    yookassaPaymentId: `yk_${t.id}`,
    amountRub: 690,
    status: "succeeded",
    periodDays: 30,
    paymentType: "teacher_pro",
    paidAt: new Date(),
  } as never);

  const weeks = await getWeekly(2);
  assert.equal(weeks.length, 2);
  assert.ok(weeks[0].tutors >= 1);
  assert.ok(weeks[0].revenueTutors >= 690);
  const f = await getTutorFunnel(30);
  assert.ok(f.registered >= 1 && f.student1 >= 1 && f.paid >= 1);
  const m = await getMoney();
  assert.equal(m.thisMonth - before.thisMonth, 690);
  const src = await getSources(30);
  assert.ok(src.sources.some((s) => s.src === "telegram" && s.tutors >= 1 && s.paid >= 1));
  assert.ok(src.pages.some((p) => p.page === "/repetitoram"));
});
