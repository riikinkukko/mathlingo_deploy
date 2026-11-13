import { useState, type ReactNode } from "react";
import { Pressable, View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "@/lib/api";
import { plural } from "@/lib/hooks";
import { openOnSite } from "@/lib/web";
import { dayLabel, KIND_LABEL, mskKey, relDay, timeRange } from "@/lib/teacher";
import type { PChild, PHome } from "@/lib/parent";
import { Button, Card, Pill, ProgressBar, Row, T } from "./ui";
import { Mascot } from "./Svg";
import { Toggle } from "./teacher";
import { C } from "@/theme";

const lessonWhen = (iso: string, min: number) => `${relDay(iso)}, ${timeRange(iso, min)}`;

function Fold({ title, summary, open: open0 = false, children }: { title: string; summary?: string; open?: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(open0);
  return (
    <View style={{ gap: 8 }}>
      <Pressable accessibilityRole="button" accessibilityState={{ expanded: open }} onPress={() => setOpen((v) => !v)}>
        <Card style={{ paddingVertical: 12 }}>
          <Row>
            <T w="black" style={{ flex: 1 }}>
              {title}
            </T>
            {summary ? (
              <T size={12} color={C.inkSoft}>
                {summary}
              </T>
            ) : null}
            <T w="black" color={C.inkSoft}>
              {open ? "▴" : "▾"}
            </T>
          </Row>
        </Card>
      </Pressable>
      {open ? children : null}
    </View>
  );
}

function SumRow({ icon, bg, color, title, sub, alert }: { icon: string; bg: string; color: string; title: string; sub?: string; alert?: boolean }) {
  return (
    <Row style={{ paddingVertical: 10 }}>
      <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
        <T w="black" color={color}>
          {icon}
        </T>
      </View>
      <View style={{ flex: 1 }}>
        <T w="extrabold" color={alert ? C.coralText : C.ink}>
          {title}
        </T>
        {sub ? (
          <T size={12} color={C.inkSoft}>
            {sub}
          </T>
        ) : null}
      </View>
    </Row>
  );
}

/** Неделя по задачам: столбики за 12 недель. */
function Weekly({ weekly }: { weekly: PChild["weekly"] }) {
  const max = Math.max(1, ...weekly.map((w) => w.solved));
  return (
    <Card style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", alignItems: "flex-end", height: 90, gap: 4 }}>
        {weekly.map((w, i) => (
          <View key={w.week} style={{ flex: 1, alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
            <View
              style={{
                width: "100%",
                height: Math.max(3, (w.solved / max) * 80),
                borderRadius: 4,
                backgroundColor: i === weekly.length - 1 ? C.pineStrong : w.solved ? C.pineMint : C.lineSoft,
              }}
            />
          </View>
        ))}
      </View>
      <Row>
        <T size={11} color={C.inkSoft} style={{ flex: 1 }}>
          {weekly[0] ? dayLabel(weekly[0].week, { day: "numeric", month: "short" }) : ""}
        </T>
        <T size={11} color={C.inkSoft}>
          эта неделя
        </T>
      </Row>
      <T size={12} color={C.inkSoft}>
        Решённые задачи по неделям за 12 недель.
      </T>
    </Card>
  );
}

export function ParentChildView({ d, home }: { d: PChild; home: PHome | undefined }) {
  const qc = useQueryClient();
  const [weeklyErr, setWeeklyErr] = useState<string | null>(null);
  const first = d.child.name.split(" ")[0];
  const thisWeek = d.weekly[d.weekly.length - 1] ?? { solved: 0, accuracy: null };
  const soon = d.upcoming.find((l) => new Date(l.startsAt).getTime() - Date.now() < 7 * 86_400_000);
  const hwDone = d.homeworks.filter((h) => h.complete).length;
  const hwOverdue = d.homeworks.filter((h) => h.overdue && !h.complete).length;
  const nextDue = d.homeworks.filter((h) => !h.complete && new Date(h.dueDate).getTime() >= Date.now()).sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
  const lastMock = d.mocks[0];
  const solved12 = d.weekly.reduce((n, w) => n + w.solved, 0);
  const next = d.upcoming[0];

  async function setWeekly(v: boolean) {
    setWeeklyErr(null);
    try {
      await api("/api/m/parent", { body: { weeklyReport: v } });
      await qc.invalidateQueries({ queryKey: ["p", "home"] });
    } catch (e) {
      setWeeklyErr(errorText(e));
    }
  }

  return (
    <>
      <View style={{ backgroundColor: C.pineDarker, borderRadius: 24, padding: 18, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <T w="extrabold" size={13} color={C.pineMint}>
            {first} · эта неделя
          </T>
          <T w="black" size={22} color={C.white} style={{ marginTop: 4 }}>
            {d.stats.activeDays7 > 0
              ? `Практика ${d.stats.activeDays7} ${plural(d.stats.activeDays7, ["день", "дня", "дней"])} из 7`
              : "Задач в приложении пока не было"}
          </T>
          <T size={14} color={C.pineMint} style={{ marginTop: 6 }}>
            {thisWeek.solved} {plural(thisWeek.solved, ["задача", "задачи", "задач"])}
            {thisWeek.accuracy !== null && thisWeek.solved > 0 ? ` · точность ${thisWeek.accuracy}%` : ""}
            {soon ? ` · занятие ${relDay(soon.startsAt)}` : ""}
          </T>
        </View>
        <Mascot mood={d.stats.activeDays7 >= 3 ? "happy" : d.stats.activeDays7 > 0 || soon ? "idle" : "worried"} size={72} />
      </View>

      {d.child.targetScore || lastMock ? (
        <Card style={{ gap: 6 }}>
          <Row>
            <T w="black" style={{ flex: 1 }}>
              Цель {d.child.targetScore ? `${d.child.targetScore} баллов` : "не задана"}
            </T>
            {lastMock ? <Pill text={`пробник ${lastMock.score}`} /> : null}
          </Row>
          {d.child.targetScore && lastMock ? <ProgressBar pct={Math.min(100, Math.round((lastMock.score / d.child.targetScore) * 100))} height={8} /> : null}
          {lastMock ? (
            <T size={12} color={C.inkSoft}>
              Последний пробник — {dayLabel(lastMock.takenAt, { day: "numeric", month: "long" })}
            </T>
          ) : null}
        </Card>
      ) : null}

      <Card style={{ paddingVertical: 4 }}>
        <SumRow
          icon="📅"
          bg={C.pineLight}
          color={C.pineDark}
          title={next ? `Занятие: ${lessonWhen(next.startsAt, next.durationMin)}` : "Ближайших занятий нет"}
          sub={(next ? [next.group, next.topic].filter(Boolean).join(" · ") : "") || (d.teacher ? `Репетитор: ${d.teacher.name}` : undefined)}
        />
        <SumRow
          icon="✎"
          bg={C.amberLight}
          color={C.amberText}
          title={d.homeworks.length ? `Домашка: ${hwDone} из ${d.homeworks.length} ${plural(d.homeworks.length, ["сдана", "сданы", "сдано"])}` : "Домашних заданий нет"}
          sub={hwOverdue ? `Просрочено: ${hwOverdue}` : nextDue ? `Ближайший срок — ${dayLabel(mskKey(new Date(nextDue.dueDate)), { day: "numeric", month: "long" })}` : undefined}
          alert={hwOverdue > 0}
        />
        {d.balance ? (
          <SumRow icon="₽" bg={d.balance.debt ? C.coralLight : C.pineLight} color={d.balance.debt ? C.coralText : C.pineDark} title={d.balance.title} sub={d.balance.sub} alert={d.balance.debt} />
        ) : null}
      </Card>

      {d.logs[0] ? (
        <Card style={{ gap: 4 }}>
          <T w="extrabold" size={12} color={C.inkSoft}>
            Последний отчёт репетитора · {dayLabel(d.logs[0].date.slice(0, 10), { day: "numeric", month: "long" })}
          </T>
          <T w="black">{d.logs[0].topic}</T>
          <T size={14} color={C.inkSoft}>
            {d.logs[0].report}
          </T>
        </Card>
      ) : null}

      <T w="black" size={12} color={C.inkSoft} style={{ marginTop: 6 }}>
        ПОДРОБНЕЕ
      </T>
      {d.upcoming.length ? (
        <Fold title="Ближайшие занятия" summary={`${d.upcoming.length}`} open>
          {d.upcoming.map((l) => (
            <Card key={l.id} style={{ paddingVertical: 12 }}>
              <T w="black">{lessonWhen(l.startsAt, l.durationMin)}</T>
              {l.group || l.topic ? (
                <T size={12} color={C.inkSoft}>
                  {[l.group, l.topic].filter(Boolean).join(" · ")}
                </T>
              ) : null}
            </Card>
          ))}
        </Fold>
      ) : null}
      <Fold title="Динамика" summary={`${solved12} ${plural(solved12, ["задача", "задачи", "задач"])} за 12 нед.`}>
        <Weekly weekly={d.weekly} />
        {d.mocks.length ? (
          <Card style={{ gap: 4 }}>
            <T w="extrabold" size={12} color={C.inkSoft}>
              ПРОБНИКИ
            </T>
            {d.mocks.map((m) => (
              <Row key={m.id}>
                <T w="black" style={{ width: 40 }}>
                  {m.score}
                </T>
                <T size={13} color={C.inkSoft}>
                  {dayLabel(m.takenAt, { day: "numeric", month: "long", year: "numeric" })}
                </T>
              </Row>
            ))}
          </Card>
        ) : null}
      </Fold>
      <Fold title="Журнал занятий" summary={d.logs.length ? `${d.logs.length}` : undefined}>
        {d.logs.length ? (
          d.logs.map((l) => (
            <Card key={l.id} style={{ gap: 4 }}>
              <Row>
                <T w="black" style={{ flex: 1 }}>
                  {l.topic}
                </T>
                <T size={12} color={C.inkSoft}>
                  {dayLabel(l.date.slice(0, 10), { day: "numeric", month: "long" })}
                </T>
              </Row>
              <T size={14} color={C.inkSoft}>
                {l.report}
              </T>
            </Card>
          ))
        ) : (
          <T size={13} color={C.inkSoft}>
            Репетитор пока не оставил записей о занятиях.
          </T>
        )}
      </Fold>
      <Fold title="Прогресс по темам" summary={`решено ${d.stats.solved}`}>
        <Card style={{ gap: 10 }}>
          {d.topics.map((t) => (
            <View key={t.id} style={{ gap: 4 }}>
              <Row>
                <T size={14} w="bold" style={{ flex: 1 }} numberOfLines={1}>
                  {t.title}
                </T>
                <T size={12} color={C.inkSoft}>
                  {t.solved}/{t.total}
                </T>
              </Row>
              <ProgressBar pct={t.total ? Math.round((t.solved / t.total) * 100) : 0} height={6} />
            </View>
          ))}
        </Card>
      </Fold>
      <Fold title="Задания" summary={d.homeworks.length ? `${d.homeworks.length}` : undefined} open>
        {d.homeworks.length ? (
          d.homeworks.slice(0, 20).map((h) => (
            <Card key={h.id} style={{ paddingVertical: 12 }}>
              <Row>
                <View style={{ flex: 1 }}>
                  <T w="extrabold" size={11} color={C.inkSoft}>
                    {(KIND_LABEL[h.kind] ?? "Задание").toUpperCase()}
                  </T>
                  <T w="bold">{h.title}</T>
                  <T size={12} color={h.overdue && !h.complete ? C.coralText : C.inkSoft}>
                    Срок: {dayLabel(mskKey(new Date(h.dueDate)), { day: "numeric", month: "long" })}
                    {h.overdue && !h.complete ? " · просрочено" : h.complete ? " · выполнено" : ""}
                  </T>
                </View>
                <Pill text={`${h.done}/${h.total}`} bg={h.complete ? C.pineLight : h.overdue ? C.coralLight : C.paper} color={h.complete ? C.pineDark : h.overdue ? C.coralText : C.inkSoft} />
              </Row>
            </Card>
          ))
        ) : (
          <T size={13} color={C.inkSoft}>
            Пока нет назначенных заданий.
          </T>
        )}
      </Fold>

      <Card style={{ gap: 8, marginTop: 6 }}>
        <Toggle
          label="Недельный отчёт по воскресеньям"
          text="Дни занятий, задачи, темы, домашка, пробник и оплата — в Telegram или на почту"
          value={home?.weeklyReport ?? true}
          onChange={setWeekly}
        />
        {weeklyErr ? (
          <T size={12} color={C.coralText}>
            {weeklyErr}
          </T>
        ) : null}
        {home && !home.telegram ? (
          <Button title="Подключить Telegram" kind="secondary" small onPress={() => void openOnSite(`/parent/child/${d.child.id}#telegram`)} />
        ) : null}
      </Card>
    </>
  );
}
