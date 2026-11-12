/** Общие элементы экранов репетитора. */
import { useState, type ReactNode } from "react";
import { Modal, Pressable, ScrollView, Switch, View, type StyleProp, type ViewStyle } from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Button, Card, Pill, Row, T } from "./ui";
import { C, R } from "@/theme";
import { addDays, confirm, dayLabel, mskKey, relDay, timeRange, useTAction, type TLesson } from "@/lib/teacher";

export function Avatar({ name, size = 44, bg = C.pineLight, color = C.pineDark }: { name: string; size?: number; bg?: string; color?: string }) {
  const ini = name
    .split(" ")
    .map((w) => w[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
  return (
    <View style={{ width: size, height: size, borderRadius: size * 0.32, backgroundColor: bg, alignItems: "center", justifyContent: "center" }}>
      <T w="black" size={size * 0.36} color={color}>
        {ini}
      </T>
    </View>
  );
}

/** Переключатель вкладок/вариантов. */
export function Seg<K extends string>({ value, onChange, items, style }: { value: K; onChange: (k: K) => void; items: [K, string][]; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[{ flexDirection: "row", backgroundColor: C.lineSoft, borderRadius: 16, padding: 4 }, style]}>
      {items.map(([k, label]) => (
        <Pressable
          key={k}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === k }}
          onPress={() => onChange(k)}
          style={{ flex: 1, minHeight: 40, borderRadius: 12, alignItems: "center", justifyContent: "center", backgroundColor: value === k ? C.white : "transparent" }}
        >
          <T w={value === k ? "black" : "bold"} size={13} color={value === k ? C.ink : C.inkSoft} numberOfLines={1}>
            {label}
          </T>
        </Pressable>
      ))}
    </View>
  );
}

/** Кнопка-«таблетка» для выбора (номера ЕГЭ, ученики группы, длительность). */
export function Chip({ label, on, onPress, color = C.pineStrong }: { label: string; on: boolean; onPress: () => void; color?: string }) {
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityState={{ checked: on }}
      onPress={onPress}
      style={{
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: R.pill,
        borderWidth: 2,
        borderColor: on ? color : C.line,
        backgroundColor: on ? color : C.white,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <T w="extrabold" size={14} color={on ? C.white : C.ink}>
        {label}
      </T>
    </Pressable>
  );
}

export function Chips({ children }: { children: ReactNode }) {
  return <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>{children}</View>;
}

function Arrow({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label === "‹" ? "Назад" : "Вперёд"}
      disabled={disabled}
      onPress={onPress}
      hitSlop={6}
      style={{ width: 44, height: 44, borderRadius: 22, borderWidth: 2, borderColor: C.line, alignItems: "center", justifyContent: "center", opacity: disabled ? 0.35 : 1, backgroundColor: C.white }}
    >
      <T w="black" size={20} color={C.inkSoft}>
        {label}
      </T>
    </Pressable>
  );
}

/** Выбор дня стрелками (YYYY-MM-DD). */
export function DateStepper({ label, value, onChange, min, max }: { label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <View style={{ gap: 6 }}>
      <T w="extrabold" size={13} color={C.inkSoft}>
        {label}
      </T>
      <Row>
        <Arrow label="‹" onPress={() => onChange(addDays(value, -1))} disabled={!!min && value <= min} />
        <View style={{ flex: 1, alignItems: "center" }}>
          <T w="black" size={16}>
            {dayLabel(value, { weekday: "short", day: "numeric", month: "long" })}
          </T>
          <T size={12} color={C.inkSoft}>
            {relDay(value)}
          </T>
        </View>
        <Arrow label="›" onPress={() => onChange(addDays(value, 1))} disabled={!!max && value >= max} />
      </Row>
    </View>
  );
}

