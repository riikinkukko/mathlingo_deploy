import { useMemo, useState } from "react";
import { Pressable, TextInput, View } from "react-native";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { api, errorText } from "@/lib/api";
import { plural } from "@/lib/hooks";
import { confirm, dayLabel, mskKey, useT, useTAction, type THome } from "@/lib/teacher";
import { Button, Card, Empty, ErrorBox, Loading, Pill, Row, Screen, T } from "@/components/ui";
import { Avatar, LessonCard, Section } from "@/components/teacher";
import { Icon, Mascot } from "@/components/Svg";
import { C, F, R } from "@/theme";

function PlanBanner({ plan }: { plan: THome["plan"] }) {
  if (plan.source === "owner") return null;
  const text =
    plan.source === "trial"
      ? `Пробный «Профи» · осталось ${plan.trialDaysLeft} ${plural(plan.trialDaysLeft ?? 0, ["день", "дня", "дней"])}`
      : `Тариф «${plan.name}» · ${plan.studentsCount}${plan.limit !== null ? `/${plan.limit}` : ""} учеников`;
  const warn = plan.atLimit || (plan.trialDaysLeft !== null && plan.trialDaysLeft <= 3);
  // Только статус: тариф оформляется на сайте (в приложении оплаты нет).
  return (
    <Card style={{ paddingVertical: 12, backgroundColor: warn ? C.amberLight : C.white, borderColor: warn ? C.amber : C.lineSoft }}>
      <T w="bold" size={13}>
        {text}
      </T>
      {plan.atLimit ? (
        <T size={12} color={C.inkSoft}>
          Достигнут лимит учеников на тарифе.
        </T>
      ) : null}
    </Card>
  );
}

function Attention({ a }: { a: THome["attention"] }) {
  const { run, busy } = useTAction();
  const items: { key: string; text: string; color: string; onPress: () => void }[] = [];
  if (a.reviews) items.push({ key: "r", text: `${a.reviews} ${plural(a.reviews, ["работа ждёт", "работы ждут", "работ ждут"])} проверки`, color: C.violet, onPress: () => router.push("/teacher/reviews") });
  if (a.questions) items.push({ key: "q", text: `${a.questions} ${plural(a.questions, ["вопрос", "вопроса", "вопросов"])} от учеников`, color: C.teal, onPress: () => router.push("/teacher/questions") });
  for (const d of a.debts.slice(0, 5)) items.push({ key: `d${d.id}`, text: `${d.name}: долг ${d.label}`, color: C.coral, onPress: () => router.push(`/teacher/student/${d.id}?tab=payments`) });
  for (const o of a.overdue.slice(0, 5)) items.push({ key: `o${o.id}`, text: `${o.name}: просрочено ${o.count} ${plural(o.count, ["задание", "задания", "заданий"])}`, color: C.amber, onPress: () => router.push(`/teacher/student/${o.id}?tab=hw`) });
  if (!items.length && !a.unmarked.length && !a.inactive.length) return null;
  return (
    <>
      <Section title="Нужно внимание" />
      {a.unmarked.length ? (
        <>
          <T size={13} color={C.inkSoft}>
            Отметьте прошедшие занятия — от «Было» зависит баланс оплат.
          </T>
          {a.unmarked.slice(0, 5).map((l) => (
            <LessonCard key={l.id} lesson={l} showDay from="teacher" />
          ))}
          {a.unmarked.length > 5 ? <Button title={`Ещё ${a.unmarked.length - 5}`} kind="ghost" small onPress={() => router.push("/teacher/schedule")} /> : null}
        </>
      ) : null}
      {items.map((it) => (
        <Card key={it.key} onPress={it.onPress} style={{ paddingVertical: 12, borderLeftWidth: 5, borderLeftColor: it.color }}>
          <Row>
            <T w="bold" style={{ flex: 1 }}>
              {it.text}
            </T>
            <T w="black" color={C.inkSoft}>
              ›
            </T>
          </Row>
        </Card>
      ))}
      {a.inactive.slice(0, 6).map((s) => (
        <Card key={`i${s.id}`} style={{ paddingVertical: 12 }}>
          <Row>
            <Pressable style={{ flex: 1 }} onPress={() => router.push(`/teacher/student/${s.id}`)}>
              <T w="bold">{s.name}</T>
              <T size={12} color={C.inkSoft}>
                {s.days === null ? "ещё не заходил(а)" : `не заходил(а) ${s.days} ${plural(s.days, ["день", "дня", "дней"])}`}
              </T>
            </Pressable>
            {s.nudged ? (
              <Pill text="напомнили" bg={C.lineSoft} color={C.inkSoft} />
            ) : (
              <Button title="Напомнить" kind="secondary" small loading={busy === `n${s.id}`} onPress={() => run("nudge", { studentId: s.id }, { key: `n${s.id}` })} />
            )}
          </Row>
        </Card>
      ))}
    </>
  );
}

