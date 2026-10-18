import { test } from "node:test";
import assert from "node:assert/strict";
import {
  loginBlockReason,
  loginFailureKeys,
  LOGIN_FAILS_PER_EMAIL,
  LOGIN_FAILS_PER_EMAIL_IP,
  LOGIN_FAILS_PER_IP,
} from "../../lib/login-limits";
import { referralRewardDecision, sameCard, REFERRAL_MAX_REWARDS_PER_YEAR } from "../../lib/referral-rules";
import { isSessionRevoked } from "../../lib/auth";

test("вход: жёсткая блокировка — по паре email+IP, общий потолок на email высокий", () => {
  assert.equal(loginBlockReason({ emailIp: 0, email: 0, ip: 0 }), null);
  assert.equal(loginBlockReason({ emailIp: LOGIN_FAILS_PER_EMAIL_IP, email: LOGIN_FAILS_PER_EMAIL_IP, ip: 0 }), "email_ip");
  // Атакующий набил 50 ошибок с других адресов — владелец со своего IP входит.
  assert.equal(loginBlockReason({ emailIp: 0, email: 50, ip: 0 }), null);
  assert.ok(LOGIN_FAILS_PER_EMAIL >= 500);
  assert.equal(loginBlockReason({ emailIp: 0, email: LOGIN_FAILS_PER_EMAIL, ip: 0 }), "email");
  assert.equal(loginBlockReason({ emailIp: 0, email: 0, ip: LOGIN_FAILS_PER_IP }), "ip");
});

test("вход: ключи счётчиков для неудачной попытки", () => {
  assert.deepEqual(loginFailureKeys("1.2.3.4", "a@b.ru"), ["email:a@b.ru", "emailip:a@b.ru|1.2.3.4", "ip:1.2.3.4"]);
  assert.deepEqual(loginFailureKeys("", "a@b.ru"), ["email:a@b.ru"]);
  assert.deepEqual(loginFailureKeys("1.2.3.4", ""), ["ip:1.2.3.4"]);
});

test("пригласи коллегу: email, та же карта, лимит в год", () => {
  const base = { inviteeEmailVerified: true, inviterRewardsLastYear: 0 };
  assert.deepEqual(referralRewardDecision(base), { ok: true });
  assert.deepEqual(referralRewardDecision({ ...base, inviteeEmailVerified: false }), { ok: false, reason: "email_not_verified" });
  assert.deepEqual(
    referralRewardDecision({ ...base, inviteeCard: { last4: "4242", type: "Visa" }, inviterCard: { last4: "4242", type: "visa" } }),
    { ok: false, reason: "same_card" }
  );
  assert.deepEqual(
    referralRewardDecision({ ...base, inviteeCard: { last4: "4242", type: "Visa" }, inviterCard: { last4: "1111", type: "Visa" } }),
    { ok: true }
  );
  assert.deepEqual(referralRewardDecision({ ...base, inviterRewardsLastYear: REFERRAL_MAX_REWARDS_PER_YEAR - 1 }), { ok: true });
  assert.deepEqual(referralRewardDecision({ ...base, inviterRewardsLastYear: REFERRAL_MAX_REWARDS_PER_YEAR }), { ok: false, reason: "limit_reached" });
});

test("сравнение карт: неизвестная карта не считается совпадением", () => {
  assert.equal(sameCard(null, { last4: "4242" }), false);
  assert.equal(sameCard({ last4: null }, { last4: null }), false);
  assert.equal(sameCard({ last4: "4242" }, { last4: "4242", type: "Мир" }), true);
  assert.equal(sameCard({ last4: "4242", type: "Visa" }, { last4: "4242", type: "MasterCard" }), false);
});

test("сессия: отзыв по смене пароля и по «Выйти на всех устройствах»", () => {
  const t = Date.UTC(2026, 9, 1, 12, 0, 0);
  const iatBefore = t / 1000 - 60;
  const iatAfter = t / 1000 + 60;
  const at = new Date(t).toISOString();
  assert.equal(isSessionRevoked({}, iatBefore), false);
  assert.equal(isSessionRevoked({ sessionsRevokedAt: at }, iatBefore), true);
  assert.equal(isSessionRevoked({ sessionsRevokedAt: at }, iatAfter), false);
  assert.equal(isSessionRevoked({ passwordChangedAt: at }, iatBefore), true);
  // учитывается более поздняя из двух отметок
  const earlier = new Date(t - 3600_000).toISOString();
  assert.equal(isSessionRevoked({ passwordChangedAt: earlier, sessionsRevokedAt: at }, t / 1000 - 30), true);
  assert.equal(isSessionRevoked({ sessionsRevokedAt: at }, undefined), true);
});