/** Время занятия: час стрелками, минуты — 00/15/30/45. Значение "HH:MM". */
export function TimeStepper({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const [h, m] = value.split(":").map(Number);
  const set = (hh: number, mm: number) => onChange(`${String((hh + 24) % 24).padStart(2, "0")}:${String(mm).padStart(2, "0")}`);
  return (
    <View style={{ gap: 6 }}>
      <T w="extrabold" size={13} color={C.inkSoft}>
        Время (по Москве)
      </T>
      <Row>
        <Arrow label="‹" onPress={() => set(h - 1, m)} />
        <T w="black" size={22} style={{ minWidth: 76, textAlign: "center" }}>
          {value}
        </T>
        <Arrow label="›" onPress={() => set(h + 1, m)} />
        <View style={{ flex: 1 }} />
      </Row>
      <Chips>
        {[0, 15, 30, 45].map((mm) => (
          <Chip key={mm} label={`:${String(mm).padStart(2, "0")}`} on={m === mm} onPress={() => set(h, mm)} />
        ))}
      </Chips>
    </View>
  );
}

export function Toggle({ label, text, value, onChange }: { label: string; text?: string; value: boolean; onChange: (v: boolean) => void }) {
  return (
    <Row style={{ paddingVertical: 4 }}>
      <View style={{ flex: 1 }}>
        <T w="bold">{label}</T>
        {text ? (
          <T size={12} color={C.inkSoft}>
            {text}
          </T>
        ) : null}
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: C.pine, false: C.line }} thumbColor={C.white} />
    </Row>
  );
}

/** Нижняя шторка. */
export function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={open} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "rgba(19,42,32,0.35)" }} onPress={onClose} accessibilityLabel="Закрыть" />
      <View style={{ backgroundColor: C.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: "85%", paddingBottom: insets.bottom + 12 }}>
        <View style={{ alignItems: "center", paddingTop: 8 }}>
          <View style={{ width: 40, height: 5, borderRadius: 3, backgroundColor: C.line }} />
        </View>
        <T w="black" size={18} style={{ paddingHorizontal: 16, paddingTop: 10 }}>
          {title}
        </T>
        <ScrollView contentContainerStyle={{ padding: 16, gap: 10 }} keyboardShouldPersistTaps="handled">
          {children}
        </ScrollView>
      </View>
    </Modal>
  );
}

export function SheetItem({ title, text, onPress, danger }: { title: string; text?: string; onPress: () => void; danger?: boolean }) {
  return (
    <Card onPress={onPress} style={{ paddingVertical: 14 }}>
      <T w="black" color={danger ? C.coralText : C.ink}>
        {title}
      </T>
      {text ? (
        <T size={12} color={C.inkSoft}>
          {text}
        </T>
      ) : null}
    </Card>
  );
}

const STATUS: Record<string, { text: string; bg: string; color: string }> = {
  done: { text: "было", bg: C.pineLight, color: C.pineDark },
  missed: { text: "не пришёл", bg: C.amberLight, color: C.amberText },
  cancelled: { text: "отменено", bg: C.lineSoft, color: C.inkSoft },
};

/**
 * Занятие: время, ученик/группа, тема. Запланированное прошедшее — кнопки
 * «Было / Не было»; меню — перенести, отменить, удалить.
 * from — куда вернулся бы сайт (для общих действий не важно).
 */
