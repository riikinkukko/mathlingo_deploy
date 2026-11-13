import { fail, json, requireUser } from "@/lib/mobile/api";
import { getStudentsOfTeacher } from "@/lib/queries";
import {
  teacherBuilder,
  teacherGroup,
  teacherGroups,
  teacherHome,
  teacherPayments,
  teacherQuestions,
  teacherReportDraft,
  teacherReviews,
  teacherSchedule,
  teacherSettings,
  teacherSkillProblems,
  teacherStudent,
} from "@/lib/mobile/teacher-data";

export const dynamic = "force-dynamic";

/**
 * Данные экранов репетитора: GET ?view=home|student&id=|schedule&week=|
 * reviews|payments|groups|group&id=|questions|builder&studentId=|groupId=|
 * problems&skillId=|settings (lib/mobile/teacher-data.ts).
 */
export async function GET(req: Request) {
  const user = await requireUser(req);
  if (user instanceof Response) return user;
  if (user.role !== "TEACHER") return fail("Только для репетитора", 403);
  const q = new URL(req.url).searchParams;
  const id = q.get("id") ?? "";
  const notFound = () => fail("Не найдено", 404);
  switch (q.get("view")) {
    case "home":
      return json(await teacherHome(user));
    case "student": {
      const d = await teacherStudent(user, id);
      return d ? json(d) : notFound();
    }
    case "schedule":
      return json(await teacherSchedule(user, q.get("week")));
    case "reviews":
      return json(await teacherReviews(user));
    case "payments":
      return json(await teacherPayments(user));
    case "groups":
      return json(await teacherGroups(user));
    case "group": {
      const d = await teacherGroup(user, id);
      return d ? json(d) : notFound();
    }
    case "questions":
      return json(await teacherQuestions(user));
    case "builder": {
      const d = await teacherBuilder(user, { studentId: q.get("studentId"), groupId: q.get("groupId") });
      return d ? json(d) : notFound();
    }
    case "problems":
      return json(await teacherSkillProblems(q.get("skillId") ?? ""));
    case "reportDraft": {
      const d = await teacherReportDraft(user, q.get("studentId") ?? "", q.get("lessonId"));
      return d ? json(d) : notFound();
    }
    case "settings":
      return json(teacherSettings(user, (await getStudentsOfTeacher(user.id)).length));
    default:
      return fail("Неизвестный раздел", 400);
  }
}
