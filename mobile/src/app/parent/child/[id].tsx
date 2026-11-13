import { useLocalSearchParams } from "expo-router";
import { errorText } from "@/lib/api";
import { useParentChild, useParentHome } from "@/lib/parent";
import { ErrorBox, Header, Loading, Screen } from "@/components/ui";
import { ParentChildView } from "@/components/ParentChild";

export default function ParentChildScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const q = useParentChild(id);
  const home = useParentHome().data;
  const header = <Header title={q.data?.child.name ?? "Ребёнок"} />;
  if (q.isLoading && !q.data) return <Loading />;
  if (!q.data) return <Screen header={header}><ErrorBox message={errorText(q.error)} onRetry={() => q.refetch()} /></Screen>;
  return (
    <Screen header={header} onRefresh={() => q.refetch()} refreshing={q.isRefetching}>
      <ParentChildView d={q.data} home={home} />
    </Screen>
  );
}
