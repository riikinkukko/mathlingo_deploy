import { redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { toPublicProblem } from "@/lib/queries";
import { getMistakePractice } from "@/lib/practice";
import ReviewFlow from "@/components/ReviewFlow";

/** «Работа над ошибками»: нерешённые ошибки подряд (lib/practice.ts). */
export default async function MistakePracticePage() {
  const user = (await getSessionUser())!;
  const { items } = await getMistakePractice(user);
  if (items.length === 0) redirect("/student/mistakes");
  return (
    <div className="min-h-screen bg-paper px-4 pb-16 pt-[max(1rem,var(--app-sat))]">
      <ReviewFlow
        mode="mistakes"
        backHref="/student/mistakes"
        items={items.map((it) => ({ problem: toPublicProblem(it.problem), skillTitle: it.skillTitle, box: 1 }))}
      />
    </div>
  );
}
