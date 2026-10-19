import { notFound } from "next/navigation";
import { getSessionUser } from "@/lib/auth";
import { getProblem, toPublicProblem } from "@/lib/queries";
import type { Problem } from "@/lib/types";
import MockRunner from "@/components/mock/MockRunner";
import MockResults from "@/components/mock/MockResults";
import { autoFinishIfExpired, getMockAttempt, getMockImages } from "@/lib/mock-queries";
import { MOCK_MODES, isMockMode } from "@/lib/mock-exam";

export default async function MockAttemptPage(props: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ resume?: string }>;
}) {
  const { id } = await props.params;
  const { resume } = await props.searchParams;
  const user = (await getSessionUser())!;
  const raw = await getMockAttempt(id, user.id);
  if (!raw) notFound();
  const m = await autoFinishIfExpired(user, raw);

  const problems = new Map<string, Problem>(
    (await Promise.all(m.items.map((it) => getProblem(it.problemId))))
      .filter((p): p is Problem => !!p)
      .map((p) => [p.id, p])
  );
  const modeTitle = isMockMode(m.mode) ? MOCK_MODES[m.mode].title : "";

  if (!m.finishedAt) {
    const images = await getMockImages(m.id);
    return (
      <MockRunner
        mockId={m.id}
        variant={m.variant}
        modeTitle={modeTitle}
        deadlineAt={m.deadlineAt ? new Date(m.deadlineAt).toISOString() : null}
        items={m.items
          .filter((it) => problems.has(it.problemId))
          .map((it) => ({ n: it.n, problem: toPublicProblem(problems.get(it.problemId)!) }))}
        initialAnswers={m.answers}
        initialFlags={m.flags}
        initialTimeSpent={m.timeSpent}
        initialImages={images}
        hasTeacher={!!user.teacherId}
        resumed={resume === "1" || Object.keys(m.answers).length > 0}
      />
    );
  }

  return <MockResults m={m} problems={problems} modeTitle={modeTitle} hasTeacher={!!user.teacherId} targetScore={user.targetScore ?? null} studentId={user.id} />;
}
