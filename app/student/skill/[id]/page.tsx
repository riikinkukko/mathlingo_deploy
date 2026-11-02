import { notFound, redirect } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { toPublicProblem } from "@/lib/queries";
import { getLessonData } from "@/lib/lesson-data";
import LessonFlow from "@/components/LessonFlow";

export default async function SkillPage(props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const user = (await getSessionUser())!;
  // Правила доступа (Free-граница, блокировка, витрина второй части) — в
  // lib/lesson-data.ts, общие с мобильным приложением.
  const data = await getLessonData(user, params.id);
  if (data.status === "notfound") notFound();
  if (data.status === "upgrade") redirect("/student/upgrade");
  if (data.status === "locked") redirect("/student");

  const { skill, topicId, problems, states, next, forceTheoryFirst, detailedPreview } = data;
  return (
    <div className="min-h-screen bg-paper px-4 pb-16">
      <LessonFlow
        skillTitle={skill.title}
        theoryCards={skill.theoryCards}
        problems={problems.map(toPublicProblem)}
        initialStates={states}
        nextHref={next ? `/student/skill/${next.id}` : `/student?topic=${topicId ?? ""}`}
        nextLabel={next ? `Дальше: ${next.title}` : "К пути обучения"}
        isLastSkill={!next}
        forceTheoryFirst={forceTheoryFirst}
        backHref={`/student?topic=${topicId ?? ""}`}
        canAskTeacher={!!user.teacherId}
        detailedPreview={detailedPreview}
        reminderHref={user.telegramChatId ? undefined : "/student/profile#telegram"}
      />
    </div>
  );
}
