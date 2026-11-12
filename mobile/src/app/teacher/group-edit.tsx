import { useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { errorText } from "@/lib/api";
import { useT, useTAction } from "@/lib/teacher";
import { Button, Card, ErrorBox, Header, Loading, Screen, T } from "@/components/ui";
import { Field } from "@/components/Field";
import { Chip, Chips } from "@/components/teacher";
import { C } from "@/theme";

/** Создать группу или изменить название и состав (id). */
export default function GroupEdit() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const q = useT("groups");
  const { run, busy } = useTAction();
  const g = q.data?.groups.find((x) => x.id === id);
  const [name, setName] = useState<string | null>(null);
  const [members, setMembers] = useState<Set<string> | null>(null);
  const header = <Header title={id ? "Изменить группу" : "Новая группа"} />;
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  const nm = name ?? g?.name ?? "";
  const sel = members ?? new Set(g?.members.map((m) => m.id) ?? []);
  return (
    <Screen header={header}>
      <Field label="Название" value={nm} onChangeText={setName} placeholder="например, 11 класс, вторник" maxLength={60} />
      <Card style={{ gap: 8 }}>
        <T w="extrabold" size={13} color={C.inkSoft}>
          Ученики · {sel.size}
        </T>
        <Chips>
          {q.data.students.map((s) => (
            <Chip
              key={s.id}
              label={s.name}
              on={sel.has(s.id)}
              onPress={() => {
                const n = new Set(sel);
                if (n.has(s.id)) n.delete(s.id);
                else n.add(s.id);
                setMembers(n);
              }}
            />
          ))}
        </Chips>
      </Card>
      <Button
        title="Сохранить"
        disabled={!nm.trim() || sel.size < 2}
        loading={!!busy}
        onPress={async () => {
          const r = await run(id ? "updateGroup" : "createGroup", { groupId: id, name: nm, studentIds: [...sel] });
          if (r) router.back();
        }}
      />
    </Screen>
  );
}