export default function TeacherHome() {
  const q = useT("home");
  const { run } = useTAction();
  const [search, setSearch] = useState("");
  const unread =
    useQuery({ queryKey: ["notifications"], queryFn: () => api<{ unread: number }>("/api/m/notifications") }).data?.unread ?? 0;
  const d = q.data;
  const students = useMemo(() => {
    const s = search.trim().toLowerCase();
    return (d?.students ?? []).filter((x) => !s || x.name.toLowerCase().includes(s));
  }, [d, search]);

  if (q.isLoading && !d) return <Loading />;
  if (!d) return <Screen><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;

  return (
    <Screen onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <Row>
        <Mascot mood="happy" size={52} />
        <View style={{ flex: 1 }}>
          <T w="black" size={24}>
            {d.name.split(" ")[0]}
          </T>
          <T color={C.inkSoft} size={13}>
            {dayLabel(mskKey(), { weekday: "long", day: "numeric", month: "long" })}
          </T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={unread ? `Уведомления, новых: ${unread}` : "Уведомления"}
          onPress={() => router.push("/notifications")}
          style={{ width: 46, height: 46, borderRadius: 23, backgroundColor: unread ? C.pineLight : C.white, borderWidth: 1, borderColor: C.lineSoft, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="Bell" size={22} color={C.pineStrong} />
          {unread ? (
            <View style={{ position: "absolute", top: 4, right: 4, minWidth: 18, height: 18, borderRadius: 9, backgroundColor: C.violet, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 }}>
              <T w="black" size={10} color={C.white} style={{ lineHeight: 13 }}>
                {unread}
              </T>
            </View>
          ) : null}
        </Pressable>
      </Row>

      {!d.emailVerified && d.plan.source === "free" ? (
        <Card style={{ backgroundColor: C.amberLight, borderColor: C.amber }}>
          <T w="bold" size={13}>
            Подтвердите email (ссылка в письме) — без этого нельзя добавлять учеников.
          </T>
        </Card>
      ) : null}

      {d.students.length > 0 ? (
        <Row gap={8}>
          {[
            ["+ Занятие", "/teacher/lesson-new"],
            ["+ Оплата", "/teacher/payment-new"],
            ["+ Задание", "/teacher/homework-new"],
          ].map(([t, href]) => (
            <Button key={href} title={t} kind="light" small style={{ flex: 1 }} onPress={() => router.push(href as never)} />
          ))}
        </Row>
      ) : null}

      <Section title={d.today.length ? `Сегодня · ${d.today.length}` : "Сегодня"} action="Расписание" onAction={() => router.push("/teacher/schedule")} />
      {d.today.length ? (
        d.today.map((l) => <LessonCard key={l.id} lesson={l} from="teacher" />)
      ) : (
        <T color={C.inkSoft} size={13}>
          Занятий сегодня нет.
        </T>
      )}

      <Attention a={d.attention} />

      <PlanBanner plan={d.plan} />

      <Section title={`Ученики · ${d.students.length}`} action={d.plan.atLimit ? undefined : "+ Добавить"} onAction={() => router.push("/teacher/student-new")} />
      {d.students.length > 6 ? (
        <TextInput
          value={search}
          onChangeText={setSearch}
          placeholder="Поиск по имени"
          placeholderTextColor="#9DB5A8"
          style={{ borderWidth: 2, borderColor: C.line, borderRadius: R.input, paddingHorizontal: 14, paddingVertical: 10, fontFamily: F.semibold, fontSize: 15, backgroundColor: C.white, color: C.ink }}
        />
      ) : null}
      {d.groups.length ? (
        <Card onPress={() => router.push("/teacher/groups")} style={{ backgroundColor: C.violetLight, borderColor: C.violetLight }}>
          <Row>
            <T w="black" style={{ flex: 1 }}>
              Группы · {d.groups.length}
            </T>
            <T size={12} color={C.inkSoft} numberOfLines={1} style={{ flex: 2 }}>
              {d.groups.map((g) => g.name).join(", ")}
            </T>
            <T w="black" color={C.violet}>
              ›
            </T>
          </Row>
        </Card>
      ) : null}
      {d.invites.map((inv) => (
        <Card key={inv.id} style={{ borderStyle: "dashed", borderColor: C.line }}>
          <Row>
            <View style={{ flex: 1 }}>
              <T w="black">{inv.name}</T>
              <T size={12} color={C.inkSoft}>
                Приглашение отправлено · ждём ответа
              </T>
            </View>
            <Button
              title="Отозвать"
              kind="ghost"
              small
              onPress={() => confirm("Отозвать приглашение?", inv.email, "Отозвать", () => run("cancelInvite", { inviteId: inv.id }))}
            />
          </Row>
        </Card>
      ))}
      {d.students.length === 0 && d.invites.length === 0 ? (
        <Empty
          title="Пока нет учеников"
          text="Добавьте ученика: создадим аккаунт или пригласим уже зарегистрированного."
          action={<Button title="Добавить ученика" onPress={() => router.push("/teacher/student-new")} />}
        />
      ) : null}
      {students.map((s) => (
        <Card key={s.id} onPress={() => router.push(`/teacher/student/${s.id}`)} style={{ paddingVertical: 12 }}>
          <Row>
            <Avatar name={s.name} />
            <View style={{ flex: 1, gap: 3 }}>
              <T w="black" size={16} numberOfLines={1}>
                {s.name}
              </T>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 4 }}>
                {s.reviews ? <Pill text={`на проверке ${s.reviews}`} bg={C.violetLight} color={C.violetText} /> : null}
                {s.mock !== null || s.targetScore ? (
                  <Pill text={`${s.mock !== null ? `пробник ${s.mock}` : "пробника нет"}${s.targetScore ? ` · цель ${s.targetScore}` : ""}`} bg={C.paper} color={C.inkSoft} />
                ) : null}
                {s.debt ? <Pill text={`долг ${s.debt}`} bg={C.coralLight} color={C.coralText} /> : null}
              </View>
              <T size={12} color={s.hwOverdue ? C.coralText : C.inkSoft}>
                {s.attempts ? `решено ${s.solved} · точность ${s.accuracy}% · ` : "ещё не начинал(а) · "}
                ДЗ {s.hwOpen}
                {s.hwOverdue ? ", есть просроченное" : ""}
              </T>
            </View>
            <T w="black" size={18} color={C.inkSoft}>
              ›
            </T>
          </Row>
        </Card>
      ))}
    </Screen>
  );
}