export function LessonCard({ lesson, showDay = false, from = "schedule" }: { lesson: TLesson; showDay?: boolean; from?: string }) {
  const { run, busy } = useTAction();
  const [menu, setMenu] = useState(false);
  const [attendance, setAttendance] = useState(false);
  const [present, setPresent] = useState<Set<string>>(() => new Set(lesson.students.map((s) => s.id)));
  const group = !!lesson.groupLessonId;
  const planned = lesson.status === "planned";
  const past = new Date(lesson.startsAt).getTime() <= Date.now();
  const st = STATUS[lesson.status];
  const plannedRows = lesson.students.filter((s) => s.status === "planned");

  const mark = async (status: "done" | "missed" | "cancelled") => {
    setMenu(false);
    if (group) {
      await run(
        "setGroupLessonStatus",
        {
          groupLessonId: lesson.groupLessonId,
          mode: status === "cancelled" ? "cancel" : "attendance",
          present: status === "cancelled" ? [] : [...present],
          lessonIds: plannedRows.map((s) => s.lessonId),
          from,
        },
        { key: status }
      );
      setAttendance(false);
    } else await run("setLessonStatus", { lessonId: lesson.id, status, from }, { key: status });
  };

  return (
    <Card style={{ gap: 8, borderColor: planned && past ? C.amber : C.lineSoft }}>
      <Row>
        <View style={{ flex: 1 }}>
          <T w="black" size={13} color={C.inkSoft}>
            {showDay ? `${relDay(lesson.startsAt)}, ` : ""}
            {timeRange(lesson.startsAt, lesson.durationMin)}
            {lesson.seriesId ? " · каждую неделю" : ""}
          </T>
          <T w="black" size={16} numberOfLines={1}>
            {lesson.title}
          </T>
          {lesson.topic ? (
            <T size={13} color={C.inkSoft} numberOfLines={2}>
              {lesson.topic}
            </T>
          ) : null}
        </View>
        {st ? <Pill text={st.text} bg={st.bg} color={st.color} /> : null}
        {planned ? (
          <Pressable accessibilityRole="button" accessibilityLabel="Действия с занятием" hitSlop={8} onPress={() => setMenu(true)} style={{ width: 40, height: 40, alignItems: "center", justifyContent: "center" }}>
            <T w="black" size={20} color={C.inkSoft}>
              ⋯
            </T>
          </Pressable>
        ) : null}
      </Row>
      {!group && lesson.status === "done" ? (
        <Button title="Записать отчёт" kind="secondary" small onPress={() => router.push({ pathname: "/teacher/log-new", params: { studentId: lesson.students[0].id, date: mskKey(new Date(lesson.startsAt)), topic: lesson.topic ?? "" } })} />
      ) : null}
      {planned && past ? (
        group ? (
          <Button title="Отметить, кто был" small onPress={() => setAttendance(true)} />
        ) : (
          <Row gap={8}>
            <Button title="Было" small style={{ flex: 1 }} loading={busy === "done"} onPress={() => mark("done")} />
            <Button title="Не пришёл" kind="secondary" small style={{ flex: 1 }} loading={busy === "missed"} onPress={() => mark("missed")} />
          </Row>
        )
      ) : null}

      <Sheet open={menu} onClose={() => setMenu(false)} title={lesson.title}>
        {past && !group ? <SheetItem title="Было" onPress={() => mark("done")} /> : null}
        {past && !group ? <SheetItem title="Не пришёл" text="Занятие засчитается, если пропуски оплачиваются" onPress={() => mark("missed")} /> : null}
        {past && group ? <SheetItem title="Отметить, кто был" onPress={() => (setMenu(false), setAttendance(true))} /> : null}
        <SheetItem
          title="Перенести"
          onPress={() => {
            setMenu(false);
            router.push({
              pathname: "/teacher/lesson-new",
              params: { lessonId: lesson.id, startsAt: lesson.startsAt, durationMin: String(lesson.durationMin), series: lesson.seriesId ? "1" : "", group: group ? "1" : "", title: lesson.title },
            });
          }}
        />
        <SheetItem title="Отменить" text="Занятия не было — в оплату не идёт" onPress={() => mark("cancelled")} />
        <SheetItem
          title="Удалить"
          danger
          onPress={() => {
            setMenu(false);
            confirm("Удалить занятие?", "Занятие пропадёт из расписания.", "Удалить", () => run("deleteLesson", { lessonId: lesson.id, wholeGroup: group ? "1" : undefined, from }));
          }}
        />
        {lesson.seriesId ? (
          <SheetItem
            title="Удалить это и все следующие"
            danger
            onPress={() => {
              setMenu(false);
              confirm("Удалить серию?", "Удалятся это и все следующие запланированные занятия серии. Проведённые останутся.", "Удалить", () =>
                run("deleteLessonSeries", { lessonId: lesson.id, wholeGroup: group ? "1" : undefined, from })
              );
            }}
          />
        ) : null}
      </Sheet>

      <Sheet open={attendance} onClose={() => setAttendance(false)} title="Кто был на занятии?">
        <T size={13} color={C.inkSoft}>
          Отмеченным занятие засчитается как «было», остальным — «не пришёл».
        </T>
        <Chips>
          {plannedRows.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              on={present.has(s.id)}
              onPress={() =>
                setPresent((p) => {
                  const n = new Set(p);
                  if (n.has(s.id)) n.delete(s.id);
                  else n.add(s.id);
                  return n;
                })
              }
            />
          ))}
        </Chips>
        <Button title="Сохранить" loading={busy === "done"} onPress={() => mark("done")} />
        <Button title="Занятия не было" kind="secondary" loading={busy === "cancelled"} onPress={() => mark("cancelled")} />
      </Sheet>
    </Card>
  );
}

/** Подпись раздела с действием справа. */
export function Section({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <Row style={{ marginTop: 6 }}>
      <T w="black" size={18} style={{ flex: 1 }}>
        {title}
      </T>
      {action ? (
        <Pressable accessibilityRole="button" onPress={onAction} hitSlop={8}>
          <T w="black" size={14} color={C.pineStrong}>
            {action}
          </T>
        </Pressable>
      ) : null}
    </Row>
  );
}

export const today = () => mskKey();
