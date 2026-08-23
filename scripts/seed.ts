import { db as pgDb } from "../lib/db/client";
import * as schema from "../lib/db/schema";
import { hashPassword } from "../lib/auth";
import { DB, Skill } from "../lib/types";
import { sql } from "drizzle-orm";
import { config } from "dotenv";
import path from "path";

// Явно грузим .env.local — не как CLI-обёртку (dotenv-cli конфликтовал с
// одноимённой командой из Python на некоторых машинах), а прямым вызовом
// функции пакета dotenv. Это обычный вызов (не import), поэтому выполняется
// именно здесь, после того как импорты выше уже разрешились — что нормально:
// клиент БД (lib/db/client.ts) теперь ленивый и не трогает DATABASE_URL до
// первого реального запроса, а первый запрос случится только внутри main()
// ниже, то есть уже после этой строчки.
config({ path: path.resolve(__dirname, "../.env.local") });

// Детерминированный генератор id: при каждом запуске скрипта вызовы в одном
// и том же порядке дают одни и те же id (в отличие от случайного genId).
// Это и есть ключ к безопасному повторному запуску — id контента не
// меняются, поэтому прогресс/попытки/домашки, ссылающиеся на них, не
// осиротеют. Наращивайте контент, добавляя новые блоки В КОНЕЦ
// соответствующего раздела — тогда старые id не сдвинутся.
const counters: Record<string, number> = {};
function stableId(prefix: string) {
  counters[prefix] = (counters[prefix] ?? 0) + 1;
  return `${prefix}_${counters[prefix]}`;
}

const RESET = process.argv.includes("--reset");

async function main() {
  if (RESET) {
    console.log("⚠️  Режим --reset: база будет полностью пересоздана, все реальные данные будут стёрты.");
    // Порядок важен из-за внешних ключей — сначала таблицы, которые
    // ссылаются на других, потом на кого ссылаются.
    await pgDb.delete(schema.assignmentSessions);
    await pgDb.delete(schema.notifications);
    await pgDb.delete(schema.attempts);
    await pgDb.delete(schema.lessonLogs);
    await pgDb.delete(schema.homeworks);
    await pgDb.delete(schema.problems);
    await pgDb.delete(schema.skills);
    await pgDb.delete(schema.subtopics);
    await pgDb.delete(schema.topics);
    await pgDb.delete(schema.parentLinks);
    await pgDb.delete(schema.users);
  }

  const [{ count: userCount }] = await pgDb
    .select({ count: sql<number>`count(*)::int` })
    .from(schema.users);
  const isFreshInstall = userCount === 0;

  // Локальный накопитель — всё неизменённое тело скрипта ниже наполняет этот
  // обычный JS-объект через db.xxx.push(...), как и раньше. Реальная запись
  // в Postgres происходит в самом конце через commitToDatabase(db, ...).
  const db: DB = {
    users: [],
    parentLinks: [],
    topics: [],
    subtopics: [],
    skills: [],
    problems: [],
    attempts: [],
    homeworks: [],
    assignmentSessions: [],
    lessonLogs: [],
    notifications: [],
  };

  // ---------------- Пользователи (только при первом запуске — на пустой БД) ----------------
  let teacherId = "";
  let student1Id = "";
  let student2Id = "";
  let student3Id = "";
  let freeUserId = "";
  let proUserId = "";
  let srsTestUserId = "";
  let parentId = "";

  if (isFreshInstall) {
    teacherId = stableId("u");
    student1Id = stableId("u");
    student2Id = stableId("u");
    student3Id = stableId("u");
    freeUserId = stableId("u");
    proUserId = stableId("u");
    srsTestUserId = stableId("u");
    parentId = stableId("u");

    const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();

    db.users.push(
      {
        id: teacherId,
        name: "Анна Петровна",
        email: "teacher@demo.ru",
        passwordHash: await hashPassword("demo1234"),
        role: "TEACHER",
        // ВАЖНО: раньше здесь было isAdmin: true жёстко — исходило из
        // предположения "учитель всего один, значит он же владелец
        // платформы". Это предположение больше не верно (учителей может
        // быть несколько), поэтому isAdmin теперь определяется явно через
        // ADMIN_EMAIL — совпадает email этого демо-аккаунта с переменной
        // окружения или нет. Без заданного ADMIN_EMAIL демо-учитель
        // остаётся админом ради удобства локальной разработки (это
        // единственный учитель на chistoй demo-базе, конфликта нет).
        //
        // На ПРОДАКШЕНЕ, если владелец платформы регистрируется как
        // обычный учитель (не через seed, а через реальную регистрацию/
        // ручное создание учётки), seed.ts не может найти и пометить его
        // аккаунт — тот создаётся с другим ID, не через stableId(). Права
        // администратора в этом случае нужно назначить ОДНОКРАТНО вручную
        // прямым SQL-запросом на продакшен-базе:
        //   UPDATE users SET is_admin = true WHERE email = 'ваш@email';
        // Это предсказуемее и безопаснее, чем любая автоматическая логика
        // по количеству учителей или порядку регистрации.
        isAdmin: process.env.ADMIN_EMAIL ? process.env.ADMIN_EMAIL === "teacher@demo.ru" : true,
        createdAt: new Date().toISOString(),
      },
      {
        id: student1Id,
        name: "Максим Орлов",
        email: "student@demo.ru",
        passwordHash: await hashPassword("demo1234"),
        role: "STUDENT",
        teacherId,
        createdAt: new Date().toISOString(),
      },
      {
        id: student2Id,
        name: "Софья Ким",
        email: "student2@demo.ru",
        passwordHash: await hashPassword("demo1234"),
        role: "STUDENT",
        teacherId,
        createdAt: new Date().toISOString(),
      },
      {
        id: student3Id,
        name: "Полина Соколова",
        email: "student3@demo.ru",
        passwordHash: await hashPassword("demo1234"),
        role: "STUDENT",
        teacherId,
        createdAt: new Date().toISOString(),
      },
      {
        id: freeUserId,
        name: "Дима Волков",
        email: "free@demo.ru",
        passwordHash: await hashPassword("demo1234"),
        role: "STUDENT",
        plan: "free",
        energy: 1,
        energyUpdatedAt: oneHourAgo,
        createdAt: new Date().toISOString(),
      },
      {
        id: proUserId,
        name: "Катя Никитина",
        email: "pro@demo.ru",
        passwordHash: await hashPassword("demo1234"),
        role: "STUDENT",
        plan: "pro",
        createdAt: new Date().toISOString(),
      },
      {
        // Специально для проверки SRS: часть задач уже "просрочена" для
        // повторения, часть ещё нет — реалистичная смешанная очередь.
        id: srsTestUserId,
        name: "Артём Волков",
        email: "srs@demo.ru",
        passwordHash: await hashPassword("demo1234"),
        role: "STUDENT",
        teacherId,
        createdAt: new Date().toISOString(),
      },
      {
        id: parentId,
        name: "Ирина Орлова",
        email: "parent@demo.ru",
        passwordHash: await hashPassword("demo1234"),
        role: "PARENT",
        createdAt: new Date().toISOString(),
      }
    );
    db.parentLinks.push({ parentId, studentId: student1Id });
  }
  // ---------------- Модуль: Планиметрия ----------------
  const topicId = stableId("t");
  db.topics.push({ id: topicId, order: 1, title: "Планиметрия" });

  // Главы (Subtopic = Chapter)
  const chTriangle = stableId("s");
  const chRectangle = stableId("s");
  const chParallelogram = stableId("s");
  const chTrapezoid = stableId("s");
  const chCircle = stableId("s");
  const chQuad = stableId("s");

  db.subtopics.push(
    { id: chTriangle, topicId, order: 1, title: "Треугольники" },
    { id: chRectangle, topicId, order: 2, title: "Прямоугольник и квадрат" },
    { id: chParallelogram, topicId, order: 3, title: "Параллелограмм и ромб" },
    { id: chTrapezoid, topicId, order: 4, title: "Трапеция" },
    { id: chCircle, topicId, order: 5, title: "Окружность" },
    { id: chQuad, topicId, order: 6, title: "Четырёхугольники" }
  );

  // ---------------- Навыки (Skill) ----------------
  // ---------------- Навыки (Skill) ----------------
  const skAngles = stableId("sk");
  const skCevians = stableId("sk");
  const skArea = stableId("sk");
  const skCongruentSimilar = stableId("sk");
  const skPythagoras = stableId("sk");
  const skTrigTheorems = stableId("sk");
  const skAdvanced = stableId("sk");
  const skRectangleAreaPerimeter = stableId("sk");
  const skRectangleDiagonal = stableId("sk");
  const skSquare = stableId("sk");
  const skParallelogramArea = stableId("sk");
  const skParallelogramAnglesDiagonals = stableId("sk");
  const skRhombus = stableId("sk");
  const skTrapezoidMidlineArea = stableId("sk");
  const skTrapezoidAnglesSides = stableId("sk");
  const skTrapezoidDiagonals = stableId("sk");
  const skCircleLengthArea = stableId("sk");
  const skCircleAngles = stableId("sk");
  const skCircleTangents = stableId("sk");
  const skCircleChords = stableId("sk");
  const skQuadArea = stableId("sk");
  const skPtolemy = stableId("sk");
  const skVarignon = stableId("sk");
  const skKite = stableId("sk");
  const skTrapezoidAdvanced = stableId("sk");
  const skTriangleCenters = stableId("sk");
  const skExcenter = stableId("sk");
  const skCyclicTangentialQuad = stableId("sk");
  const skSectorSimilar = stableId("sk");
  const skills: Skill[] = [
    {
      id: skAngles,
      subtopicId: chTriangle,
      order: 1,
      title: "Углы, внешний угол и неравенство треугольника",
      theoryCards: [
        {
          title: "Сумма углов треугольника",
          formula: "∠A + ∠B + ∠C = 180°",
          body: "В любом треугольнике — остроугольном, тупоугольном, прямоугольном — сумма всех трёх углов всегда равна 180°.",
          diagram: { kind: "triangleAngles", a: "?", b: "?", c: "?" },
        },
        {
          title: "Равнобедренный треугольник",
          formula: "∠A = ∠B (углы при основании)",
          body: "В равнобедренном треугольнике углы при основании равны между собой. Это часто позволяет найти угол при вершине, зная только один угол при основании.",
          diagram: { kind: "triangleAngles", a: "?", b: "?", c: "?", symmetric: true },
        },
        {
          title: "Внешний угол треугольника",
          formula: "∠внешний = ∠A + ∠B",
          body: "Внешний угол треугольника равен сумме двух внутренних углов, не смежных с ним. Внешний и смежный с ним внутренний угол в сумме дают 180°.",
        },
        {
          title: "Неравенство треугольника",
          formula: "|a − b| < c < a + b",
          body: "Каждая сторона треугольника меньше суммы двух других сторон и больше их разности — иначе треугольник просто не существует.",
        },
      ],
    },
    {
      id: skCevians,
      subtopicId: chTriangle,
      order: 2,
      title: "Биссектриса, медиана и высота",
      theoryCards: [
        {
          title: "Медиана",
          body: "Медиана соединяет вершину с серединой противоположной стороны — то есть делит эту сторону на два равных отрезка.",
          diagram: { kind: "triangleCevian", base: "a", variant: "median" },
        },
        {
          title: "Биссектриса",
          formula: "BD/DC = AB/BC",
          body: "Биссектриса делит угол пополам и делит противоположную сторону на отрезки, пропорциональные прилежащим сторонам (свойство биссектрисы).",
          diagram: { kind: "triangleCevian", base: "a", variant: "bisector" },
        },
        {
          title: "Высота",
          body: "Высота — перпендикуляр из вершины к противоположной стороне (или её продолжению). В прямоугольном треугольнике высота к гипотенузе связана с катетами и отрезками, на которые она делит гипотенузу.",
          diagram: { kind: "triangleCevian", base: "a", height: "h", variant: "height" },
        },
      ],
    },
    {
      id: skArea,
      subtopicId: chTriangle,
      order: 3,
      title: "Площадь треугольника",
      theoryCards: [
        {
          title: "Площадь через основание и высоту",
          formula: "S = ½ · a · h",
          body: "Самая базовая формула: половина произведения стороны на высоту, проведённую именно к ней.",
          diagram: { kind: "triangleCevian", base: "a", height: "h", variant: "height" },
        },
        {
          title: "Площадь через две стороны и синус угла",
          formula: "S = ½ · a · b · sin C",
          body: "Удобна, когда известны две стороны и угол между ними — высоту искать не нужно.",
        },
        {
          title: "Формула Герона",
          formula: "S = √(p(p−a)(p−b)(p−c))",
          body: "Если известны все три стороны, площадь ищется через полупериметр p = (a+b+c)/2 — без углов и высот.",
        },
        {
          title: "Площадь через вписанную окружность",
          formula: "S = r · p",
          body: "Где r — радиус вписанной окружности, p — полупериметр треугольника.",
        },
      ],
    },
    {
      id: skCongruentSimilar,
      subtopicId: chTriangle,
      order: 4,
      title: "Равенство и подобие треугольников",
      theoryCards: [
        {
          title: "Признаки равенства треугольников",
          body: "Треугольники равны, если у них равны: три стороны (I признак); две стороны и угол между ними (II); сторона и два прилежащих угла (III). В равных треугольниках все соответственные элементы равны.",
        },
        {
          title: "Средняя линия треугольника",
          formula: "MN = ½ · BC",
          body: "Средняя линия соединяет середины двух сторон, параллельна третьей стороне и равна её половине.",
        },
        {
          title: "Подобие треугольников",
          formula: "P₂ = P₁ · k",
          body: "Если треугольники подобны с коэффициентом k, все их линейные размеры — стороны, периметр, высоты, медианы — отличаются ровно в k раз.",
          diagram: { kind: "triangleSimilarPair", small: "P₁", large: "P₂", factor: "×k" },
        },
        {
          title: "Пропорциональные отрезки",
          formula: "AM/MB = AN/NC",
          body: "Прямая, параллельная стороне треугольника, отсекает на двух других сторонах пропорциональные отрезки — и образует треугольник, подобный исходному.",
        },
      ],
    },
    {
      id: skPythagoras,
      subtopicId: chTriangle,
      order: 5,
      title: "Теорема Пифагора",
      theoryCards: [
        {
          title: "Теорема Пифагора",
          formula: "a² + b² = c²",
          body: "Работает только для прямоугольного треугольника: c — гипотенуза (сторона напротив прямого угла), a и b — катеты.",
          diagram: { kind: "triangleRight", a: "a", b: "b", c: "c" },
        },
        {
          title: "Как узнать прямоугольный треугольник по сторонам",
          formula: "5² + 12² = 13²",
          body: "Если для трёх данных сторон выполняется равенство теоремы Пифагора — треугольник прямоугольный, даже если это не сказано явно в условии.",
        },
        {
          title: "Медиана к гипотенузе",
          body: "В прямоугольном треугольнике медиана, проведённая к гипотенузе, равна половине гипотенузы — она же радиус окружности, описанной около треугольника.",
        },
      ],
    },
    {
      id: skTrigTheorems,
      subtopicId: chTriangle,
      order: 6,
      title: "Теоремы Фалеса, синусов и косинусов",
      theoryCards: [
        {
          title: "Теорема Фалеса",
          formula: "AB/BC = A₁B₁/B₁C₁",
          body: "Параллельные прямые, пересекающие стороны угла (или две прямые), отсекают на них пропорциональные отрезки.",
        },
        {
          title: "Теорема синусов",
          formula: "a/sin A = b/sin B = 2R",
          body: "Отношение стороны к синусу противолежащего угла одинаково для всех трёх сторон треугольника и равно диаметру описанной окружности.",
        },
        {
          title: "Теорема косинусов",
          formula: "c² = a² + b² − 2ab·cos C",
          body: "Обобщение теоремы Пифагора на произвольный угол между сторонами — работает для любого треугольника, не только прямоугольного.",
        },
      ],
    },
    {
      id: skAdvanced,
      subtopicId: chTriangle,
      order: 7,
      title: "Продвинутые теоремы: Чева, Менелай, Стюарт",
      theoryCards: [
        {
          title: "Теорема Чевы",
          formula: "(BD/DC)·(CE/EA)·(AF/FB) = 1",
          body: "Три чевианы треугольника (отрезки из вершин к противоположным сторонам) пересекаются в одной точке тогда и только тогда, когда это произведение равно 1. Продвинутая тема — реже встречается на экзамене, но полезна для сильных задач.",
        },
        {
          title: "Теорема Менелая",
          formula: "(AF/FB)·(BD/DC)·(CE/EA) = 1",
          body: "Похожа на теорему Чевы, но описывает прямую, пересекающую стороны треугольника (и одно продолжение), а не чевианы из вершин.",
        },
        {
          title: "Теорема Стюарта",
          formula: "b²m + c²n = a(d² + mn)",
          body: "Связывает длину произвольной чевианы d с длинами сторон треугольника a, b, c и отрезками m, n, на которые чевиана делит сторону a.",
        },
      ],
    },
    {
      id: skRectangleAreaPerimeter,
      subtopicId: chRectangle,
      order: 1,
      title: "Прямоугольник: площадь и периметр",
      theoryCards: [
        {
          title: "Прямоугольник",
          formula: "S = a·b,  P = 2(a+b)",
          body: "Четырёхугольник, у которого все углы равны 90°, противоположные стороны равны и параллельны.",
          diagram: { kind: "rectangle", a: "a", b: "b" },
        },
      ],
    },
    {
      id: skRectangleDiagonal,
      subtopicId: chRectangle,
      order: 2,
      title: "Прямоугольник: диагональ",
      theoryCards: [
        {
          title: "Диагональ прямоугольника",
          formula: "d = √(a² + b²)",
          body: "Диагонали прямоугольника равны и точкой пересечения делятся пополам.",
          diagram: { kind: "rectangle", a: "a", b: "b", diagonal: "d" },
        },
        {
          title: "Прямоугольник, вписанный в окружность",
          body: "Если прямоугольник вписан в окружность, его диагональ равна диаметру этой окружности.",
          diagram: { kind: "rectangle", a: "a", b: "b", circumscribed: true, radius: "r" },
        },
      ],
    },
    {
      id: skSquare,
      subtopicId: chRectangle,
      order: 3,
      title: "Квадрат",
      theoryCards: [
        {
          title: "Квадрат",
          formula: "S = a²,  P = 4a,  d = a√2",
          body: "Квадрат — частный случай прямоугольника, у которого все стороны равны.",
          diagram: { kind: "rectangle", a: "a", b: "a", isSquare: true },
        },
      ],
    },
    {
      id: skParallelogramArea,
      subtopicId: chParallelogram,
      order: 1,
      title: "Параллелограмм: стороны и площадь",
      theoryCards: [
        {
          title: "Параллелограмм",
          formula: "S = a·h",
          body: "Четырёхугольник, у которого противоположные стороны равны и параллельны. Площадь — сторона, умноженная на высоту, проведённую к ней.",
          diagram: { kind: "parallelogram", a: "a", h: "h" },
        },
        {
          title: "Площадь через две стороны и синус угла",
          formula: "S = a·b·sin C",
          body: "Удобна, когда известны две смежные стороны и угол между ними — высоту искать не нужно.",
        },
      ],
    },
    {
      id: skParallelogramAnglesDiagonals,
      subtopicId: chParallelogram,
      order: 2,
      title: "Параллелограмм: углы и диагонали",
      theoryCards: [
        {
          title: "Углы параллелограмма",
          formula: "∠1 + ∠2 = 180°",
          body: "Сумма соседних (не противоположных) углов параллелограмма всегда равна 180°. Противоположные углы равны между собой.",
          diagram: { kind: "parallelogram", angleLabel: "∠1" },
        },
        {
          title: "Диагонали параллелограмма",
          formula: "d₁² + d₂² = 2(a² + b²)",
          body: "Диагонали точкой пересечения делятся пополам. Сумма квадратов диагоналей равна удвоенной сумме квадратов сторон.",
          diagram: { kind: "parallelogram", showDiagonals: true, d1: "d₁", d2: "d₂" },
        },
      ],
    },
    {
      id: skRhombus,
      subtopicId: chParallelogram,
      order: 3,
      title: "Ромб",
      theoryCards: [
        {
          title: "Ромб",
          formula: "S = (d₁·d₂) / 2",
          body: "Ромб — параллелограмм с равными сторонами. Его диагонали перпендикулярны и точкой пересечения делятся пополам.",
          diagram: { kind: "parallelogram", showDiagonals: true, d1: "d₁", d2: "d₂", equalSides: true },
        },
        {
          title: "Сторона ромба через диагонали",
          body: "Половины диагоналей и сторона образуют прямоугольный треугольник — сторону можно найти по теореме Пифагора.",
        },
      ],
    },
    {
      id: skTrapezoidMidlineArea,
      subtopicId: chTrapezoid,
      order: 1,
      title: "Трапеция: средняя линия и площадь",
      theoryCards: [
        {
          title: "Средняя линия трапеции",
          formula: "m = (a + b) / 2",
          body: "Средняя линия соединяет середины боковых сторон и равна полусумме оснований.",
          diagram: { kind: "trapezoid", top: "a", bottom: "b", midline: "m" },
        },
        {
          title: "Площадь трапеции",
          formula: "S = (a + b)/2 · h = m·h",
          body: "Площадь — полусумма оснований (то есть средняя линия), умноженная на высоту.",
          diagram: { kind: "trapezoid", top: "a", bottom: "b", height: "h" },
        },
      ],
    },
    {
      id: skTrapezoidAnglesSides,
      subtopicId: chTrapezoid,
      order: 2,
      title: "Трапеция: углы и боковые стороны",
      theoryCards: [
        {
          title: "Углы трапеции",
          formula: "∠1 + ∠2 = 180°",
          body: "Углы, прилежащие к одной боковой стороне (между параллельными основаниями), в сумме дают 180°. В равнобедренной трапеции углы при каждом основании равны.",
          diagram: { kind: "trapezoid", angleLabel: "∠1" },
        },
        {
          title: "Боковая сторона равнобедренной трапеции",
          body: "Если опустить высоты из вершин меньшего основания, по бокам образуются два равных прямоугольных треугольника с катетом (a−b)/2 — отсюда сторону можно найти по теореме Пифагора.",
        },
      ],
    },
    {
      id: skTrapezoidDiagonals,
      subtopicId: chTrapezoid,
      order: 3,
      title: "Трапеция: диагонали",
      theoryCards: [
        {
          title: "Диагонали трапеции",
          body: "Диагонали трапеции делятся точкой пересечения в отношении, равном отношению оснований. Треугольники, прилежащие к основаниям, подобны.",
        },
        {
          title: "Отрезок через точку пересечения диагоналей",
          formula: "x = 2ab / (a+b)",
          body: "Отрезок прямой, параллельной основаниям и проходящей через точку пересечения диагоналей, между боковыми сторонами.",
        },
      ],
    },
    {
      id: skCircleLengthArea,
      subtopicId: chCircle,
      order: 1,
      title: "Окружность: длина и площадь круга",
      theoryCards: [
        {
          title: "Длина окружности и площадь круга",
          formula: "C = 2πr,  S = πr²",
          body: "Обе формулы выражаются через радиус r.",
          diagram: { kind: "circle", mode: "radius", r: "r" },
        },
      ],
    },
    {
      id: skCircleAngles,
      subtopicId: chCircle,
      order: 2,
      title: "Центральные и вписанные углы",
      theoryCards: [
        {
          title: "Центральный и вписанный угол",
          formula: "∠вписанный = ∠центральный / 2",
          body: "Вписанный угол, опирающийся на ту же дугу, что и центральный, всегда вдвое меньше центрального.",
          diagram: { kind: "circle", mode: "centralInscribed", central: "∠O", inscribed: "∠C" },
        },
        {
          title: "Вписанные углы на одной дуге",
          body: "Все вписанные углы, опирающиеся на одну и ту же дугу, равны между собой. Угол, опирающийся на диаметр, всегда равен 90°.",
        },
      ],
    },
    {
      id: skCircleTangents,
      subtopicId: chCircle,
      order: 3,
      title: "Касательные к окружности",
      theoryCards: [
        {
          title: "Касательная и радиус",
          body: "Касательная перпендикулярна радиусу, проведённому в точку касания.",
        },
        {
          title: "Отрезки касательных",
          body: "Отрезки касательных, проведённые из одной внешней точки, равны.",
          diagram: { kind: "circle", mode: "tangent", t1: "t", t2: "t" },
        },
      ],
    },
    {
      id: skCircleChords,
      subtopicId: chCircle,
      order: 4,
      title: "Хорды и секущие",
      theoryCards: [
        {
          title: "Хорда и перпендикуляр из центра",
          body: "Перпендикуляр из центра окружности к хорде делит эту хорду пополам.",
          diagram: { kind: "circle", mode: "chord", r: "r", d: "d" },
        },
        {
          title: "Пересекающиеся хорды",
          formula: "a·b = c·d",
          body: "Если две хорды пересекаются внутри окружности, произведения отрезков одной хорды равно произведению отрезков другой.",
        },
        {
          title: "Касательная и секущая",
          formula: "t² = d·(d + внутр. часть)",
          body: "Квадрат касательной равен произведению всей секущей на её внешнюю часть. Для двух секущих из одной точки: произведения полных секущих на их внешние части равны.",
        },
      ],
    },
    {
      id: skQuadArea,
      subtopicId: chQuad,
      order: 1,
      title: "Площадь четырёхугольника: общая формула и Брахмагупта",
      theoryCards: [
        {
          title: "Площадь через диагонали",
          formula: "S = ½ · d₁ · d₂ · sin θ",
          body: "Площадь ЛЮБОГО четырёхугольника (не только параллелограмма) можно найти через длины диагоналей и угол между ними.",
        },
        {
          title: "Формула Брахмагупты",
          formula: "S = √((p−a)(p−b)(p−c)(p−d))",
          body: "Для четырёхугольника, вписанного в окружность, площадь можно найти только по длинам сторон — так же, как формула Герона для треугольника. Здесь p — полупериметр.",
        },
      ],
    },
    {
      id: skPtolemy,
      subtopicId: chQuad,
      order: 2,
      title: "Теорема Птолемея",
      theoryCards: [
        {
          title: "Теорема Птолемея",
          formula: "AC · BD = AB · CD + BC · AD",
          body: "Для четырёхугольника ABCD, вписанного в окружность: произведение диагоналей равно сумме произведений противоположных сторон.",
        },
        {
          title: "Частный случай — прямоугольник",
          body: "Если четырёхугольник — прямоугольник, теорема Птолемея превращается в теорему Пифагора: диагонали равны, и AC² = AB² + BC².",
        },
      ],
    },
    {
      id: skVarignon,
      subtopicId: chQuad,
      order: 3,
      title: "Теорема Вариньона",
      theoryCards: [
        {
          title: "Параллелограмм Вариньона",
          body: "Если соединить последовательно середины сторон ЛЮБОГО четырёхугольника (даже невыпуклого), всегда получится параллелограмм.",
        },
        {
          title: "Свойства параллелограмма Вариньона",
          formula: "P = d₁ + d₂,  S = S₀ / 2",
          body: "Стороны параллелограмма Вариньона параллельны диагоналям исходного четырёхугольника и равны их половинам. Поэтому его периметр равен сумме диагоналей, а площадь — ровно половине площади исходного четырёхугольника.",
        },
      ],
    },
    {
      id: skKite,
      subtopicId: chQuad,
      order: 4,
      title: "Дельтоид",
      theoryCards: [
        {
          title: "Что такое дельтоид",
          body: "Дельтоид (кайт) — четырёхугольник с двумя парами смежных (соседних) равных сторон. Одна из диагоналей — ось симметрии.",
        },
        {
          title: "Свойства дельтоида",
          formula: "S = ½ · d₁ · d₂",
          body: "Диагонали дельтоида перпендикулярны — площадь считается как у ромба. Ось симметрии делит угол пополам (является биссектрисой) и делит вторую диагональ пополам. Углы при вершинах, не лежащих на оси симметрии, равны между собой.",
        },
      ],
    },
    {
      id: skTrapezoidAdvanced,
      subtopicId: chTrapezoid,
      order: 4,
      title: "Трапеция: продвинутые свойства",
      theoryCards: [
        {
          title: "Трапеция, описанная около окружности",
          formula: "AD + BC = AB + CD",
          body: "Если в трапецию можно вписать окружность (касающуюся всех 4 сторон), то сумма оснований равна сумме боковых сторон — как и у любого описанного четырёхугольника.",
        },
        {
          title: "Отрезок между серединами диагоналей",
          formula: "EF = (AD − BC) / 2",
          body: "Отрезок, соединяющий середины диагоналей трапеции, лежит на средней линии и равен полуразности оснований.",
        },
        {
          title: "Проекция боковой стороны равнобедренной трапеции",
          formula: "проекция = (AD − BC) / 2",
          body: "Если опустить высоту из вершины меньшего основания равнобедренной трапеции на большее основание, отрезок от этой точки до ближайшей вершины большего основания равен полуразности оснований.",
        },
        {
          title: "Замечательное свойство трапеции",
          body: "Середины оснований, точка пересечения диагоналей и точка пересечения продолжений боковых сторон — все четыре точки лежат на одной прямой.",
        },
      ],
    },
    {
      id: skTriangleCenters,
      subtopicId: chCircle,
      order: 5,
      title: "Центр вписанной и описанной окружности треугольника",
      theoryCards: [
        {
          title: "Центр вписанной окружности (инцентр)",
          formula: "r = S / p",
          body: "Точка пересечения биссектрис треугольника равноудалена от всех трёх сторон — это центр вписанной окружности. Радиус находится через площадь и полупериметр.",
        },
        {
          title: "Центр описанной окружности",
          formula: "R = (a·b·c) / (4S)",
          body: "Точка пересечения серединных перпендикуляров к сторонам треугольника равноудалена от всех трёх вершин — это центр описанной окружности. В прямоугольном треугольнике он лежит на середине гипотенузы.",
        },
      ],
    },
    {
      id: skExcenter,
      subtopicId: chCircle,
      order: 6,
      title: "Вневписанная окружность",
      theoryCards: [
        {
          title: "Что такое вневписанная окружность",
          body: "Вневписанная окружность касается одной стороны треугольника и продолжений двух других сторон. У каждого треугольника — три вневписанные окружности (по одной на каждую сторону).",
        },
        {
          title: "Радиус вневписанной окружности",
          formula: "rₐ = S / (p − a)",
          body: "Радиус вневписанной окружности, противоположной стороне a, равен площади треугольника, делённой на разность полупериметра и стороны a.",
        },
      ],
    },
    {
      id: skCyclicTangentialQuad,
      subtopicId: chCircle,
      order: 7,
      title: "Вписанный и описанный четырёхугольник",
      theoryCards: [
        {
          title: "Вписанный четырёхугольник",
          formula: "∠A + ∠C = ∠B + ∠D = 180°",
          body: "Четырёхугольник можно вписать в окружность тогда и только тогда, когда суммы его противоположных углов равны 180°.",
        },
        {
          title: "Описанный четырёхугольник",
          formula: "AB + CD = BC + AD",
          body: "В четырёхугольник можно вписать окружность (касающуюся всех сторон) тогда и только тогда, когда суммы его противоположных сторон равны.",
        },
      ],
    },
    {
      id: skSectorSimilar,
      subtopicId: chCircle,
      order: 8,
      title: "Площадь сектора и подобие в окружностях",
      theoryCards: [
        {
          title: "Площадь кругового сектора",
          formula: "S = (π·r²·α) / 360°",
          body: "Площадь сектора — части круга между двумя радиусами — пропорциональна центральному углу α (в градусах).",
        },
        {
          title: "Подобные треугольники в окружности",
          body: "Если из одной точки проведены две хорды (или секущие), треугольники, образованные этими хордами и стягиваемыми ими дугами, подобны — по двум вписанным углам, опирающимся на одну дугу.",
        },
      ],
    },
  ];
  db.skills.push(...skills);

  // ---------------- Задачи ----------------

  // Углы, внешний угол и неравенство треугольника
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skAngles,
      text: "В треугольнике два угла равны 50° и 70°. Найдите третий угол в градусах.",
      answerType: "NUMBER",
      correctAnswer: "60",
      diagram: { kind: "triangleAngles", a: "50°", b: "70°", c: "?" },
      keyFormula: "∠A+∠B+∠C=180°",
      hints: [
        "Вспомните: сумма всех трёх углов в любом треугольнике — это одно и то же фиксированное число. Какое?",
        "Сложите два известных угла и вычтите результат из суммы всех углов треугольника.",
      ],
      explanation: "Сумма углов треугольника 180°. 180 − 50 − 70 = 60.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skAngles,
      text: "В равнобедренном треугольнике угол при основании равен 65°. Найдите угол при вершине в градусах.",
      answerType: "NUMBER",
      correctAnswer: "50",
      diagram: { kind: "triangleAngles", a: "65°", b: "65°", c: "?", symmetric: true },
      keyFormula: "∠A+∠B+∠C=180°",
      hints: [
        "В равнобедренном треугольнике углы при основании равны между собой. Сначала найдите их сумму.",
        "Сумма углов при основании: 65°+65°. Вычтите это значение из 180°, чтобы найти угол при вершине.",
      ],
      explanation: "Углы при основании равны, их сумма 130°. Угол при вершине: 180 − 130 = 50.",
      difficulty: 2,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skAngles,
      text: "В треугольнике один угол равен 90°, а другой в два раза меньше третьего. Найдите наименьший угол треугольника в градусах.",
      diagram: { kind: "triangleAngles", a: "90°", b: "?", c: "?" },
      answerType: "NUMBER",
      correctAnswer: "30",
      tier: "bank",
      keyFormula: "∠A+∠B+∠C=180°",
      hints: [
        "Сумма двух острых углов прямоугольного треугольника равна 90°.",
        "Обозначьте больший из острых углов x, меньший — x/2. Составьте уравнение x + x/2 = 90 и решите его.",
      ],
      explanation: "Острые углы в сумме дают 90°. x + x/2 = 90 → 1,5x=90 → x=60, второй угол 30. Углы треугольника: 90, 60, 30. Наименьший — 30.",
      difficulty: 2,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skAngles,
      text: "Углы треугольника относятся как 2:3:4. Найдите наибольший угол в градусах.",
      diagram: { kind: "triangleAngles", a: "2x", b: "3x", c: "4x" },
      answerType: "NUMBER",
      correctAnswer: "80",
      tier: "bank",
      keyFormula: "∠A+∠B+∠C=180°",
      hints: [
        "Сумма всех частей отношения (2+3+4=9) соответствует сумме углов треугольника 180°.",
        "Найдите цену одной части (180° разделить на 9), затем умножьте на наибольшую часть отношения (4).",
      ],
      explanation: "Одна часть: 180/9=20°. Наибольший угол: 4×20=80°.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skAngles,
      text: "Внешний угол треугольника при вершине C равен 130°. Внутренний угол при вершине A равен 50°. Найдите угол при вершине B.",
      diagram: { kind: "triangleExteriorAngle", inner1: "50°", exterior: "130°" },
      answerType: "NUMBER",
      correctAnswer: "80",
      keyFormula: "∠внешний=∠A+∠B",
      hints: [
        "Внешний угол треугольника равен сумме двух внутренних углов, не смежных с ним.",
        "130° = ∠A + ∠B. Подставьте известный угол A и найдите угол B.",
      ],
      explanation: "∠внешний = ∠A+∠B → 130=50+∠B → ∠B=80.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skAngles,
      text: "Два внутренних угла треугольника равны 40° и 65°. Найдите внешний угол при третьей вершине.",
      diagram: { kind: "triangleExteriorAngle", inner1: "40°", inner2: "65°", exterior: "?" },
      answerType: "NUMBER",
      correctAnswer: "105",
      tier: "bank",
      keyFormula: "∠внешний=∠A+∠B",
      hints: [
        "Внешний угол при вершине равен сумме двух внутренних углов, не смежных с ним — то есть двух ДРУГИХ вершин.",
        "Сложите два данных угла.",
      ],
      explanation: "Внешний угол при третьей вершине равен сумме двух других внутренних углов: 40+65=105.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skAngles,
      text: "Внешний угол при вершине A треугольника ABC равен 110°, а внешний угол при вершине B равен 130°. Найдите угол при вершине C.",
      answerType: "NUMBER",
      correctAnswer: "60",
      tier: "bank",
      keyFormula: "∠внутр=180°−∠внешн",
      hints: [
        "Внешний и внутренний угол при одной и той же вершине — смежные, в сумме дают 180°.",
        "Найдите внутренние углы A и B через их внешние, затем угол C — из суммы углов треугольника.",
      ],
      explanation: "∠A=180−110=70. ∠B=180−130=50. ∠C=180−70−50=60.",
      difficulty: 2,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skAngles,
      text: "Стороны треугольника равны 5 и 9. Третья сторона — целое число. Найдите наибольшее возможное значение третьей стороны.",
      answerType: "NUMBER",
      correctAnswer: "13",
      keyFormula: "|a−b|<c<a+b",
      hints: [
        "Третья сторона треугольника должна быть больше разности и меньше суммы двух других сторон.",
        "Разность сторон равна 4, сумма — 14. Третья сторона строго между ними — найдите наибольшее целое значение.",
      ],
      explanation: "|9−5|<c<9+5 → 4<c<14. Наибольшее целое значение: 13.",
      difficulty: 2,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skAngles,
      text: "Стороны треугольника равны 3 и 8. Третья сторона — целое число. Найдите наименьшее возможное значение третьей стороны.",
      answerType: "NUMBER",
      correctAnswer: "6",
      tier: "bank",
      keyFormula: "|a−b|<c<a+b",
      hints: [
        "Третья сторона должна быть больше разности и меньше суммы двух других сторон.",
        "Разность равна 5, сумма — 11. Найдите наименьшее целое строго между ними.",
      ],
      explanation: "|8−3|<c<8+3 → 5<c<11. Наименьшее целое значение: 6.",
      difficulty: 2,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skAngles,
      text: "Периметр треугольника равен 20, а одна из сторон равна 9. Другая сторона на 3 больше третьей. Найдите большую из этих двух оставшихся сторон.",
      answerType: "NUMBER",
      correctAnswer: "7",
      tier: "bank",
      keyFormula: "P=a+b+c",
      hints: [
        "Периметр — это сумма всех трёх сторон.",
        "Обозначьте меньшую из двух оставшихся сторон x, большую x+3. Составьте уравнение 9+x+(x+3)=20.",
      ],
      explanation: "9+x+(x+3)=20 → 2x=8 → x=4, вторая сторона 4+3=7. Большая из двух — 7.",
      difficulty: 2,
      egeTaskNumber: 13,
    }
  );

  // Биссектриса, медиана и высота
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skCevians,
      text: "Медиана треугольника проведена к стороне, равной 14. На равные отрезки она делит эту сторону — чему равен каждый?",
      answerType: "NUMBER",
      correctAnswer: "7",
      diagram: { kind: "triangleCevian", base: "14", variant: "median" },
      keyFormula: "медиана делит сторону пополам",
      hints: [
        "Медиана треугольника соединяет вершину с серединой противоположной стороны.",
        "Раз это середина стороны, оба отрезка равны между собой и в сумме дают всю сторону.",
      ],
      explanation: "Медиана делит сторону пополам: 14/2 = 7.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skCevians,
      text: "В треугольнике ABC медиана AM проведена к стороне BC=18. Найдите длину отрезка BM.",
      diagram: { kind: "triangleCevian", base: "18", variant: "median" },
      answerType: "NUMBER",
      correctAnswer: "9",
      tier: "bank",
      keyFormula: "медиана делит сторону пополам",
      hints: ["Медиана делит сторону, к которой проведена, на два равных отрезка.", "Разделите BC пополам."],
      explanation: "BM = BC/2 = 18/2 = 9.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skCevians,
      text: "В треугольнике стороны b=13, c=13, a=10. Найдите медиану, проведённую к стороне a.",
      diagram: { kind: "triangleCevian", base: "10", variant: "median" },
      answerType: "NUMBER",
      correctAnswer: "12",
      tier: "bank",
      keyFormula: "m_a=½√(2b²+2c²−a²)",
      hints: [
        "Есть формула, выражающая длину медианы через все три стороны треугольника.",
        "m_a = ½√(2b²+2c²−a²). Подставьте известные стороны и вычислите.",
      ],
      explanation: "m_a = ½√(2·13²+2·13²−10²) = ½√(338+338−100) = ½√576 = ½·24 = 12.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skCevians,
      text: "Биссектриса угла B треугольника ABC делит сторону AC на отрезки AD=6 и DC=9. Сторона AB=8. Найдите сторону BC.",
      answerType: "NUMBER",
      correctAnswer: "12",
      diagram: { kind: "triangleCevian", base: "a", variant: "bisector" },
      keyFormula: "AD/DC=AB/BC",
      hints: [
        "Биссектриса угла треугольника делит противоположную сторону на отрезки, пропорциональные прилежащим сторонам.",
        "AD/DC = AB/BC. Подставьте известные значения и найдите BC.",
      ],
      explanation: "AD/DC=AB/BC → 6/9=8/BC → BC=8·9/6=12.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skCevians,
      text: "В треугольнике биссектриса угла при вершине A делит противоположную сторону BC в отношении 3:5, считая от вершины B. Сторона AB=9. Найдите сторону AC.",
      diagram: { kind: "triangleCevian", base: "a", variant: "bisector" },
      answerType: "NUMBER",
      correctAnswer: "15",
      tier: "bank",
      keyFormula: "BD/DC=AB/AC",
      hints: [
        "Свойство биссектрисы: отношение отрезков, на которые она делит противоположную сторону, равно отношению прилежащих сторон.",
        "BD/DC=AB/AC → 3/5=9/AC. Найдите AC.",
      ],
      explanation: "3/5=9/AC → AC=9·5/3=15.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skCevians,
      text: "Биссектриса угла при вершине треугольника делит его на два угла, один из которых равен 35°. Чему равен исходный угол треугольника?",
      diagram: { kind: "triangleCevian", base: "a", variant: "bisector" },
      answerType: "NUMBER",
      correctAnswer: "70",
      tier: "bank",
      keyFormula: "биссектриса делит угол пополам",
      hints: ["Биссектриса делит угол пополам — то есть на два РАВНЫХ угла.", "Умножьте один из полученных углов на два."],
      explanation: "Биссектриса делит угол на два равных: исходный угол = 2×35=70.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skCevians,
      text: "В остроугольном треугольнике ABC высота BH делит угол B на два угла: 35° и 40°. Найдите угол B треугольника.",
      answerType: "NUMBER",
      correctAnswer: "75",
      diagram: { kind: "triangleCevian", base: "a", height: "h", variant: "height" },
      keyFormula: "высота делит угол на два",
      hints: [
        "Высота из вершины B делит угол B на два меньших угла.",
        "Сложите два данных угла, чтобы получить исходный угол B.",
      ],
      explanation: "∠B = 35+40 = 75.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skCevians,
      text: "В прямоугольном треугольнике катеты равны 15 и 20. Найдите высоту, проведённую к гипотенузе.",
      answerType: "NUMBER",
      correctAnswer: "12",
      tier: "bank",
      diagram: { kind: "triangleRight", a: "15", b: "20", c: "?" },
      keyFormula: "h=(катет₁·катет₂)/гипотенуза",
      hints: [
        "Площадь прямоугольного треугольника можно посчитать двумя способами: через катеты и через гипотенузу с высотой к ней.",
        "Найдите площадь через катеты, гипотенузу — по теореме Пифагора, а высоту — приравняв две формулы площади: h=(катет₁·катет₂)/гипотенуза.",
      ],
      explanation: "Гипотенуза=√(15²+20²)=√625=25. Площадь=(1/2)·15·20=150. Также Площадь=(1/2)·25·h → h=2·150/25=12.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skCevians,
      text: "В прямоугольном треугольнике высота, проведённая к гипотенузе, делит её на отрезки 4 и 9. Найдите эту высоту.",
      answerType: "NUMBER",
      correctAnswer: "6",
      tier: "bank",
      keyFormula: "h=√(p·q)",
      hints: [
        "Высота, проведённая к гипотенузе прямоугольного треугольника, является средним геометрическим отрезков, на которые она делит гипотенузу.",
        "h = √(p·q), где p и q — отрезки гипотенузы. Подставьте данные отрезки.",
      ],
      explanation: "h=√(4·9)=√36=6.",
      difficulty: 2,
      egeTaskNumber: 6,
    }
  );

  // Площадь треугольника
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skArea,
      text: "Сторона треугольника равна 12, а высота, проведённая к ней, равна 5. Найдите площадь треугольника.",
      answerType: "NUMBER",
      correctAnswer: "30",
      diagram: { kind: "triangleCevian", base: "12", height: "5", variant: "height" },
      keyFormula: "S=½·a·h",
      hints: [
        "Площадь треугольника можно найти через одну сторону и высоту, проведённую именно к ней.",
        "Формула: S = (1/2)·a·h. Подставьте данные сторону и высоту.",
      ],
      explanation: "S = (1/2)·a·h = (1/2)·12·5 = 30.",
      difficulty: 1,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skArea,
      text: "Две стороны треугольника равны 8 и 10, угол между ними равен 30°. Найдите площадь треугольника.",
      answerType: "NUMBER",
      correctAnswer: "20",
      keyFormula: "S=½·a·b·sinC",
      hints: [
        "Площадь треугольника можно найти через две стороны и синус угла между ними.",
        "S = ½·a·b·sin(C). Подставьте стороны и синус угла 30° (он равен 0,5).",
      ],
      explanation: "S = ½·8·10·sin30° = ½·8·10·0,5 = 20.",
      difficulty: 2,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skArea,
      text: "Две стороны треугольника равны 6 и 14, угол между ними равен 150°. Найдите площадь треугольника.",
      answerType: "NUMBER",
      correctAnswer: "21",
      tier: "bank",
      keyFormula: "S=½·a·b·sinC",
      hints: [
        "Формула та же, что и для острого угла: S = ½·a·b·sin(C).",
        "sin150° тоже равен 0,5 (как и sin30°). Подставьте и вычислите.",
      ],
      explanation: "S = ½·6·14·sin150° = ½·6·14·0,5 = 21.",
      difficulty: 2,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skArea,
      text: "Стороны треугольника равны 13, 14 и 15. Найдите площадь треугольника (используйте формулу Герона).",
      diagram: { kind: "triangleSides", a: "13", b: "15", c: "14" },
      answerType: "NUMBER",
      correctAnswer: "84",
      keyFormula: "S=√(p(p−a)(p−b)(p−c))",
      hints: [
        "Раз известны все три стороны, площадь можно найти по формуле Герона через полупериметр.",
        "Сначала найдите полупериметр p=(a+b+c)/2, затем подставьте в формулу Герона и вычислите.",
      ],
      explanation: "p=(13+14+15)/2=21. S=√(21·8·7·6)=√7056=84.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skArea,
      text: "Стороны треугольника равны 9, 10 и 17. Найдите площадь по формуле Герона.",
      diagram: { kind: "triangleSides", a: "9", b: "17", c: "10" },
      answerType: "NUMBER",
      correctAnswer: "36",
      tier: "bank",
      keyFormula: "S=√(p(p−a)(p−b)(p−c))",
      hints: [
        "Формула Герона: S=√(p(p−a)(p−b)(p−c)), где p — полупериметр.",
        "Найдите p=(9+10+17)/2, затем подставьте все значения в формулу.",
      ],
      explanation: "p=(9+10+17)/2=18. S=√(18·9·8·1)=√1296=36.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skArea,
      text: "Радиус окружности, вписанной в треугольник, равен 4, а периметр треугольника равен 30. Найдите площадь треугольника.",
      answerType: "NUMBER",
      correctAnswer: "60",
      tier: "bank",
      keyFormula: "S=r·p",
      hints: [
        "Площадь треугольника можно выразить через радиус вписанной окружности и полупериметр.",
        "S=r·p, где p=(периметр)/2. Подставьте радиус и полупериметр.",
      ],
      explanation: "p=30/2=15. S=r·p=4·15=60.",
      difficulty: 2,
      egeTaskNumber: 6,
    }
  );

  // Равенство и подобие треугольников
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skCongruentSimilar,
      text: "Треугольники ABC и A′B′C′ равны. В треугольнике ABC угол A=50°, угол B=60°. Чему равен угол C′ треугольника A′B′C′?",
      answerType: "NUMBER",
      correctAnswer: "70",
      keyFormula: "в равных треугольниках соответственные углы равны",
      hints: [
        "Равные треугольники имеют равные соответственные углы.",
        "Сначала найдите угол C в первом треугольнике через сумму углов — он равен углу C′ во втором.",
      ],
      explanation: "∠C=180−50−60=70. В равных треугольниках соответственные углы равны, значит ∠C′=70.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skCongruentSimilar,
      text: "Треугольники ABC и DEF равны, причём AB=DE, BC=EF, AC=DF. Периметр треугольника ABC равен 24, AB=7, BC=9. Найдите сторону DF.",
      answerType: "NUMBER",
      correctAnswer: "8",
      tier: "bank",
      keyFormula: "в равных треугольниках соответственные стороны равны",
      hints: [
        "В равных треугольниках соответственные стороны равны.",
        "Сначала найдите сторону AC через периметр треугольника ABC, затем используйте равенство AC=DF.",
      ],
      explanation: "AC=24−7−9=8. Так как AC=DF (равные треугольники), DF=8.",
      difficulty: 2,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skCongruentSimilar,
      text: "Средняя линия треугольника, параллельная стороне BC, равна 8. Найдите сторону BC.",
      diagram: { kind: "triangleCevian", base: "16", variant: "median" },
      answerType: "NUMBER",
      correctAnswer: "16",
      keyFormula: "MN=½·BC",
      hints: [
        "Средняя линия треугольника равна половине той стороны, которой она параллельна.",
        "Умножьте среднюю линию на 2.",
      ],
      explanation: "BC = 2×8 = 16.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skCongruentSimilar,
      text: "Периметр треугольника, образованного тремя средними линиями исходного треугольника, равен 15. Найдите периметр исходного треугольника.",
      answerType: "NUMBER",
      correctAnswer: "30",
      tier: "bank",
      keyFormula: "средние линии образуют подобный треугольник с k=½",
      hints: [
        "Треугольник, образованный тремя средними линиями, подобен исходному с коэффициентом ½.",
        "Периметры подобных фигур относятся как коэффициент подобия — исходный периметр вдвое больше.",
      ],
      explanation: "Периметр из средних линий вдвое меньше исходного: исходный = 15×2=30.",
      difficulty: 2,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skCongruentSimilar,
      text: "Два треугольника подобны с коэффициентом подобия 3. Периметр меньшего треугольника равен 15. Найдите периметр большего.",
      answerType: "NUMBER",
      correctAnswer: "45",
      diagram: { kind: "triangleSimilarPair", small: "P=15", large: "?", factor: "×3" },
      keyFormula: "P₂=P₁·k",
      hints: [
        "При подобии фигур все линейные размеры — стороны, периметр, высоты — умножаются на один и тот же коэффициент.",
        "Умножьте периметр меньшего треугольника на коэффициент подобия.",
      ],
      explanation: "Периметры подобных треугольников относятся как коэффициент подобия: 15×3=45.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skCongruentSimilar,
      text: "Стороны треугольника равны 5 и 12, а сходственные стороны подобного треугольника равны 15 и 36. Периметр первого треугольника равен 24. Найдите периметр второго.",
      answerType: "NUMBER",
      correctAnswer: "72",
      tier: "bank",
      keyFormula: "P₂=P₁·k",
      hints: [
        "Найдите коэффициент подобия через пару сходственных сторон.",
        "Умножьте периметр первого треугольника на этот коэффициент.",
      ],
      explanation: "k=15/5=3 (проверка: 36/12=3 совпадает). Периметр второго=24×3=72.",
      difficulty: 2,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skCongruentSimilar,
      text: "Прямая, параллельная стороне BC треугольника ABC, пересекает стороны AB и AC в точках M и N. AM=4, MB=6, NC=9. Найдите AN.",
      answerType: "NUMBER",
      correctAnswer: "6",
      keyFormula: "AM/MB=AN/NC",
      hints: [
        "Прямая, параллельная стороне треугольника, отсекает на двух других сторонах пропорциональные отрезки.",
        "AM/MB = AN/NC. Подставьте известные отрезки и найдите AN.",
      ],
      explanation: "AM/MB=AN/NC → 4/6=AN/9 → AN=4·9/6=6.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skCongruentSimilar,
      text: "На стороне AB треугольника отмечена точка M так, что AM:MB=1:2. Через M проведена прямая, параллельная BC, пересекающая AC в точке N, причём AN=5. Найдите AC.",
      answerType: "NUMBER",
      correctAnswer: "15",
      tier: "bank",
      keyFormula: "AN/AC=AM/AB",
      hints: [
        "Прямая MN, параллельная BC, отсекает треугольник AMN, подобный треугольнику ABC.",
        "AN:AC = AM:AB. Найдите отношение AM:AB из данного AM:MB, затем найдите AC.",
      ],
      explanation: "AM:MB=1:2 → AM:AB=1:3. Треугольники AMN и ABC подобны, значит AN:AC=AM:AB=1:3. AC=5×3=15.",
      difficulty: 3,
      egeTaskNumber: 16,
    }
  );

  // Теорема Пифагора
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skPythagoras,
      text: "Катеты прямоугольного треугольника равны 6 и 8. Найдите гипотенузу.",
      answerType: "NUMBER",
      correctAnswer: "10",
      diagram: { kind: "triangleRight", a: "6", b: "8", c: "?" },
      keyFormula: "a²+b²=c²",
      hints: [
        "В прямоугольном треугольнике катеты и гипотенуза связаны теоремой Пифагора. Как она записывается?",
        "Формула: c = √(a² + b²). Подставьте вместо a и b данные катеты и вычислите.",
      ],
      explanation: "По теореме Пифагора: c = √(6² + 8²) = √(36+64) = √100 = 10.",
      difficulty: 1,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skPythagoras,
      text: "Стороны треугольника равны 5, 12 и 13. Чему равна площадь треугольника?",
      answerType: "NUMBER",
      correctAnswer: "30",
      diagram: { kind: "triangleRight", a: "5", b: "12", c: "13" },
      keyFormula: "a²+b²=c² → S=½·a·b",
      hints: [
        "Проверьте, не выполняется ли для этих трёх сторон теорема Пифагора — это подскажет тип треугольника.",
        "5² + 12² = 13², значит треугольник прямоугольный с катетами 5 и 12. Площадь ищется как для прямоугольного треугольника.",
      ],
      explanation: "5²+12²=13² — треугольник прямоугольный, катеты 5 и 12. S=(1/2)·5·12=30.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skPythagoras,
      text: "Докажите: в прямоугольном треугольнике с катетами 9 и 12 медиана, проведённая к гипотенузе, равна половине гипотенузы. Опишите полное решение с обоснованием.",
      answerType: "DETAILED",
      correctAnswer:
        "c=√(9²+12²)=√225=15. Медиана к гипотенузе прямоугольного треугольника равна её половине (это радиус описанной окружности, гипотенуза — диаметр). Медиана = 15/2 = 7.5.",
      diagram: { kind: "triangleRight", a: "9", b: "12", c: "?" },
      keyFormula: "медиана к гипотенузе = c/2",
      hints: [
        "Распишите решение по шагам: сначала найдите гипотенузу по теореме Пифагора, затем примените свойство медианы к гипотенузе в прямоугольном треугольнике.",
      ],
      explanation:
        "c=√(9²+12²)=√(81+144)=√225=15. Медиана, проведённая к гипотенузе прямоугольного треугольника, равна половине гипотенузы: 15/2=7.5.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skPythagoras,
      text: "Катет прямоугольного треугольника равен 9, а гипотенуза равна 15. Найдите второй катет.",
      diagram: { kind: "triangleRight", a: "9", b: "?", c: "15" },
      answerType: "NUMBER",
      correctAnswer: "12",
      tier: "bank",
      keyFormula: "a²+b²=c²",
      hints: [
        "Из теоремы Пифагора можно выразить катет, если известны гипотенуза и второй катет.",
        "b=√(c²−a²). Подставьте гипотенузу и известный катет.",
      ],
      explanation: "b=√(15²−9²)=√(225−81)=√144=12.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skPythagoras,
      text: "Катеты прямоугольного треугольника равны 7 и 24. Найдите гипотенузу.",
      diagram: { kind: "triangleRight", a: "7", b: "24", c: "?" },
      answerType: "NUMBER",
      correctAnswer: "25",
      tier: "bank",
      keyFormula: "a²+b²=c²",
      hints: ["Теорема Пифагора: c=√(a²+b²).", "Подставьте катеты 7 и 24 и вычислите."],
      explanation: "c=√(7²+24²)=√(49+576)=√625=25.",
      difficulty: 1,
      egeTaskNumber: 16,
    }
  );

  // Теоремы Фалеса, синусов и косинусов
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skTrigTheorems,
      text: "На стороне угла отмечены точки A, B, C так, что AB=3, BC=5. Через них проведены параллельные прямые, пересекающие вторую сторону угла в точках A₁, B₁, C₁. A₁B₁=6. Найдите B₁C₁.",
      answerType: "NUMBER",
      correctAnswer: "10",
      keyFormula: "AB/BC=A₁B₁/B₁C₁",
      hints: [
        "Теорема Фалеса: параллельные прямые, пересекающие стороны угла, отсекают на них пропорциональные отрезки.",
        "AB/BC=A₁B₁/B₁C₁. Подставьте известное и найдите B₁C₁.",
      ],
      explanation: "AB/BC=A₁B₁/B₁C₁ → 3/5=6/B₁C₁ → B₁C₁=6·5/3=10.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skTrigTheorems,
      text: "Параллельные прямые пересекают две прямые, образуя на первой отрезки 4 и 6, а на второй — отрезки x и 15 (в том же порядке). Найдите x.",
      answerType: "NUMBER",
      correctAnswer: "10",
      tier: "bank",
      keyFormula: "теорема Фалеса",
      hints: [
        "Отрезки на одной прямой относятся так же, как соответствующие отрезки на другой.",
        "4/6=x/15. Найдите x.",
      ],
      explanation: "4/6=x/15 → x=4·15/6=10.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skTrigTheorems,
      text: "Отрезок AB разделён параллельными прямыми на 3 равные части. Через точки деления проведена ещё одна прямая, разделившая параллельный отрезок CD теми же прямыми — тоже на 3 равные части. Первая часть CD равна 5. Найдите весь отрезок CD.",
      answerType: "NUMBER",
      correctAnswer: "15",
      tier: "bank",
      keyFormula: "следствие теоремы Фалеса",
      hints: [
        "Если параллельные прямые делят один отрезок на равные части, они создают равные части и на любом другом отрезке между теми же прямыми.",
        "Раз все три части CD равны первой (5), сложите их.",
      ],
      explanation: "Все три части CD равны 5: CD=5×3=15.",
      difficulty: 1,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skTrigTheorems,
      text: "В треугольнике сторона a=10, угол напротив неё A=30°. Найдите радиус описанной окружности.",
      answerType: "NUMBER",
      correctAnswer: "10",
      keyFormula: "a/sinA=2R",
      hints: [
        "Теорема синусов связывает сторону, синус противолежащего угла и радиус описанной окружности.",
        "2R=a/sinA. Подставьте сторону и синус угла 30° (=0,5), затем найдите R (не 2R!).",
      ],
      explanation: "2R=10/sin30°=10/0,5=20. R=10.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skTrigTheorems,
      text: "В треугольнике угол A=30°, угол B=90°, сторона a (напротив угла A) равна 6. Найдите сторону b (напротив угла B).",
      answerType: "NUMBER",
      correctAnswer: "12",
      tier: "bank",
      keyFormula: "a/sinA=b/sinB",
      hints: [
        "По теореме синусов отношение стороны к синусу противолежащего угла одинаково для всех сторон треугольника.",
        "a/sinA=b/sinB. Подставьте известные значения (sin30°=0,5, sin90°=1).",
      ],
      explanation: "6/sin30°=b/sin90° → 6/0,5=b/1 → b=12.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skTrigTheorems,
      text: "Угол A треугольника равен 45°, сторона a=8√2. Найдите диаметр описанной окружности.",
      answerType: "NUMBER",
      correctAnswer: "16",
      tier: "bank",
      keyFormula: "2R=a/sinA",
      hints: ["2R=a/sinA — это и есть диаметр описанной окружности.", "sin45°=√2/2. Подставьте и упростите."],
      explanation: "2R=a/sinA=8√2/(√2/2)=8√2·2/√2=16.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skTrigTheorems,
      text: "Стороны треугольника a=5, b=8, угол между ними C=60°. Найдите сторону c.",
      answerType: "NUMBER",
      correctAnswer: "7",
      keyFormula: "c²=a²+b²−2ab·cosC",
      hints: [
        "Теорема косинусов обобщает теорему Пифагора на любой угол между сторонами.",
        "c²=a²+b²−2ab·cosC. Подставьте стороны и cos60°=0,5, затем извлеките корень.",
      ],
      explanation: "c²=5²+8²−2·5·8·0,5=25+64−40=49. c=7.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skTrigTheorems,
      text: "Стороны треугольника a=7, b=8, угол между ними C=120°. Найдите сторону c.",
      answerType: "NUMBER",
      correctAnswer: "13",
      tier: "bank",
      keyFormula: "c²=a²+b²−2ab·cosC",
      hints: ["Та же формула, но cos120°=−0,5 (отрицательный, так как угол тупой).", "Подставьте значения в c²=a²+b²−2ab·cosC."],
      explanation: "c²=7²+8²−2·7·8·(−0,5)=49+64+56=169. c=13.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skTrigTheorems,
      text: "Стороны треугольника равны 3, 5 и 7. Найдите 10·cos C, где C — угол, противолежащий стороне 7.",
      answerType: "NUMBER",
      correctAnswer: "-5",
      tier: "bank",
      keyFormula: "cosC=(a²+b²−c²)/(2ab)",
      hints: [
        "Теорему косинусов можно переписать, чтобы находить косинус угла по трём известным сторонам.",
        "cosC=(a²+b²−c²)/(2ab). Подставьте стороны, вычислите cosC и умножьте на 10.",
      ],
      explanation: "cosC=(3²+5²−7²)/(2·3·5)=(9+25−49)/30=−15/30=−0,5. 10·cosC=−5.",
      difficulty: 3,
      egeTaskNumber: 16,
    }
  );

  // Продвинутые теоремы: Чева, Менелай, Стюарт
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skAdvanced,
      text: "В треугольнике ABC чевианы AD, BE, CF пересекаются в одной точке (точки D, E, F лежат на сторонах BC, CA, AB соответственно). Известно, что BD:DC=1:3 и CE:EA=1:2. Найдите отношение AF:FB.",
      answerType: "NUMBER",
      correctAnswer: "6",
      keyFormula: "(BD/DC)·(CE/EA)·(AF/FB)=1",
      hints: [
        "Теорема Чевы: для чевиан, пересекающихся в одной точке, произведение трёх отношений равно 1.",
        "Подставьте BD/DC=1/3 и CE/EA=1/2 в (BD/DC)(CE/EA)(AF/FB)=1 и найдите AF/FB.",
      ],
      explanation: "(1/3)·(1/2)·(AF/FB)=1 → (1/6)(AF/FB)=1 → AF/FB=6.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skAdvanced,
      text: "Прямая пересекает сторону AB треугольника ABC в точке F, сторону BC — в точке D, и продолжение стороны CA за точку A — в точке E. Известно, что AF:FB=1:4, BD:DC=1:2. Найдите отношение CE:EA.",
      answerType: "NUMBER",
      correctAnswer: "8",
      keyFormula: "(AF/FB)·(BD/DC)·(CE/EA)=1",
      hints: [
        "Теорема Менелая для прямой, пересекающей стороны треугольника (и одно продолжение), даёт произведение трёх отношений, равное 1.",
        "Подставьте известные отношения в (AF/FB)(BD/DC)(CE/EA)=1 и найдите CE/EA.",
      ],
      explanation: "(1/4)·(1/2)·(CE/EA)=1 → (1/8)(CE/EA)=1 → CE/EA=8.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skAdvanced,
      text: "В треугольнике ABC сторона BC=6 разделена точкой D на отрезки BD=2 и DC=4. Известно, что AB=7, AC=5. Найдите AD² (квадрат длины чевианы AD) по теореме Стюарта.",
      answerType: "NUMBER",
      correctAnswer: "33",
      keyFormula: "b²m+c²n=a(d²+mn)",
      hints: [
        "Теорема Стюарта связывает длину чевианы с длинами сторон треугольника и отрезков, на которые чевиана делит противоположную сторону.",
        "Обозначьте m=BD=2, n=DC=4, a=BC=6, b=AC=5, c=AB=7. Подставьте в b²m+c²n=a(d²+mn) и найдите d².",
      ],
      explanation: "b²m+c²n=a(d²+mn) → 5²·2+7²·4=6(d²+2·4) → 50+196=6d²+48 → 246−48=6d² → d²=33.",
      difficulty: 3,
      egeTaskNumber: 16,
    }
  );

  // Прямоугольник: площадь и периметр
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skRectangleAreaPerimeter,
      text: "Стороны прямоугольника равны 6 и 8. Найдите его площадь.",
      answerType: "NUMBER",
      correctAnswer: "48",
      diagram: { kind: "rectangle", a: "6", b: "8" },
      keyFormula: "S=a·b",
      hints: [
        "Площадь прямоугольника — это произведение двух его смежных сторон.",
        "Перемножьте данные стороны прямоугольника.",
      ],
      explanation: "S = a·b = 6·8 = 48.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRectangleAreaPerimeter,
      text: "Периметр прямоугольника равен 28, одна сторона равна 6. Найдите другую сторону.",
      answerType: "NUMBER",
      correctAnswer: "8",
      diagram: { kind: "rectangle", a: "6", b: "?" },
      keyFormula: "P=2(a+b)",
      hints: [
        "Периметр прямоугольника — это сумма всех его сторон, то есть удвоенная сумма двух смежных сторон.",
        "P=2(a+b). Подставьте известный периметр и сторону, найдите вторую сторону.",
      ],
      explanation: "P = 2(a+b) → 28 = 2(6+b) → 14 = 6+b → b = 8.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRectangleAreaPerimeter,
      text: "Площадь прямоугольника равна 45, одна из сторон равна 5. Найдите периметр прямоугольника.",
      diagram: { kind: "rectangle", a: "5", b: "?" },
      answerType: "NUMBER",
      correctAnswer: "28",
      tier: "bank",
      keyFormula: "S=a·b → P=2(a+b)",
      hints: [
        "Сначала найдите вторую сторону через площадь и известную сторону.",
        "b=S/a=45/5. Затем посчитайте периметр P=2(a+b).",
      ],
      explanation: "b=45/5=9. P=2(5+9)=28.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRectangleAreaPerimeter,
      text: "Периметр прямоугольника равен 34, а одна сторона больше другой на 5. Найдите большую сторону.",
      diagram: { kind: "rectangle", a: "x", b: "x+5" },
      answerType: "NUMBER",
      correctAnswer: "11",
      tier: "bank",
      keyFormula: "P=2(a+b)",
      hints: [
        "Обозначьте меньшую сторону x, большую x+5. Полупериметр равен половине от 34.",
        "x+(x+5)=17. Решите уравнение и найдите большую сторону.",
      ],
      explanation: "x+x+5=17 → 2x=12 → x=6. Большая сторона: 6+5=11.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRectangleAreaPerimeter,
      text: "Периметр прямоугольника равен 26, а площадь равна 40. Найдите обе стороны прямоугольника. Опишите полное решение (составьте и решите систему уравнений).",
      diagram: { kind: "rectangle", a: "?", b: "?" },
      answerType: "DETAILED",
      correctAnswer: "Стороны равны 5 и 8.",
      keyFormula: "a+b=P/2, a·b=S",
      hints: [
        "Составьте систему: сумма сторон известна из периметра, произведение — из площади. Сведите к квадратному уравнению.",
      ],
      explanation:
        "a+b=13, ab=40. Стороны — корни уравнения x²−13x+40=0. Дискриминант=169−160=9, x=(13±3)/2 → x=8 или x=5. Стороны: 5 и 8.",
      difficulty: 3,
      egeTaskNumber: 1,
    }
  );

  // Прямоугольник: диагональ
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skRectangleDiagonal,
      text: "Стороны прямоугольника равны 9 и 12. Найдите диагональ.",
      answerType: "NUMBER",
      correctAnswer: "15",
      diagram: { kind: "rectangle", a: "9", b: "12", diagonal: "?" },
      keyFormula: "d=√(a²+b²)",
      hints: ["Диагональ прямоугольника находится по теореме Пифагора через две стороны.", "d=√(a²+b²). Подставьте стороны."],
      explanation: "d=√(9²+12²)=√(81+144)=√225=15.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRectangleDiagonal,
      text: "Диагональ прямоугольника равна 13, одна сторона равна 5. Найдите другую сторону.",
      diagram: { kind: "rectangle", a: "5", b: "?", diagonal: "13" },
      answerType: "NUMBER",
      correctAnswer: "12",
      tier: "bank",
      keyFormula: "b=√(d²−a²)",
      hints: ["Выразите вторую сторону из теоремы Пифагора для диагонали.", "b=√(d²−a²). Подставьте диагональ и известную сторону."],
      explanation: "b=√(13²−5²)=√(169−25)=√144=12.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRectangleDiagonal,
      text: "Прямоугольник вписан в окружность радиусом 5. Одна из сторон прямоугольника равна 6. Найдите другую сторону.",
      answerType: "NUMBER",
      correctAnswer: "8",
      diagram: { kind: "rectangle", a: "6", b: "?", circumscribed: true, radius: "r=5" },
      keyFormula: "d=2r, a²+b²=d²",
      hints: [
        "Если прямоугольник вписан в окружность, его диагональ — это диаметр этой окружности.",
        "Найдите диагональ как 2r, затем примените теорему Пифагора к сторонам прямоугольника.",
      ],
      explanation:
        "Диагональ прямоугольника равна диаметру описанной окружности: d = 2r = 10. По теореме Пифагора: 6² + b² = 10² → b² = 64 → b = 8.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRectangleDiagonal,
      text: "Диагонали прямоугольника пересекаются в точке O. Отрезок от вершины до точки O равен 7. Найдите всю диагональ.",
      diagram: { kind: "rectangle", a: "?", b: "?", diagonal: "?" },
      answerType: "NUMBER",
      correctAnswer: "14",
      tier: "bank",
      keyFormula: "диагонали делятся пополам",
      hints: ["Диагонали прямоугольника точкой пересечения делятся пополам.", "Значит вся диагональ вдвое больше данного отрезка."],
      explanation: "Диагональ = 2×7 = 14.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRectangleDiagonal,
      text: "Периметр прямоугольника равен 28, а диагональ равна 10. Найдите площадь прямоугольника. Опишите полное решение.",
      diagram: { kind: "rectangle", a: "?", b: "?", diagonal: "10" },
      answerType: "DETAILED",
      correctAnswer: "Площадь равна 48.",
      keyFormula: "(a+b)²=a²+2ab+b²",
      hints: [
        "Не ищите стороны по отдельности — воспользуйтесь тождеством (a+b)²=a²+b²+2ab, где a²+b²=d², а a+b известно из периметра.",
      ],
      explanation:
        "a+b=14 (полупериметр), a²+b²=d²=100. (a+b)²=a²+2ab+b² → 196=100+2ab → 2ab=96 → ab=48. Площадь=48.",
      difficulty: 3,
      egeTaskNumber: 1,
    }
  );

  // Квадрат
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skSquare,
      text: "Сторона квадрата равна 5. Найдите его площадь.",
      answerType: "NUMBER",
      correctAnswer: "25",
      diagram: { kind: "rectangle", a: "5", b: "5", isSquare: true },
      keyFormula: "S=a²",
      hints: ["Площадь квадрата — это его сторона, умноженная сама на себя.", "S=a². Подставьте сторону квадрата."],
      explanation: "S = a² = 5² = 25.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skSquare,
      text: "Диагональ квадрата равна 8√2. Найдите сторону квадрата.",
      answerType: "NUMBER",
      correctAnswer: "8",
      diagram: { kind: "rectangle", a: "?", b: "?", isSquare: true, diagonal: "8√2" },
      keyFormula: "d=a√2",
      hints: ["Диагональ квадрата связана со стороной через корень из двух.", "d=a√2, значит a=d/√2. Подставьте диагональ и упростите."],
      explanation: "d = a√2 → a = d/√2 = 8√2/√2 = 8.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skSquare,
      text: "Периметр квадрата равен 24. Найдите его площадь.",
      answerType: "NUMBER",
      correctAnswer: "36",
      diagram: { kind: "rectangle", a: "?", b: "?", isSquare: true },
      keyFormula: "P=4a → S=a²",
      hints: ["Сначала найдите сторону квадрата через периметр, потом — площадь через сторону.", "P=4a → a=P/4. Затем S=a²."],
      explanation: "P = 4a → a = 24/4 = 6. S = a² = 36.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skSquare,
      text: "Площадь квадрата равна 64. Найдите его периметр.",
      diagram: { kind: "rectangle", a: "?", b: "?", isSquare: true },
      answerType: "NUMBER",
      correctAnswer: "32",
      tier: "bank",
      keyFormula: "S=a² → P=4a",
      hints: ["Сначала найдите сторону квадрата как корень из площади.", "a=√S, затем P=4a."],
      explanation: "a=√64=8. P=4·8=32.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skSquare,
      text: "Диагональ квадрата равна 10√2. Найдите площадь квадрата.",
      diagram: { kind: "rectangle", a: "?", b: "?", isSquare: true, diagonal: "10√2" },
      answerType: "NUMBER",
      correctAnswer: "100",
      tier: "bank",
      keyFormula: "d=a√2 → S=a²",
      hints: ["Найдите сторону из диагонали: a=d/√2.", "Затем возведите сторону в квадрат."],
      explanation: "a=10√2/√2=10. S=10²=100.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skSquare,
      text: "Периметр квадрата равен 20 см. Найдите точное значение диагонали квадрата (с корнем) и опишите ход решения.",
      diagram: { kind: "rectangle", a: "?", b: "?", isSquare: true },
      answerType: "DETAILED",
      correctAnswer: "5√2 см (≈7,07 см).",
      keyFormula: "d=a√2",
      hints: ["Сначала найдите сторону квадрата через периметр, затем примените формулу диагонали."],
      explanation: "Сторона: a=20/4=5. Диагональ: d=a√2=5√2 см ≈ 7,07 см.",
      difficulty: 2,
      egeTaskNumber: 1,
    }
  );

  // Параллелограмм: стороны и площадь
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skParallelogramArea,
      text: "Сторона параллелограмма равна 9, высота, проведённая к ней, равна 4. Найдите площадь.",
      answerType: "NUMBER",
      correctAnswer: "36",
      diagram: { kind: "parallelogram", a: "9", h: "4" },
      keyFormula: "S=a·h",
      hints: [
        "Площадь параллелограмма — это произведение стороны и высоты, проведённой именно к ней.",
        "S=a·h. Подставьте данные сторону и высоту.",
      ],
      explanation: "S = a·h = 9·4 = 36.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skParallelogramArea,
      text: "Площадь параллелограмма равна 48, а его высота равна 6. Найдите сторону, к которой проведена эта высота.",
      answerType: "NUMBER",
      correctAnswer: "8",
      diagram: { kind: "parallelogram", a: "?", h: "6" },
      keyFormula: "a=S/h",
      hints: [
        "Площадь параллелограмма и высота связаны той же формулой, что и в задаче про площадь — только теперь неизвестна сторона.",
        "Из S=a·h выразите сторону: a=S/h.",
      ],
      explanation: "a = S/h = 48/6 = 8.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skParallelogramArea,
      text: "Стороны параллелограмма равны 6 и 10, угол между ними равен 30°. Найдите площадь.",
      diagram: { kind: "parallelogram", angleLabel: "30°" },
      answerType: "NUMBER",
      correctAnswer: "30",
      tier: "bank",
      keyFormula: "S=a·b·sinC",
      hints: [
        "Площадь параллелограмма можно найти через две смежные стороны и синус угла между ними.",
        "S=a·b·sinC. sin30°=0,5. Подставьте и вычислите.",
      ],
      explanation: "S=6·10·sin30°=6·10·0,5=30.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skParallelogramArea,
      text: "Периметр параллелограмма равен 40, одна сторона на 4 больше другой. Найдите большую сторону.",
      answerType: "NUMBER",
      correctAnswer: "12",
      diagram: { kind: "parallelogram", a: "x+4" },
      keyFormula: "P=2(a+b)",
      hints: [
        "Периметр — это сумма всех сторон. У параллелограмма противоположные стороны равны, значит периметр выражается через сумму двух соседних сторон.",
        "Обозначьте меньшую сторону x, большую x+4. Составьте уравнение 2(x+(x+4))=40 и решите его.",
      ],
      explanation: "2(x+x+4)=40 → 4x+8=40 → x=8. Большая сторона: 8+4=12.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skParallelogramArea,
      text: "Стороны параллелограмма равны 8 и 15, а его площадь равна 60. Найдите синус угла между этими сторонами. Опишите решение.",
      diagram: { kind: "parallelogram", angleLabel: "?" },
      answerType: "DETAILED",
      correctAnswer: "sin C = 0,5.",
      keyFormula: "S=a·b·sinC",
      hints: ["Выразите синус угла из формулы площади через две стороны."],
      explanation: "S=ab·sinC → 60=8·15·sinC → sinC=60/120=0,5.",
      difficulty: 2,
      egeTaskNumber: 1,
    }
  );

  // Параллелограмм: углы и диагонали
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skParallelogramAnglesDiagonals,
      text: "Один из углов параллелограмма равен 70°. Найдите соседний угол.",
      answerType: "NUMBER",
      correctAnswer: "110",
      diagram: { kind: "parallelogram", angleLabel: "70°" },
      keyFormula: "∠1+∠2=180°",
      hints: [
        "Соседние углы параллелограмма (не противоположные) в сумме дают развёрнутый угол.",
        "Сумма соседних углов равна 180°. Вычтите известный угол из 180°.",
      ],
      explanation: "Сумма соседних углов параллелограмма равна 180°. 180 − 70 = 110.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skParallelogramAnglesDiagonals,
      text: "Один угол параллелограмма на 30° больше соседнего. Найдите меньший из этих двух углов.",
      diagram: { kind: "parallelogram", angleLabel: "x" },
      answerType: "NUMBER",
      correctAnswer: "75",
      tier: "bank",
      keyFormula: "∠1+∠2=180°",
      hints: ["Обозначьте меньший угол x, больший x+30. Соседние углы в сумме дают 180°.", "x+(x+30)=180. Решите уравнение."],
      explanation: "x+x+30=180 → 2x=150 → x=75.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skParallelogramAnglesDiagonals,
      text: "Диагонали параллелограмма точкой пересечения делятся пополам. Один из отрезков диагонали равен 9. Найдите всю эту диагональ.",
      diagram: { kind: "parallelogram", showDiagonals: true, d1: "?", d2: "?" },
      answerType: "NUMBER",
      correctAnswer: "18",
      tier: "bank",
      keyFormula: "диагонали делятся пополам",
      hints: ["Точка пересечения делит каждую диагональ на два равных отрезка.", "Умножьте данный отрезок на 2."],
      explanation: "Диагональ = 2×9 = 18.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skParallelogramAnglesDiagonals,
      text: "Стороны параллелограмма равны 5 и 7, одна из диагоналей равна 6. Найдите квадрат второй диагонали.",
      answerType: "NUMBER",
      correctAnswer: "112",
      tier: "bank",
      diagram: { kind: "parallelogram", showDiagonals: true, d1: "6", d2: "?" },
      keyFormula: "d₁²+d₂²=2(a²+b²)",
      hints: [
        "Сумма квадратов диагоналей параллелограмма равна удвоенной сумме квадратов сторон.",
        "d₁²+d₂²=2(a²+b²). Подставьте известную диагональ и стороны, найдите d₂².",
      ],
      explanation: "6²+d₂²=2(5²+7²) → 36+d₂²=2(74)=148 → d₂²=112.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skParallelogramAnglesDiagonals,
      text: "Диагонали параллелограмма равны 10 и 12, одна из сторон равна 7. Найдите квадрат второй стороны. Опишите решение.",
      diagram: { kind: "parallelogram", showDiagonals: true, d1: "10", d2: "12" },
      answerType: "DETAILED",
      correctAnswer: "b² = 73 (b ≈ 8,54).",
      keyFormula: "d₁²+d₂²=2(a²+b²)",
      hints: ["Подставьте известные диагонали и одну сторону в формулу суммы квадратов диагоналей, выразите вторую сторону."],
      explanation: "d₁²+d₂²=2(a²+b²) → 100+144=2(49+b²) → 244=98+2b² → 2b²=146 → b²=73.",
      difficulty: 3,
      egeTaskNumber: 1,
    }
  );

  // Ромб
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skRhombus,
      text: "Диагонали ромба равны 6 и 8. Найдите площадь ромба.",
      answerType: "NUMBER",
      correctAnswer: "24",
      diagram: { kind: "parallelogram", showDiagonals: true, d1: "6", d2: "8", equalSides: true },
      keyFormula: "S=(d₁·d₂)/2",
      hints: ["Площадь ромба можно найти через обе диагонали одной короткой формулой.", "S=(d₁·d₂)/2. Подставьте обе диагонали."],
      explanation: "S = (d₁·d₂)/2 = (6·8)/2 = 24.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRhombus,
      text: "Сторона ромба равна 13, одна из диагоналей равна 10. Найдите площадь ромба.",
      answerType: "NUMBER",
      correctAnswer: "120",
      diagram: { kind: "parallelogram", showDiagonals: true, d1: "10", d2: "?", equalSides: true },
      keyFormula: "теорема Пифагора → S=(d₁·d₂)/2",
      hints: [
        "Диагонали ромба точкой пересечения делятся пополам и пересекаются под прямым углом — это даёт прямоугольные треугольники со стороной ромба в роли гипотенузы.",
        "Половина известной диагонали и половина искомой — катеты прямоугольного треугольника с гипотенузой, равной стороне ромба. Используйте теорему Пифагора, затем найдите площадь через обе диагонали.",
      ],
      explanation:
        "Половина известной диагонали: 10/2=5. По теореме Пифагора половина второй диагонали: √(13²−5²)=√144=12, вторая диагональ=24. Площадь: S=(d₁·d₂)/2=(10·24)/2=120.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRhombus,
      text: "Сторона ромба равна 10, одна из диагоналей равна 12. Найдите площадь ромба.",
      diagram: { kind: "parallelogram", showDiagonals: true, d1: "12", d2: "?", equalSides: true },
      answerType: "NUMBER",
      correctAnswer: "96",
      tier: "bank",
      keyFormula: "теорема Пифагора → S=(d₁·d₂)/2",
      hints: ["Половина известной диагонали и половина искомой — катеты прямоугольного треугольника со стороной ромба в роли гипотенузы.", "Найдите вторую половину диагонали по теореме Пифагора, затем площадь."],
      explanation: "Половина диагонали 12/2=6. Вторая половина: √(10²−6²)=√64=8, вторая диагональ=16. S=(12·16)/2=96.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRhombus,
      text: "Диагонали ромба равны 16 и 30. Найдите сторону ромба.",
      diagram: { kind: "parallelogram", showDiagonals: true, d1: "16", d2: "30", equalSides: true },
      answerType: "NUMBER",
      correctAnswer: "17",
      tier: "bank",
      keyFormula: "сторона=√((d₁/2)²+(d₂/2)²)",
      hints: ["Половины диагоналей — катеты прямоугольного треугольника, сторона ромба — гипотенуза.", "Половины диагоналей: 8 и 15. Примените теорему Пифагора."],
      explanation: "Половины диагоналей: 8 и 15. Сторона=√(8²+15²)=√(64+225)=√289=17.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skRhombus,
      text: "Площадь ромба равна 48, одна из диагоналей равна 12. Найдите вторую диагональ и сторону ромба. Опишите решение.",
      diagram: { kind: "parallelogram", showDiagonals: true, d1: "12", d2: "?", equalSides: true },
      answerType: "DETAILED",
      correctAnswer: "Вторая диагональ равна 8, сторона равна 2√13 ≈ 7,2.",
      keyFormula: "S=(d₁·d₂)/2, теорема Пифагора",
      hints: ["Сначала найдите вторую диагональ из формулы площади, затем сторону — через половины обеих диагоналей по теореме Пифагора."],
      explanation:
        "48=(12·d₂)/2 → d₂=8. Половины диагоналей: 6 и 4. Сторона=√(6²+4²)=√(36+16)=√52=2√13≈7,2.",
      difficulty: 3,
      egeTaskNumber: 1,
    }
  );

  // Трапеция: средняя линия и площадь
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skTrapezoidMidlineArea,
      text: "Основания трапеции равны 8 и 14. Найдите среднюю линию.",
      answerType: "NUMBER",
      correctAnswer: "11",
      diagram: { kind: "trapezoid", top: "8", bottom: "14", midline: "?" },
      keyFormula: "m=(a+b)/2",
      hints: ["Средняя линия трапеции связана с основаниями простой формулой — вспомните, как именно.", "m = (a+b)/2. Сложите оба основания и разделите пополам."],
      explanation: "m = (a+b)/2 = (8+14)/2 = 11.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidMidlineArea,
      text: "Основания трапеции равны 6 и 10, высота равна 4. Найдите площадь.",
      answerType: "NUMBER",
      correctAnswer: "32",
      diagram: { kind: "trapezoid", top: "6", bottom: "10", height: "4" },
      keyFormula: "S=((a+b)/2)·h",
      hints: ["Площадь трапеции считается через полусумму оснований и высоту. Вспомните формулу.", "S = (a+b)/2 · h. Подставьте оба основания и высоту."],
      explanation: "S = (a+b)/2 · h = (6+10)/2 · 4 = 8·4 = 32.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidMidlineArea,
      text: "Средняя линия трапеции равна 9, одно из оснований равно 5. Найдите второе основание.",
      answerType: "NUMBER",
      correctAnswer: "13",
      tier: "bank",
      diagram: { kind: "trapezoid", top: "5", bottom: "?", midline: "9" },
      keyFormula: "m=(a+b)/2",
      hints: ["Средняя линия трапеции — это полусумма оснований: m=(a+b)/2. У вас известны m и одно основание.", "Подставьте известные числа в m=(a+b)/2 и решите уравнение относительно второго основания b."],
      explanation: "m=(a+b)/2 → 9=(5+b)/2 → 18=5+b → b=13.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidMidlineArea,
      text: "Средняя линия трапеции равна 12, высота равна 5. Найдите площадь трапеции.",
      diagram: { kind: "trapezoid", midline: "12", height: "5" },
      answerType: "NUMBER",
      correctAnswer: "60",
      tier: "bank",
      keyFormula: "S=m·h",
      hints: ["Площадь трапеции можно найти напрямую через среднюю линию и высоту, без отдельных оснований.", "S=m·h. Подставьте среднюю линию и высоту."],
      explanation: "S=m·h=12·5=60.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidMidlineArea,
      text: "Площадь трапеции равна 84, высота равна 8, а одно из оснований на 3 больше другого. Найдите оба основания. Опишите решение.",
      diagram: { kind: "trapezoid", top: "?", bottom: "?", height: "8" },
      answerType: "DETAILED",
      correctAnswer: "Основания равны 9 и 12.",
      keyFormula: "S=((a+b)/2)·h",
      hints: ["Сначала найдите сумму оснований из формулы площади, затем составьте систему с условием разницы оснований."],
      explanation: "84=((a+b)/2)·8 → a+b=21. Пусть b=a+3: a+(a+3)=21 → 2a=18 → a=9, b=12.",
      difficulty: 2,
      egeTaskNumber: 1,
    }
  );

  // Трапеция: углы и боковые стороны
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skTrapezoidAnglesSides,
      text: "В трапеции один из углов при боковой стороне равен 70°. Найдите второй угол, прилежащий к той же боковой стороне.",
      answerType: "NUMBER",
      correctAnswer: "110",
      diagram: { kind: "trapezoid", angleLabel: "70°" },
      keyFormula: "∠1+∠2=180°",
      hints: [
        "Основания трапеции параллельны — углы, прилежащие к одной боковой стороне (между параллельными прямыми), в сумме составляют развёрнутый угол.",
        "Сумма двух углов, прилежащих к одной боковой стороне трапеции, равна 180°. Вычтите известный угол.",
      ],
      explanation: "Углы при одной боковой стороне трапеции в сумме дают 180°: 180−70=110.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidAnglesSides,
      text: "В равнобедренной трапеции угол при большем основании равен 65°. Найдите угол при меньшем основании, прилежащий к той же боковой стороне.",
      diagram: { kind: "trapezoid", angleLabel: "65°" },
      answerType: "NUMBER",
      correctAnswer: "115",
      tier: "bank",
      keyFormula: "∠1+∠2=180°",
      hints: ["Углы, прилежащие к одной боковой стороне, в сумме дают 180°, независимо от того, равнобедренная трапеция или нет."],
      explanation: "180−65=115.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidAnglesSides,
      text: "Основания равнобедренной трапеции равны 4 и 10, высота равна 4. Найдите боковую сторону.",
      diagram: { kind: "trapezoid", top: "4", bottom: "10", height: "4" },
      answerType: "NUMBER",
      correctAnswer: "5",
      tier: "bank",
      keyFormula: "теорема Пифагора",
      hints: [
        "В равнобедренной трапеции, если опустить высоты из вершин меньшего основания, по бокам образуются два равных прямоугольных треугольника.",
        "Катет каждого треугольника равен половине разности оснований: (10−4)/2=3. Найдите боковую сторону как гипотенузу.",
      ],
      explanation: "Катет=(10−4)/2=3. Боковая сторона=√(3²+4²)=√(9+16)=√25=5.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidAnglesSides,
      text: "В прямоугольной трапеции основания равны 5 и 13, меньшая боковая сторона (перпендикулярная основаниям) равна 6. Найдите большую (наклонную) боковую сторону.",
      diagram: { kind: "trapezoid", top: "5", bottom: "13", height: "6", rightAngle: true },
      answerType: "NUMBER",
      correctAnswer: "10",
      keyFormula: "теорема Пифагора",
      hints: [
        "Перпендикулярная боковая сторона — это высота трапеции. Разница оснований и высота образуют катеты прямоугольного треугольника с наклонной стороной в роли гипотенузы.",
        "Катеты: разница оснований (13−5) и высота (6). Найдите гипотенузу.",
      ],
      explanation: "Разница оснований: 13−5=8. Наклонная сторона=√(8²+6²)=√(64+36)=√100=10.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidAnglesSides,
      text: "Равнобедренная трапеция имеет основания 6 и 16, боковая сторона равна 13. Найдите высоту трапеции. Опишите решение.",
      diagram: { kind: "trapezoid", top: "6", bottom: "16" },
      answerType: "DETAILED",
      correctAnswer: "Высота равна 12.",
      keyFormula: "теорема Пифагора",
      hints: ["Найдите катет прямоугольного треугольника, образованного высотой, боковой стороной и половиной разности оснований."],
      explanation: "Половина разности оснований: (16−6)/2=5. Высота=√(13²−5²)=√(169−25)=√144=12.",
      difficulty: 2,
      egeTaskNumber: 1,
    }
  );

  // Трапеция: диагонали
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skTrapezoidDiagonals,
      text: "Основания трапеции равны 5 и 11, а боковая сторона перпендикулярна основаниям и равна 7. Найдите площадь трапеции.",
      answerType: "NUMBER",
      correctAnswer: "56",
      diagram: { kind: "trapezoid", top: "5", bottom: "11", height: "7", rightAngle: true },
      keyFormula: "S=((a+b)/2)·h",
      hints: [
        "Если боковая сторона перпендикулярна обоим основаниям, она одновременно является высотой трапеции.",
        "Используйте формулу площади трапеции S=((a+b)/2)·h, подставив эту боковую сторону в качестве высоты.",
      ],
      explanation: "Боковая сторона перпендикулярна основаниям, значит это высота. S=((5+11)/2)·7=8·7=56.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidDiagonals,
      text: "Основания трапеции равны 5 и 15. Диагонали пересекаются в точке O, деля каждую диагональ на два отрезка. Найдите отношение большего отрезка к меньшему.",
      diagram: { kind: "trapezoid", top: "5", bottom: "15", showDiagonals: true },
      answerType: "NUMBER",
      correctAnswer: "3",
      tier: "bank",
      keyFormula: "диагонали делятся в отношении оснований",
      hints: [
        "Точка пересечения диагоналей трапеции делит каждую диагональ в отношении, равном отношению оснований.",
        "Разделите большее основание на меньшее.",
      ],
      explanation: "Отношение оснований: 15/5=3. Диагонали делятся в этом же отношении.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidDiagonals,
      text: "Основания трапеции равны 4 и 12. Через точку пересечения диагоналей проведена прямая, параллельная основаниям, до пересечения с боковыми сторонами. Найдите длину отрезка этой прямой.",
      diagram: { kind: "trapezoid", top: "4", bottom: "12", showDiagonals: true, showMidSegment: true },
      answerType: "NUMBER",
      correctAnswer: "6",
      tier: "bank",
      keyFormula: "x=2ab/(a+b)",
      hints: [
        "Есть специальная формула для отрезка, проходящего через точку пересечения диагоналей параллельно основаниям.",
        "x=2ab/(a+b), где a и b — основания. Подставьте значения.",
      ],
      explanation: "x=2·4·12/(4+12)=96/16=6.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidDiagonals,
      text: "Основания трапеции равны 8 и 20. Диагонали пересекаются в точке O и образуют треугольники, прилежащие к основаниям. Найдите коэффициент подобия этих треугольников. Опишите решение.",
      diagram: { kind: "trapezoid", top: "8", bottom: "20", showDiagonals: true },
      answerType: "DETAILED",
      correctAnswer: "Коэффициент подобия равен 2,5.",
      keyFormula: "коэффициент = отношению оснований",
      hints: ["Треугольники, прилежащие к основаниям, подобны по двум углам (накрест лежащие при параллельных основаниях и вертикальные при точке O). Коэффициент подобия равен отношению оснований."],
      explanation:
        "Треугольники подобны по двум углам: накрест лежащие углы при параллельных основаниях и вертикальные углы при точке O. Коэффициент подобия = отношению оснований = 20/8=2,5.",
      difficulty: 3,
      egeTaskNumber: 1,
    }
  );

  // Окружность: длина и площадь круга
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skCircleLengthArea,
      text: "Радиус окружности равен 7. Найдите длину окружности, деленную на π (то есть найдите 2r).",
      answerType: "NUMBER",
      correctAnswer: "14",
      diagram: { kind: "circle", mode: "radius", r: "7" },
      keyFormula: "C=2πr",
      hints: ["Длина окружности выражается через радиус по формуле C = 2πr.", "Разделите обе части формулы C = 2πr на π — получится выражение для 2r. Подставьте радиус."],
      explanation: "C = 2πr, значит C/π = 2r = 14.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleLengthArea,
      text: "Радиус круга равен 3. Найдите площадь круга, делённую на π (то есть r²).",
      answerType: "NUMBER",
      correctAnswer: "9",
      diagram: { kind: "circle", mode: "radius", r: "3" },
      keyFormula: "S=πr²",
      hints: ["Площадь круга выражается через радиус по формуле S = πr².", "Разделите обе части формулы S = πr² на π — получится выражение для r². Подставьте радиус."],
      explanation: "S = πr², значит S/π = r² = 9.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleLengthArea,
      text: "Длина окружности равна 20π. Найдите радиус этой окружности.",
      diagram: { kind: "circle", mode: "radius", r: "?" },
      answerType: "NUMBER",
      correctAnswer: "10",
      tier: "bank",
      keyFormula: "C=2πr",
      hints: ["Выразите радиус из формулы длины окружности.", "r=C/(2π). Подставьте C=20π."],
      explanation: "r=20π/(2π)=10.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleLengthArea,
      text: "Площадь круга равна 49π. Найдите длину окружности этого круга, делённую на π.",
      diagram: { kind: "circle", mode: "radius", r: "?" },
      answerType: "NUMBER",
      correctAnswer: "14",
      tier: "bank",
      keyFormula: "S=πr² → C/π=2r",
      hints: ["Сначала найдите радиус из площади, затем длину окружности, делённую на π.", "r²=49 → r=7. C/π=2r."],
      explanation: "r²=49 → r=7. C/π=2r=14.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleLengthArea,
      text: "Площадь кольца между двумя концентрическими окружностями радиусов 5 и 3 равна S. Найдите S, делённое на π. Опишите решение.",
      answerType: "DETAILED",
      correctAnswer: "16 (площадь кольца равна 16π).",
      keyFormula: "S=π(R²−r²)",
      hints: ["Площадь кольца — это разность площадей большого и малого кругов."],
      explanation: "S=π(R²−r²)=π(25−9)=16π. S/π=16.",
      difficulty: 2,
      egeTaskNumber: 1,
    }
  );

  // Центральные и вписанные углы
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skCircleAngles,
      text: "Центральный угол равен 80°. Чему равен вписанный угол, опирающийся на ту же дугу (в градусах)?",
      answerType: "NUMBER",
      correctAnswer: "40",
      diagram: { kind: "circle", mode: "centralInscribed", central: "80°", inscribed: "?" },
      keyFormula: "∠вписанный=∠центральный/2",
      hints: ["Вписанный угол, опирающийся на ту же дугу, что и центральный, связан с ним простым соотношением.", "Вписанный угол вдвое меньше центрального. Подставьте значение центрального угла."],
      explanation: "Вписанный угол вдвое меньше центрального: 80/2 = 40.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleAngles,
      text: "Вписанный угол опирается на дугу в 100°. Чему равен этот угол в градусах?",
      answerType: "NUMBER",
      correctAnswer: "50",
      diagram: { kind: "circle", mode: "centralInscribed", central: "100°", inscribed: "?" },
      keyFormula: "∠вписанный=дуга/2",
      hints: ["Есть прямое соотношение между вписанным углом и дугой, на которую он опирается.", "Вписанный угол равен половине дуги, на которую опирается. Подставьте величину дуги."],
      explanation: "Вписанный угол равен половине дуги, на которую опирается: 100/2 = 50.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleAngles,
      text: "Вписанный угол равен 35°. Найдите дугу, на которую он опирается, в градусах.",
      diagram: { kind: "circle", mode: "centralInscribed", central: "?", inscribed: "35°" },
      answerType: "NUMBER",
      correctAnswer: "70",
      tier: "bank",
      keyFormula: "дуга=2·∠вписанный",
      hints: ["Действие обратное предыдущему: дуга вдвое больше вписанного угла.", "Умножьте угол на 2."],
      explanation: "Дуга = 2×35 = 70.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleAngles,
      text: "Два вписанных угла опираются на одну и ту же дугу. Один из них равен 42°. Найдите второй.",
      answerType: "NUMBER",
      correctAnswer: "42",
      tier: "bank",
      keyFormula: "вписанные углы на одной дуге равны",
      hints: ["Все вписанные углы, опирающиеся на одну и ту же дугу, равны между собой."],
      explanation: "Вписанные углы на одной дуге равны: второй угол тоже 42°.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleAngles,
      text: "Вписанный угол ABC опирается на диаметр AC окружности. Докажите, что угол ABC равен 90°, и найдите этот угол.",
      diagram: { kind: "circle", mode: "centralInscribed", central: "180°", inscribed: "?" },
      answerType: "DETAILED",
      correctAnswer: "Угол ABC = 90°.",
      keyFormula: "угол, опирающийся на диаметр, равен 90°",
      hints: ["Диаметр стягивает дугу в 180°. Вспомните соотношение между вписанным углом и дугой, на которую он опирается."],
      explanation:
        "Диаметр делит окружность на две дуги по 180°. Вписанный угол ABC опирается на дугу AC=180°, значит ∠ABC=180°/2=90°.",
      difficulty: 2,
      egeTaskNumber: 1,
    }
  );

  // Касательные к окружности
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skCircleTangents,
      text: "Из точки к окружности проведены две касательные. Одна из них равна 12. Чему равна вторая?",
      answerType: "NUMBER",
      correctAnswer: "12",
      diagram: { kind: "circle", mode: "tangent", t1: "12", t2: "?" },
      keyFormula: "касательные из точки равны",
      hints: ["Два отрезка касательных, проведённых из одной внешней точки к окружности, обладают особым свойством.", "Отрезки касательных, проведённые из одной точки, всегда равны друг другу."],
      explanation: "Отрезки касательных, проведённые из одной точки, равны: значит вторая касательная тоже равна 12.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleTangents,
      text: "Из точки A, удалённой от центра окружности на расстояние 13, проведена касательная к окружности радиусом 5. Найдите длину касательной.",
      diagram: { kind: "circle", mode: "tangent", t1: "?", t2: "?" },
      answerType: "NUMBER",
      correctAnswer: "12",
      tier: "bank",
      keyFormula: "теорема Пифагора (радиус⊥касательная)",
      hints: [
        "Радиус, проведённый в точку касания, перпендикулярен касательной — образуется прямоугольный треугольник.",
        "Гипотенуза — расстояние до центра, один катет — радиус, другой — искомая касательная.",
      ],
      explanation: "Касательная=√(OA²−r²)=√(13²−5²)=√(169−25)=√144=12.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleTangents,
      text: "Угол между двумя касательными, проведёнными из внешней точки к окружности, равен 60°. Найдите угол между радиусами, проведёнными в точки касания.",
      answerType: "NUMBER",
      correctAnswer: "120",
      tier: "bank",
      keyFormula: "сумма углов четырёхугольника=360°",
      hints: [
        "Четырёхугольник из центра, двух точек касания и внешней точки имеет два прямых угла (радиус⊥касательная).",
        "Сумма всех четырёх углов четырёхугольника равна 360°. Вычтите из неё два прямых угла (90°+90°) и данный угол между касательными.",
      ],
      explanation: "360−90−90−60=120.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleTangents,
      text: "Из точки A проведены две касательные к окружности радиусом 6, длина каждой касательной равна 8. Найдите расстояние от точки A до центра окружности. Опишите решение.",
      diagram: { kind: "circle", mode: "tangent", t1: "8", t2: "8" },
      answerType: "DETAILED",
      correctAnswer: "OA = 10.",
      keyFormula: "теорема Пифагора",
      hints: ["Радиус в точке касания перпендикулярен касательной — примените теорему Пифагора к треугольнику (центр, точка касания, точка A)."],
      explanation: "Радиус перпендикулярен касательной в точке касания. OA=√(r²+t²)=√(6²+8²)=√(36+64)=√100=10.",
      difficulty: 2,
      egeTaskNumber: 1,
    }
  );

  // Хорды и секущие
  db.problems.push(
    {
      id: stableId("p"),
      skillId: skCircleChords,
      text: "Радиус окружности равен 10. Хорда удалена от центра на 6. Найдите половину длины этой хорды.",
      answerType: "NUMBER",
      correctAnswer: "8",
      diagram: { kind: "circle", mode: "chord", r: "10", d: "6", half: "?" },
      keyFormula: "полухорда=√(r²−d²)",
      hints: [
        "Перпендикуляр из центра окружности к хорде делит её пополам — вместе с радиусом и половиной хорды получается прямоугольный треугольник.",
        "Примените теорему Пифагора: половина хорды = √(r² − d²), где d — расстояние от центра до хорды.",
      ],
      explanation: "√(10² − 6²) = √(100−36) = √64 = 8.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleChords,
      text: "Хорда окружности равна 16, расстояние от центра до хорды равно 6. Найдите радиус окружности.",
      diagram: { kind: "circle", mode: "chord", r: "?", d: "6" },
      answerType: "NUMBER",
      correctAnswer: "10",
      tier: "bank",
      keyFormula: "r=√((хорда/2)²+d²)",
      hints: ["Половина хорды, расстояние до центра и радиус образуют прямоугольный треугольник.", "r=√((хорда/2)²+d²). Подставьте половину хорды (8) и расстояние (6)."],
      explanation: "r=√(8²+6²)=√(64+36)=√100=10.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleChords,
      text: "Две хорды окружности пересекаются внутри неё. Отрезки одной хорды равны 4 и 9, один из отрезков другой хорды равен 6. Найдите второй отрезок.",
      answerType: "NUMBER",
      correctAnswer: "6",
      tier: "bank",
      keyFormula: "a·b=c·d",
      hints: [
        "Если две хорды пересекаются внутри окружности, произведения отрезков одной хорды равно произведению отрезков другой.",
        "4×9=6×x. Найдите x.",
      ],
      explanation: "4×9=6×x → x=36/6=6.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleChords,
      text: "Из точки вне окружности проведены секущая и касательная. Внешний отрезок секущей равен 4, а вся секущая равна 9. Найдите длину касательной.",
      answerType: "NUMBER",
      correctAnswer: "6",
      tier: "bank",
      keyFormula: "t²=d·(d+внутр.часть)",
      hints: [
        "Квадрат касательной равен произведению всей секущей на её внешнюю часть.",
        "t²=4×9. Извлеките корень.",
      ],
      explanation: "t²=4×9=36 → t=6.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCircleChords,
      text: "Из внешней точки к окружности проведены две секущие. Первая имеет внешний отрезок 3 и полную длину 12, вторая имеет внешний отрезок 4. Найдите полную длину второй секущей. Опишите решение.",
      answerType: "DETAILED",
      correctAnswer: "Полная длина второй секущей равна 9.",
      keyFormula: "d₁·D₁=d₂·D₂",
      hints: ["Для двух секущих из одной внешней точки произведения полной секущей на её внешнюю часть равны для обеих секущих."],
      explanation: "По теореме о двух секущих: 3×12=4×D₂ → D₂=36/4=9.",
      difficulty: 3,
      egeTaskNumber: 1,
    }
  );


  db.problems.push(
    {
      id: stableId("p"),
      skillId: skQuadArea,
      text: "Диагонали четырёхугольника равны 8 и 10, угол между ними равен 30°. Найдите площадь четырёхугольника.",
      answerType: "NUMBER",
      correctAnswer: "20",
      keyFormula: "S=½·d₁·d₂·sinθ",
      hints: ["Площадь любого четырёхугольника через диагонали: S=½·d₁·d₂·sinθ.", "sin30°=0,5."],
      explanation: "S=½·8·10·sin30°=½·80·0,5=20.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skQuadArea,
      text: "Диагонали четырёхугольника равны 12 и 14, угол между ними равен 150°. Найдите площадь.",
      answerType: "NUMBER",
      correctAnswer: "42",
      keyFormula: "S=½·d₁·d₂·sinθ",
      hints: ["sin150°=sin30°=0,5."],
      explanation: "S=½·12·14·sin150°=½·168·0,5=42.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skQuadArea,
      text: "Четырёхугольник вписан в окружность, его стороны равны 4, 5, 7 и 10. Найдите площадь по формуле Брахмагупты.",
      answerType: "NUMBER",
      correctAnswer: "36",
      keyFormula: "S=√((p−a)(p−b)(p−c)(p−d))",
      hints: ["Полупериметр p=(4+5+7+10)/2=13.", "S=√(9·8·6·3)."],
      explanation: "p=13. S=√((13−4)(13−5)(13−7)(13−10))=√(9·8·6·3)=√1296=36.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skQuadArea,
      text: "Четырёхугольник вписан в окружность, его стороны равны 6, 8, 10 и 12. Найдите площадь по формуле Брахмагупты. Опишите решение (ответ можно оставить с корнем).",
      answerType: "DETAILED",
      correctAnswer: "24√10 (≈75,9).",
      keyFormula: "S=√((p−a)(p−b)(p−c)(p−d))",
      hints: ["Полупериметр p=18."],
      explanation: "p=18. S=√(12·10·8·6)=√5760=24√10≈75,9.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skQuadArea,
      text: "Диагонали четырёхугольника равны 6 и 9, угол между ними прямой. Найдите площадь.",
      answerType: "NUMBER",
      correctAnswer: "27",
      hints: ["Если угол между диагоналями прямой, sinθ=1."],
      explanation: "S=½·6·9·sin90°=½·54·1=27.",
      difficulty: 1,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skPtolemy,
      text: "Четырёхугольник ABCD вписан в окружность. AB=3, BC=4, CD=5, AD=6. Найдите произведение диагоналей AC·BD.",
      answerType: "NUMBER",
      correctAnswer: "39",
      keyFormula: "AC·BD=AB·CD+BC·AD",
      hints: ["По теореме Птолемея произведение диагоналей равно сумме произведений противоположных сторон."],
      explanation: "AC·BD=AB·CD+BC·AD=3·5+4·6=15+24=39.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skPtolemy,
      text: "Четырёхугольник ABCD вписан в окружность. AB=5, BC=6, CD=7, AD=8. Найдите AC·BD.",
      answerType: "NUMBER",
      correctAnswer: "83",
      keyFormula: "AC·BD=AB·CD+BC·AD",
      hints: ["AC·BD=AB·CD+BC·AD."],
      explanation: "AC·BD=5·7+6·8=35+48=83.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skPtolemy,
      text: "Докажите теорему Птолемея для прямоугольника со сторонами 6 и 8, и покажите, что она превращается в теорему Пифагора.",
      answerType: "DETAILED",
      correctAnswer: "Диагонали равны AC=BD, стороны CD=AB=6, AD=BC=8. AC·BD=AB·CD+BC·AD → AC²=6·6+8·8=36+64=100 → AC=10 — это теорема Пифагора (6²+8²=10²).",
      hints: ["В прямоугольнике диагонали равны, а противоположные стороны равны."],
      explanation: "AC=BD, поэтому AC²=AB·CD+BC·AD=AB²+BC². При AB=6,BC=8: AC²=36+64=100, AC=10.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skPtolemy,
      text: "Четырёхугольник ABCD вписан в окружность. AB=7, BC=9, CD=11, AD=13. Найдите AC·BD.",
      answerType: "NUMBER",
      correctAnswer: "194",
      hints: ["AC·BD=AB·CD+BC·AD."],
      explanation: "AC·BD=7·11+9·13=77+117=194.",
      difficulty: 2,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skPtolemy,
      text: "Четырёхугольник ABCD вписан в окружность. AB=2, BC=3, CD=4, AD=5. Найдите AC·BD и укажите, какую теорему вы использовали.",
      answerType: "DETAILED",
      correctAnswer: "Теорема Птолемея: AC·BD=2·4+3·5=8+15=23.",
      hints: ["AC·BD=AB·CD+BC·AD."],
      explanation: "AC·BD=2·4+3·5=8+15=23.",
      difficulty: 2,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skVarignon,
      text: "Диагонали четырёхугольника равны 10 и 14. Найдите периметр параллелограмма Вариньона (образованного серединами сторон).",
      answerType: "NUMBER",
      correctAnswer: "24",
      keyFormula: "P=d₁+d₂",
      hints: ["Стороны параллелограмма Вариньона равны половинам диагоналей."],
      explanation: "P=d₁+d₂=10+14=24.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skVarignon,
      text: "Площадь четырёхугольника равна 48. Найдите площадь параллелограмма Вариньона, образованного серединами его сторон.",
      answerType: "NUMBER",
      correctAnswer: "24",
      keyFormula: "S=S₀/2",
      hints: ["Площадь параллелограмма Вариньона всегда равна половине площади исходного четырёхугольника."],
      explanation: "S=48/2=24.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skVarignon,
      text: "Диагонали четырёхугольника равны 12 и 16 и перпендикулярны. Докажите, что параллелограмм Вариньона для этого четырёхугольника — прямоугольник, и найдите его стороны.",
      answerType: "DETAILED",
      correctAnswer: "Стороны параллелограмма Вариньона параллельны диагоналям и равны их половинам: 12/2=6 и 16/2=8. Так как диагонали перпендикулярны, стороны параллелограмма Вариньона тоже перпендикулярны — значит, это прямоугольник со сторонами 6 и 8.",
      hints: ["Стороны параллелограмма Вариньона параллельны диагоналям исходного четырёхугольника."],
      explanation: "Стороны: 12/2=6 и 16/2=8, угол между ними равен углу между диагоналями — 90°.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skVarignon,
      text: "Периметр параллелограмма Вариньона равен 26, одна из диагоналей исходного четырёхугольника равна 15. Найдите вторую диагональ.",
      answerType: "NUMBER",
      correctAnswer: "11",
      hints: ["P=d₁+d₂."],
      explanation: "26=15+d₂ → d₂=11.",
      difficulty: 2,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skVarignon,
      text: "Площадь параллелограмма Вариньона равна 20. Найдите площадь исходного четырёхугольника.",
      answerType: "NUMBER",
      correctAnswer: "40",
      hints: ["S₀=2·S."],
      explanation: "S₀=2·20=40.",
      difficulty: 1,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skKite,
      text: "Диагонали дельтоида равны 10 и 16. Найдите его площадь.",
      answerType: "NUMBER",
      correctAnswer: "80",
      keyFormula: "S=½·d₁·d₂",
      hints: ["Диагонали дельтоида перпендикулярны — площадь считается как у ромба."],
      explanation: "S=½·10·16=80.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skKite,
      text: "В дельтоиде ABCD с осью симметрии BD известно AB=13, AO=5, где O — точка пересечения диагоналей. Найдите BO.",
      answerType: "NUMBER",
      correctAnswer: "12",
      hints: ["Диагонали перпендикулярны, треугольник ABO прямоугольный с гипотенузой AB."],
      explanation: "По теореме Пифагора: BO=√(AB²−AO²)=√(169−25)=√144=12.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skKite,
      text: "Угол при вершине A дельтоида (не лежащей на оси симметрии) равен 70°. Чему равен угол при вершине C (тоже не на оси)?",
      answerType: "NUMBER",
      correctAnswer: "70",
      hints: ["Углы при вершинах, не лежащих на оси симметрии, у дельтоида всегда равны."],
      explanation: "Ось симметрии делит дельтоид на два равных треугольника, поэтому углы при A и C равны: 70°.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skKite,
      text: "Докажите, что диагональ BD дельтоида ABCD (ось симметрии) является биссектрисой угла B, и найдите ∠ABD, если ∠ABC=80°.",
      answerType: "DETAILED",
      correctAnswer: "Диагональ BD — ось симметрии дельтоида, поэтому она делит углы при вершинах B и D пополам. ∠ABD=∠ABC/2=80/2=40°.",
      hints: ["Ось симметрии дельтоида всегда является биссектрисой углов, через которые проходит."],
      explanation: "∠ABD=∠ABC/2=40°.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skKite,
      text: "Диагонали дельтоида равны 9 и 20. Найдите площадь.",
      answerType: "NUMBER",
      correctAnswer: "90",
      hints: ["S=½·d₁·d₂."],
      explanation: "S=½·9·20=90.",
      difficulty: 1,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidAdvanced,
      text: "В трапецию ABCD с основаниями AD=14 и BC=8 вписана окружность. Найдите сумму боковых сторон AB+CD.",
      answerType: "NUMBER",
      correctAnswer: "22",
      keyFormula: "AD+BC=AB+CD",
      hints: ["У трапеции, описанной около окружности, сумма оснований равна сумме боковых сторон."],
      explanation: "AB+CD=AD+BC=14+8=22.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidAdvanced,
      text: "Основания трапеции равны 18 и 10, одна боковая сторона равна 11. В трапецию вписана окружность. Найдите вторую боковую сторону.",
      answerType: "NUMBER",
      correctAnswer: "17",
      keyFormula: "AD+BC=AB+CD",
      hints: ["Сумма оснований равна сумме боковых сторон."],
      explanation: "18+10=11+CD → CD=28−11=17.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidAdvanced,
      text: "Основания трапеции равны 20 и 12. Найдите длину отрезка, соединяющего середины диагоналей.",
      answerType: "NUMBER",
      correctAnswer: "4",
      keyFormula: "EF=(AD−BC)/2",
      hints: ["Отрезок между серединами диагоналей равен полуразности оснований."],
      explanation: "EF=(20−12)/2=4.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidAdvanced,
      text: "Отрезок, соединяющий середины диагоналей трапеции, равен 5. Большее основание равно 17. Найдите меньшее.",
      answerType: "NUMBER",
      correctAnswer: "7",
      hints: ["EF=(AD−BC)/2."],
      explanation: "5=(17−BC)/2 → BC=17−10=7.",
      difficulty: 2,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidAdvanced,
      text: "В равнобедренной трапеции основания равны 16 и 6. Найдите проекцию боковой стороны на большее основание. Опишите решение.",
      answerType: "DETAILED",
      correctAnswer: "Проекция боковой стороны равнобедренной трапеции на большее основание равна полуразности оснований: (16−6)/2=5.",
      hints: ["Высота из вершины меньшего основания делит большее основание на отрезки, один из которых и есть искомая проекция."],
      explanation: "Проекция=(AD−BC)/2=(16−6)/2=5.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTrapezoidAdvanced,
      text: "Сформулируйте и опишите идею доказательства замечательного свойства трапеции: середины оснований, точка пересечения диагоналей и точка пересечения продолжений боковых сторон лежат на одной прямой.",
      answerType: "DETAILED",
      correctAnswer: "Треугольники, образованные точкой пересечения боковых сторон (или диагоналей) и основаниями трапеции, подобны с одним и тем же коэффициентом подобия, равным отношению оснований. Поэтому и точка пересечения диагоналей, и точка пересечения продолжений боковых сторон делят соответствующие отрезки в одном и том же отношении относительно оснований — а значит, вместе с серединами оснований лежат на общей прямой (оси подобия трапеции).",
      hints: ["Рассмотрите подобие треугольников, которые образуют диагонали и продолжения боковых сторон с основаниями."],
      explanation: "Все четыре точки лежат на прямой, задаваемой подобием треугольников с коэффициентом, равным отношению оснований.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTriangleCenters,
      text: "В прямоугольном треугольнике катеты равны 6 и 8. Найдите радиус описанной окружности.",
      answerType: "NUMBER",
      correctAnswer: "5",
      keyFormula: "R=abc/(4S)",
      hints: ["В прямоугольном треугольнике центр описанной окружности лежит на середине гипотенузы, а радиус равен половине гипотенузы."],
      explanation: "Гипотенуза=√(36+64)=10. R=10/2=5.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTriangleCenters,
      text: "Стороны треугольника равны 5, 12, 13, его площадь равна 30. Найдите радиус вписанной окружности.",
      answerType: "NUMBER",
      correctAnswer: "2",
      keyFormula: "r=S/p",
      hints: ["Полупериметр p=(5+12+13)/2=15."],
      explanation: "r=S/p=30/15=2.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTriangleCenters,
      text: "Катеты прямоугольного треугольника равны 9 и 12. Найдите радиус описанной окружности.",
      answerType: "NUMBER",
      correctAnswer: "7.5",
      hints: ["R равен половине гипотенузы."],
      explanation: "Гипотенуза=√(81+144)=15. R=7,5.",
      difficulty: 2,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTriangleCenters,
      text: "В треугольнике со сторонами 9, 10, 11 площадь равна 30√2. Найдите радиус вписанной окружности и объясните, где расположен его центр.",
      answerType: "DETAILED",
      correctAnswer: "Полупериметр p=15. r=S/p=30√2/15=2√2. Центр вписанной окружности (инцентр) — точка пересечения биссектрис треугольника, равноудалённая от всех трёх сторон.",
      hints: ["r=S/p."],
      explanation: "r=30√2/15=2√2≈2,83.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skTriangleCenters,
      text: "Площадь треугольника равна 60, стороны равны 15, 13, 14. Найдите радиус описанной окружности.",
      answerType: "NUMBER",
      correctAnswer: "8.125",
      hints: ["R=abc/(4S)."],
      explanation: "R=(15·13·14)/(4·60)=2730/240=8,125.",
      difficulty: 3,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skExcenter,
      text: "Площадь треугольника равна 36, полупериметр равен 9, сторона a равна 5. Найдите радиус вневписанной окружности, противоположной стороне a.",
      answerType: "NUMBER",
      correctAnswer: "9",
      keyFormula: "rₐ=S/(p−a)",
      hints: ["Вневписанная окружность, противоположная стороне a, касается стороны a и продолжений двух других сторон."],
      explanation: "rₐ=36/(9−5)=36/4=9.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skExcenter,
      text: "Стороны прямоугольного треугольника равны 6, 8, 10, площадь равна 24. Найдите радиус вневписанной окружности, противоположной стороне 6.",
      answerType: "NUMBER",
      correctAnswer: "4",
      keyFormula: "rₐ=S/(p−a)",
      hints: ["Полупериметр p=(6+8+10)/2=12."],
      explanation: "rₐ=24/(12−6)=4.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skExcenter,
      text: "Тот же треугольник (стороны 6, 8, 10, площадь 24). Найдите радиус вневписанной окружности, противоположной стороне 8.",
      answerType: "NUMBER",
      correctAnswer: "6",
      hints: ["rᵦ=S/(p−b)."],
      explanation: "r=24/(12−8)=6.",
      difficulty: 2,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skExcenter,
      text: "Тот же треугольник (стороны 6, 8, 10, площадь 24). Найдите радиус вневписанной окружности, противоположной стороне 10.",
      answerType: "NUMBER",
      correctAnswer: "12",
      hints: ["r_c=S/(p−c)."],
      explanation: "r=24/(12−10)=12.",
      difficulty: 2,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skExcenter,
      text: "Объясните, чем вневписанная окружность отличается от вписанной, и найдите радиус вневписанной окружности, противоположной стороне 12, для треугольника со сторонами 5, 12, 13 и площадью 30.",
      answerType: "DETAILED",
      correctAnswer: "Вписанная окружность касается всех трёх сторон изнутри треугольника. Вневписанная — касается одной стороны и продолжений двух других, находясь снаружи треугольника за этой стороной. Полупериметр p=15. r=S/(p−b)=30/(15−12)=10.",
      hints: ["rᵦ=S/(p−b)."],
      explanation: "r=30/(15−12)=10.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCyclicTangentialQuad,
      text: "В четырёхугольнике, вписанном в окружность, ∠A=80°, ∠C=100°, ∠B=95°. Найдите ∠D.",
      answerType: "NUMBER",
      correctAnswer: "85",
      keyFormula: "∠A+∠C=∠B+∠D=180°",
      hints: ["Сумма противоположных углов вписанного четырёхугольника равна 180°."],
      explanation: "∠B+∠D=180° → ∠D=180−95=85°.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCyclicTangentialQuad,
      text: "В вписанном четырёхугольнике ∠B=105°. Найдите ∠D.",
      answerType: "NUMBER",
      correctAnswer: "75",
      hints: ["∠B+∠D=180°."],
      explanation: "∠D=180−105=75°.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCyclicTangentialQuad,
      text: "В четырёхугольник ABCD вписана окружность (окружность касается всех сторон). AB=7, BC=9, CD=8. Найдите AD.",
      answerType: "NUMBER",
      correctAnswer: "6",
      keyFormula: "AB+CD=BC+AD",
      hints: ["У описанного четырёхугольника суммы противоположных сторон равны."],
      explanation: "AB+CD=BC+AD → 7+8=9+AD → AD=15−9=6.",
      difficulty: 2,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skCyclicTangentialQuad,
      text: "В четырёхугольник ABCD вписана окружность. AB=10, CD=14, BC=16. Найдите AD.",
      answerType: "NUMBER",
      correctAnswer: "8",
      hints: ["AB+CD=BC+AD."],
      explanation: "10+14=16+AD → AD=24−16=8.",
      difficulty: 2,
      egeTaskNumber: 1,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skCyclicTangentialQuad,
      text: "Около окружности описан четырёхугольник ABCD. AB=9, BC=6, AD=11, а периметр равен 34. Найдите CD, используя свойство описанного четырёхугольника, и проверьте ответ через периметр.",
      answerType: "DETAILED",
      correctAnswer: "Через периметр: CD=34−9−6−11=8. Проверка по свойству описанного четырёхугольника: AB+CD=BC+AD → 9+8=6+11=17 ✓. CD=8.",
      hints: ["Периметр — сумма всех сторон; свойство описанного четырёхугольника — сумма противоположных сторон равна."],
      explanation: "CD=34−9−6−11=8, и проверка: 9+8=17=6+11.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skSectorSimilar,
      text: "Радиус круга равен 6, центральный угол сектора равен 60°. Площадь сектора равна S. Найдите S, делённое на π.",
      answerType: "NUMBER",
      correctAnswer: "6",
      keyFormula: "S=πr²α/360°",
      hints: ["S=πr²·α/360°, затем разделите на π."],
      explanation: "S=π·36·60/360=6π. S/π=6.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skSectorSimilar,
      text: "Радиус круга равен 12, угол сектора равен 90°. Площадь сектора равна S. Найдите S, делённое на π.",
      answerType: "NUMBER",
      correctAnswer: "36",
      hints: ["S=πr²·α/360°."],
      explanation: "S=π·144·90/360=36π. S/π=36.",
      difficulty: 1,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skSectorSimilar,
      text: "Радиус круга равен 10, длина дуги сектора равна 5π. Найдите площадь сектора. Опишите решение.",
      answerType: "DETAILED",
      correctAnswer: "Угол сектора: длина дуги=2πr·α/360° → 5π=2π·10·α/360 → α=90°. Площадь: S=πr²·α/360°=π·100·90/360=25π.",
      hints: ["Сначала найдите угол сектора через длину дуги, затем площадь через угол."],
      explanation: "α=90° (из длины дуги), S=π·100·90/360=25π.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skSectorSimilar,
      text: "Хорды AB и CD пересекаются в точке E внутри окружности. AE=4, EB=9, CE=6. Докажите подобие треугольников AEC и DEB, и с его помощью найдите ED.",
      answerType: "DETAILED",
      correctAnswer: "∠AEC=∠DEB (вертикальные), ∠CAE=∠BDE (вписанные, опираются на одну дугу BC). По двум углам треугольники AEC и DEB подобны, значит AE/DE=CE/BE → AE·BE=CE·DE. Отсюда 4·9=6·ED → ED=36/6=6.",
      hints: ["Вертикальные углы при E равны; вписанные углы, опирающиеся на одну дугу, тоже равны."],
      explanation: "AE·EB=CE·ED → 4·9=6·ED → ED=6.",
      difficulty: 3,
      egeTaskNumber: 1,
    },
    {
      id: stableId("p"),
      skillId: skSectorSimilar,
      text: "Хорды пересекаются в точке E внутри окружности. AE=3, EB=8, CE=4. Найдите ED, используя подобие треугольников.",
      answerType: "NUMBER",
      correctAnswer: "6",
      hints: ["AE·EB=CE·ED."],
      explanation: "3·8=4·ED → ED=24/4=6.",
      difficulty: 2,
      egeTaskNumber: 1,
      tier: "bank",
    }
  );

  // ---------------- Модуль: Теория вероятности ----------------
  // Контент подготовлен на основе реальных конспектов и подборки задач
  // (сборник И.В. Ященко) — теория и формулировки задач сохранены близко
  // к первоисточнику, все числовые ответы перепроверены самостоятельно
  // (частично — через Python с точными дробями, не на глаз).
  const probTopicId = stableId("t");
  db.topics.push({ id: probTopicId, order: 2, title: "Теория вероятности" });

  const chProbBasics = stableId("s");
  db.subtopics.push({ id: chProbBasics, topicId: probTopicId, order: 1, title: "Теория вероятности" });

  const skProbClassic = stableId("sk");
  const skProbMultiTrial = stableId("sk");
  const skProbSumRule = stableId("sk");
  const skProbTree = stableId("sk");
  const skProbNoReturn = stableId("sk");
  const skProbArrangement = stableId("sk");
  const skProbConditional = stableId("sk");

  db.skills.push(
    {
      id: skProbClassic,
      subtopicId: chProbBasics,
      order: 1,
      title: "Основные понятия. Классическая вероятность",
      theoryCards: [
        {
          title: "Случайный эксперимент и элементарные исходы",
          body: "Случайный эксперимент — любое событие из реальной жизни, результат которого невозможно точно предсказать (бросок кубика, вытягивание билета). Каждому элементарному исходу соответствует число P — вероятность его возникновения, P∈[0,1]. Сумма вероятностей всех элементарных исходов случайного эксперимента всегда равна 1.",
        },
        {
          title: "Формула классической вероятности",
          formula: "P(A) = m/n",
          body: "Если все элементарные исходы равновероятны и всего их n, а событию A благоприятствует m из них, то вероятность события A равна отношению числа благоприятных исходов к общему числу исходов. Важно: эта формула работает ТОЛЬКО когда исходы равновероятны — если это не так, делить количества нельзя, вероятность нужно брать из условия напрямую.",
        },
        {
          title: "Событие — это множество исходов",
          body: "Событие — совокупность некоторого количества элементарных исходов. Например, при броске кубика событию «выпало чётное число» соответствует подмножество {2,4,6}. Вероятность события равна сумме вероятностей всех благоприятствующих ему элементарных исходов.",
        },
      ],
    },
    {
      id: skProbMultiTrial,
      subtopicId: chProbBasics,
      order: 2,
      title: "Несколько испытаний подряд",
      theoryCards: [
        {
          title: "Правило умножения для подсчёта исходов",
          formula: "n · n · ... · n = n^k",
          body: "Если случайный эксперимент повторяется k раз независимо (например, кубик бросают несколько раз), и на каждом шаге возможно n исходов, то общее количество элементарных исходов всего эксперимента равно n^k. Например, для двух бросков кубика: 6·6=36 исходов, для трёх бросков монеты: 2·2·2=8 исходов.",
        },
        {
          title: "Как перечислять исходы",
          body: "Для монеты, брошенной 3 раза, удобно выписать все 8 исходов явно: ООО, ООР, ОРО, ОРР, РОО, РОР, РРО, РРР. Так проще посчитать, сколько из них подходят под условие задачи (например, «выпало не менее 2 решек»), не совершая ошибок в переборе.",
        },
      ],
    },
    {
      id: skProbSumRule,
      subtopicId: chProbBasics,
      order: 3,
      title: "Несовместные события. Сумма вероятностей",
      theoryCards: [
        {
          title: "Несовместные события",
          body: "Два события несовместны, если они не могут произойти одновременно в одном и том же испытании (например, «кофе закончился» и «кофе не закончился» — несовместны). Для НЕСОВМЕСТНЫХ событий вероятность того, что произойдёт одно ИЛИ другое, равна сумме их вероятностей: P(A или B)=P(A)+P(B).",
        },
        {
          title: "Полная группа событий",
          formula: "P(A₁)+P(A₂)+...+P(Aₙ)=1",
          body: "Если события покрывают ВСЕ возможные исходы эксперимента и попарно несовместны (полная группа событий), сумма их вероятностей равна 1. Отсюда удобное следствие: вероятность противоположного события P(не A)=1−P(A).",
        },
      ],
    },
    {
      id: skProbTree,
      subtopicId: chProbBasics,
      order: 4,
      title: "Дерево вероятностей. Цепочки событий",
      theoryCards: [
        {
          title: "Что такое дерево вероятностей",
          body: "Дерево вероятностей — способ наглядно представить последовательность из нескольких случайных событий. Каждая ветка дерева — один из возможных исходов очередного шага, на ней подписывается вероятность именно этого перехода.",
        },
        {
          title: "Правило умножения вдоль ветки",
          formula: "P(путь)=P₁·P₂·...·Pₖ",
          body: "Чтобы найти вероятность конкретной ПОСЛЕДОВАТЕЛЬНОСТИ событий (одного полного пути по дереву от начала до конца), вероятности на каждом шаге этого пути перемножаются.",
        },
        {
          title: "Правило сложения по разным веткам",
          formula: "P(A)=P(путь₁)+P(путь₂)+...",
          body: "Если событие может произойти НЕСКОЛЬКИМИ разными путями по дереву (например, «хотя бы один успех» можно получить разными комбинациями попаданий/промахов), вероятности всех подходящих путей складываются.",
        },
      ],
    },
    {
      id: skProbNoReturn,
      subtopicId: chProbBasics,
      order: 5,
      title: "Выбор нескольких предметов без возврата",
      theoryCards: [
        {
          title: "Почему это не просто умножение",
          body: "Когда предметы выбирают ОДИН ЗА ДРУГИМ, не возвращая обратно (шары из корзины, фломастеры из набора), общее количество предметов и состав меняются после каждого выбора. Вероятность каждого следующего шага нужно считать от НОВОГО, уменьшившегося на 1 количества.",
        },
        {
          title: "Дерево с уменьшающимся знаменателем",
          formula: "P=k/n · (k−1)/(n−1) · ...",
          body: "Например, вероятность вытащить подряд 2 синих шара из 11 синих и 25 всего: первый раз 11/25, второй раз (после того как один синий уже вынули) — уже 10/24, а не 11/24. Это самая частая ошибка в таких задачах — забыть уменьшить и числитель, и знаменатель.",
        },
      ],
    },
    {
      id: skProbArrangement,
      subtopicId: chProbBasics,
      order: 6,
      title: "Рассадка и порядок",
      theoryCards: [
        {
          title: "Случайный порядок — все места равноправны",
          body: "Если группу людей (или предметов) случайно распределяют по местам/группам/очереди, то для ЛЮБОГО конкретного человека вероятность оказаться на конкретном месте (или в конкретной группе) одна и та же — она не зависит от того, где стоят остальные.",
        },
        {
          title: "Вероятность соседства за круглым столом",
          body: "Если за круглым столом с n местами случайно рассаживают людей, вероятность того, что два конкретных человека окажутся РЯДОМ — это (количество мест рядом с одним человеком) делённое на (число оставшихся мест для второго). Обычно удобно посчитать вероятность НЕ рядом и вычесть из 1.",
        },
      ],
    },
    {
      id: skProbConditional,
      subtopicId: chProbBasics,
      order: 7,
      title: "Условная вероятность. Комбинаторика",
      theoryCards: [
        {
          title: "Условная вероятность",
          body: "Условная вероятность — вероятность события A, если заранее ИЗВЕСТНО, что произошло (или обязательно произойдёт) некоторое другое условие. Условие сужает пространство исходов: не все возможные значения подходят, а только те, что удовлетворяют условию. Пересчитывать нужно и общее число исходов, и число благоприятных — оба в рамках суженного условием пространства.",
        },
        {
          title: "Формула числа сочетаний",
          formula: "C(n,k) = n!/(k!·(n−k)!)",
          body: "Число сочетаний C(n,k) — сколькими способами можно выбрать k предметов из n, если порядок выбора не важен. Например, число способов выбрать 4 карты из 10: C(10,4)=210. Эта формула часто нужна, когда сравнивают вероятности разных исходов через ОТНОШЕНИЕ количества благоприятных комбинаций, а не считают каждую вероятность по отдельности.",
        },
      ],
    }
  );

  db.problems.push(
    // --- Навык 1: Классическая вероятность ---
    {
      id: stableId("p"),
      skillId: skProbClassic,
      text: "В фирме такси в наличии 45 легковых автомобилей. Из них 18 чёрного цвета с жёлтыми надписями на бортах, остальные — жёлтого цвета с чёрными надписями. Найдите вероятность того, что на случайный вызов приедет машина жёлтого цвета с чёрными надписями.",
      answerType: "NUMBER",
      correctAnswer: "0.6",
      keyFormula: "P(A)=m/n",
      hints: [
        "Сначала найдите, сколько машин жёлтого цвета с чёрными надписями — остальные от 18 чёрных.",
        "Вероятность = (число подходящих машин) / (общее число машин) = 27/45.",
      ],
      explanation: "Жёлтых машин: 45−18=27. Вероятность: 27/45=0,6.",
      difficulty: 1,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbClassic,
      text: "В соревнованиях по лёгкой атлетике участвуют 6 спортсменов из Финляндии, 7 из Дании, 9 из Словении и 8 из Норвегии. Порядок, в котором выступают спортсмены, определяется жребием. Найдите вероятность того, что спортсмен, который выступает последним, окажется из Словении.",
      answerType: "NUMBER",
      correctAnswer: "0.3",
      keyFormula: "P(A)=m/n",
      hints: [
        "Неважно, про какое по счёту выступление спрашивают — каждый спортсмен с одинаковой вероятностью может там оказаться.",
        "Вероятность = (число спортсменов из Словении) / (общее число спортсменов).",
      ],
      explanation: "Всего спортсменов: 6+7+9+8=30. Вероятность: 9/30=0,3.",
      difficulty: 1,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbClassic,
      text: "При производстве в среднем из каждых 1500 насосов 36 неисправных. Найдите вероятность того, что случайно выбранный насос окажется неисправным.",
      answerType: "NUMBER",
      correctAnswer: "0.024",
      keyFormula: "P(A)=m/n",
      hints: ["Вероятность брака — это отношение числа бракованных насосов к общему числу."],
      explanation: "P=36/1500=0,024.",
      difficulty: 1,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbClassic,
      text: "В магазине в одной коробке лежат вперемешку ручки с чёрными, синими и красными чернилами, одинаковые на вид. Покупатель случайным образом выбирает одну ручку. Вероятность того, что она окажется синей, равна 0,47, а того, что она окажется красной, равна 0,18. Найдите вероятность того, что ручка окажется чёрной.",
      answerType: "NUMBER",
      correctAnswer: "0.35",
      hints: [
        "Ручка может оказаться только синей, красной или чёрной — сумма всех трёх вероятностей равна 1.",
        "P(чёрная)=1−P(синяя)−P(красная).",
      ],
      explanation: "P=1−0,47−0,18=0,35.",
      difficulty: 1,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbClassic,
      text: "В сборнике билетов по математике всего 60 билетов, в 9 из них встречается вопрос по теме «Производная». Найдите вероятность того, что в случайно выбранном на экзамене билете школьнику НЕ достанется вопрос по теме «Производная».",
      answerType: "NUMBER",
      correctAnswer: "0.85",
      hints: [
        "Сначала найдите число билетов БЕЗ этой темы.",
        "P=(60−9)/60.",
      ],
      explanation: "Билетов без темы: 60−9=51. P=51/60=0,85.",
      difficulty: 1,
      egeTaskNumber: 4,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbClassic,
      text: "На олимпиаде по физике 250 участников размещают в четырёх аудиториях: в трёх — по 70 человек, а оставшихся — в запасной аудитории. Найдите вероятность того, что случайно выбранный участник будет писать олимпиаду в запасной аудитории.",
      answerType: "NUMBER",
      correctAnswer: "0.16",
      hints: [
        "Сначала найдите, сколько человек попало в запасную аудиторию: 250 минус три основные аудитории.",
      ],
      explanation: "В запасной: 250−3·70=40. P=40/250=0,16.",
      difficulty: 2,
      egeTaskNumber: 4,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbClassic,
      text: "Фабрика выпускает сумки. В среднем 8 сумок из 1000 имеют скрытые дефекты. Найдите вероятность того, что купленная сумка окажется БЕЗ дефектов.",
      answerType: "NUMBER",
      correctAnswer: "0.992",
      hints: ["Сначала найдите число сумок без дефектов из 1000."],
      explanation: "Без дефектов: 1000−8=992. P=992/1000=0,992.",
      difficulty: 1,
      egeTaskNumber: 4,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbClassic,
      text: "Фабрика выпускает сумки. В среднем на 30 качественных сумок приходится 2 сумки со скрытыми дефектами. Найдите вероятность того, что выбранная в магазине сумка окажется с дефектами.",
      answerType: "NUMBER",
      correctAnswer: "0.0625",
      hints: [
        "Всего сумок в такой партии: 30 качественных + 2 бракованных.",
      ],
      explanation: "Всего сумок: 30+2=32. P=2/32=0,0625.",
      difficulty: 2,
      egeTaskNumber: 4,
      tier: "bank",
    },
    // --- Навык 2: Несколько испытаний подряд ---
    {
      id: stableId("p"),
      skillId: skProbMultiTrial,
      text: "В случайном эксперименте бросают две игральные кости. Найдите вероятность того, что в сумме выпадет 8 очков. Результат округлите до сотых.",
      answerType: "NUMBER",
      correctAnswer: "0.14",
      keyFormula: "n·n=n²",
      hints: [
        "Всего исходов при двух бросках кубика: 6·6=36.",
        "Перечислите все пары, дающие в сумме 8: (2,6),(3,5),(4,4),(5,3),(6,2) — их пять.",
      ],
      explanation: "Всего исходов 36, подходящих 5 (2+6,3+5,4+4,5+3,6+2). P=5/36≈0,14.",
      difficulty: 2,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbMultiTrial,
      text: "Монетку бросили 3 раза. Какова вероятность того, что решка выпала не менее 2 раз?",
      answerType: "NUMBER",
      correctAnswer: "0.5",
      hints: [
        "Всего исходов при трёх бросках монеты: 2·2·2=8. Выпишите их все.",
        "Подходят исходы, где решка встречается 2 или 3 раза: ОРР, РОР, РРО, РРР — их четыре.",
      ],
      explanation: "Всего исходов 8, подходящих 4 (ОРР,РОР,РРО,РРР). P=4/8=0,5.",
      difficulty: 2,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbMultiTrial,
      text: "Монетку бросают три раза. Найдите вероятность того, что выпадет три орла подряд.",
      answerType: "NUMBER",
      correctAnswer: "0.125",
      hints: ["Вероятность каждого отдельного орла — 1/2. Три независимых броска — вероятности перемножаются."],
      explanation: "P=(1/2)³=1/8=0,125.",
      difficulty: 1,
      egeTaskNumber: 4,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbMultiTrial,
      text: "Игральный кубик бросают дважды. Какова вероятность того, что сумма выпавших очков будет больше 3? Результат округлите до сотых.",
      answerType: "NUMBER",
      correctAnswer: "0.92",
      hints: [
        "Проще найти вероятность ПРОТИВОПОЛОЖНОГО события — сумма не больше 3 — и вычесть из 1.",
        "Сумма ≤3 получается только в исходах (1,1),(1,2),(2,1) — их три из 36.",
      ],
      explanation: "Не подходят 3 исхода из 36: (1,1),(1,2),(2,1). P=(36−3)/36=33/36≈0,92.",
      difficulty: 2,
      egeTaskNumber: 4,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbMultiTrial,
      text: "Игральный кубик бросают два раза. Во сколько раз вероятность события «выпадет разное количество очков» больше вероятности события «выпадет одинаковое количество очков»?",
      answerType: "NUMBER",
      correctAnswer: "5",
      hints: [
        "Исходов с одинаковыми числами всего 6 (1,1),(2,2)...(6,6) — остальные 30 дают разные числа.",
      ],
      explanation: "Одинаковых исходов 6, разных 30. Отношение: 30/6=5.",
      difficulty: 2,
      egeTaskNumber: 4,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbClassic,
      text: "Конкурс исполнителей проводится в 4 дня. Всего заявлено 25 выступлений: по одному от каждой страны. В первый день запланировано 13 выступлений, остальные распределены поровну между оставшимися тремя днями. Порядок выступлений определяется жеребьёвкой. Какова вероятность, что выступление исполнителя из России состоится в последний день конкурса?",
      answerType: "NUMBER",
      correctAnswer: "0.16",
      hints: [
        "Сначала найдите, сколько выступлений приходится на последний (как и на любой из трёх оставшихся) день: (25−13)/3.",
      ],
      explanation: "В каждый из трёх оставшихся дней: (25−13)/3=4 выступления. P=4/25=0,16.",
      difficulty: 2,
      egeTaskNumber: 4,
      tier: "bank",
    },
    // --- Навык 3: Несовместные события. Сумма вероятностей ---
    {
      id: stableId("p"),
      skillId: skProbSumRule,
      text: "В торговом центре два одинаковых автомата продают кофе. Вероятность того, что к концу дня в автомате закончится кофе, равна 0,25. Вероятность того, что кофе закончится в обоих автоматах, равна 0,1. Найдите вероятность того, что к концу дня кофе останется в обоих автоматах.",
      answerType: "NUMBER",
      correctAnswer: "0.6",
      hints: [
        "Обозначьте 4 исхода: (закончился,закончился), (закончился,остался), (остался,закончился), (остался,остался).",
        "Раз автоматы одинаковые, P(закончился в 1-м)=P(закончился во 2-м)=0,25 — из этого найдите вероятность каждого смешанного исхода, а затем вычтите из 1 сумму трёх остальных.",
      ],
      explanation: "P(закончился в одном, остался в другом)=0,25−0,1=0,15 для каждого из двух таких исходов. P(остался в обоих)=1−0,1−0,15−0,15=0,6.",
      difficulty: 3,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbSumRule,
      text: "Вероятность того, что на тестировании по физике учащийся К. верно решит больше 9 задач, равна 0,79. Вероятность того, что К. верно решит больше 8 задач, равна 0,85. Найдите вероятность того, что К. верно решит ровно 9 задач.",
      answerType: "NUMBER",
      correctAnswer: "0.06",
      hints: [
        "«Больше 8 задач» = «ровно 9» + «больше 9» (несовместные события — отметьте на числовой прямой).",
        "P(ровно 9)=P(больше 8)−P(больше 9).",
      ],
      explanation: "P(ровно 9)=0,85−0,79=0,06.",
      difficulty: 1,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbSumRule,
      text: "При выпечке хлеба производится контрольное взвешивание свежей буханки. Известно, что вероятность того, что масса окажется меньше, чем 810 г, равна 0,96. Вероятность того, что масса окажется больше, чем 790 г, равна 0,93. Найдите вероятность того, что масса буханки больше, чем 790 г, но меньше, чем 810 г.",
      answerType: "NUMBER",
      correctAnswer: "0.89",
      hints: [
        "Отметьте обе вероятности на числовой прямой массы: «меньше 810» покрывает всё слева от 810, «больше 790» — всё справа от 790.",
        "Нужный интервал (790;810) — это то, что осталось от «меньше 810», если убрать кусок «меньше 790».",
      ],
      explanation: "P(меньше 790)=1−0,93=0,07. P(790<масса<810)=0,96−0,07=0,89.",
      difficulty: 1,
      egeTaskNumber: 4,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbSumRule,
      text: "Из районного центра в деревню ежедневно ходит автобус. Вероятность того, что в понедельник в автобусе окажется меньше 21 пассажира, равна 0,83. Вероятность того, что окажется меньше 10 пассажиров, равна 0,46. Найдите вероятность того, что число пассажиров будет от 10 до 20 включительно.",
      answerType: "NUMBER",
      correctAnswer: "0.37",
      hints: [
        "Отметьте обе вероятности на числовой прямой числа пассажиров.",
        "Интервал «от 10 до 20» — это «меньше 21» без «меньше 10».",
      ],
      explanation: "P(от 10 до 20)=P(меньше 21)−P(меньше 10)=0,83−0,46=0,37.",
      difficulty: 1,
      egeTaskNumber: 4,
      tier: "bank",
    },
    // --- Навык 4: Дерево вероятностей ---
    {
      id: stableId("p"),
      skillId: skProbTree,
      text: "Ковбой Джон выигрывает в перестрелке с вероятностью 0,8, если стреляет первым, и с вероятностью 0,2, если стреляет вторым. Джон бросает монетку, чтобы решить, стрелять ли первым (вероятность 0,5). Найдите вероятность того, что Джон выиграет перестрелку.",
      answerType: "NUMBER",
      correctAnswer: "0.5",
      keyFormula: "P=P₁·P(выигрыш|1)+P₂·P(выигрыш|2)",
      hints: [
        "Постройте дерево: сначала развилка «выстрелит первым/вторым» (по 0,5 каждая), от каждой ветки — своя вероятность выигрыша.",
        "P=0,5·0,8+0,5·0,2.",
      ],
      explanation: "P=0,5·0,8+0,5·0,2=0,4+0,1=0,5.",
      difficulty: 2,
      egeTaskNumber: 5,
    },
    {
      id: stableId("p"),
      skillId: skProbTree,
      text: "Две фабрики выпускают одинаковые стёкла для автомобильных фар. Первая фабрика выпускает 35% всех стёкол, поступающих в продажу, вторая — 65%. Первая фабрика выпускает 3% бракованных стёкол, а вторая — 5%. Найдите вероятность того, что случайно купленное стекло окажется бракованным.",
      answerType: "NUMBER",
      correctAnswer: "0.042",
      keyFormula: "P=P₁·P(брак|1)+P₂·P(брак|2)",
      hints: ["Дерево: сначала «с какой фабрики стекло» (0,35 и 0,65), потом «брак/не брак» для каждой."],
      explanation: "P=0,35·0,03+0,65·0,05=0,0105+0,0325=0,042.",
      difficulty: 2,
      egeTaskNumber: 5,
    },
    {
      id: stableId("p"),
      skillId: skProbTree,
      text: "На двух линиях выпускают одинаковые лампы. Первая линия выпускает в два раза больше ламп, чем вторая, но вероятность брака на первой линии равна 0,1, а на второй — 0,04. Все лампы поступают на склад. Найдите вероятность того, что случайно выбранная лампа на складе окажется НЕ бракованной.",
      answerType: "NUMBER",
      correctAnswer: "0.92",
      hints: [
        "Пусть вторая линия выпускает x ламп, тогда первая — 2x. Доля первой линии в общем объёме: 2x/3x=2/3, второй — 1/3.",
        "P(не брак)=P(с 1-й линии)·P(не брак|1-я)+P(со 2-й линии)·P(не брак|2-я).",
      ],
      explanation: "P=(2/3)·0,9+(1/3)·0,96=0,6+0,32=0,92.",
      difficulty: 2,
      egeTaskNumber: 5,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbTree,
      text: "На двух линиях выпускают одинаковые лампы. Первая линия выпускает в три раза больше ламп, чем вторая, но вероятность брака на первой линии равна 0,1, а на второй — 0,06. Все лампы поступают на склад. Найдите вероятность того, что случайно выбранная лампа на складе окажется НЕ бракованной.",
      answerType: "NUMBER",
      correctAnswer: "0.91",
      hints: [
        "Пусть вторая линия выпускает x ламп, тогда первая — 3x. Доля первой линии в общем объёме: 3x/4x=3/4, второй — 1/4.",
        "P(не брак)=P(с 1-й линии)·P(не брак|1-я)+P(со 2-й линии)·P(не брак|2-я).",
      ],
      explanation: "P=(3/4)·0,9+(1/4)·0,94=0,675+0,235=0,91.",
      difficulty: 2,
      egeTaskNumber: 5,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbTree,
      text: "Стрелок стреляет по трём мишеням. Вероятность попадания в мишень первым выстрелом равна 0,5. Если стрелок промахнулся, он может выстрелить по мишени второй раз. Вероятность попадания в мишень вторым выстрелом равна 0,6. Найдите вероятность того, что стрелок поразит РОВНО ОДНУ мишень из трёх.",
      answerType: "NUMBER",
      correctAnswer: "0.096",
      keyFormula: "p₊=p₁+(1−p₁)·p₂",
      hints: [
        "Сначала постройте дерево для ОДНОЙ мишени: попадание с первого раза (0,5) ИЛИ промах-потом-попадание ((1−0,5)·0,6). Сложите — это p₊, полная вероятность поразить одну мишень.",
        "Дальше — из трёх мишеней ровно одна поражена: это может быть 1-я, 2-я или 3-я — три одинаковых по вероятности пути, которые нужно сложить.",
      ],
      explanation: "p₊=0,5+0,5·0,6=0,8, p₋=0,2. Один путь (поразил ровно одну): 0,8·0,2·0,2=0,032. Путей 3. P=3·0,032=0,096.",
      difficulty: 2,
      egeTaskNumber: 5,
    },
    {
      id: stableId("p"),
      skillId: skProbTree,
      text: "Стрелок стреляет по трём мишеням. Вероятность попадания в мишень первым выстрелом равна 0,4. Если стрелок промахнулся, он может выстрелить по мишени второй раз. Вероятность попадания в мишень вторым выстрелом равна 0,5. Найдите вероятность того, что стрелок поразит РОВНО ДВЕ мишени из трёх.",
      answerType: "NUMBER",
      correctAnswer: "0.441",
      keyFormula: "p₊=p₁+(1−p₁)·p₂",
      hints: [
        "Сначала найдите полную вероятность поразить ОДНУ мишень (с учётом возможного второго выстрела при промахе первым).",
        "Дальше — ровно 2 из 3 поражены, промах может быть 1-й, 2-й или 3-й мишенью — три одинаковых пути, сложите их.",
      ],
      explanation: "p₊=0,4+0,6·0,5=0,7, p₋=0,3. Один путь (поразил ровно 2): 0,7·0,7·0,3=0,147. Путей 3. P=3·0,147=0,441.",
      difficulty: 3,
      egeTaskNumber: 5,
    },
    {
      id: stableId("p"),
      skillId: skProbTree,
      text: "При артиллерийской стрельбе автоматическая система делает выстрел по цели. Если цель не уничтожена, система делает повторный выстрел. Выстрелы повторяются до тех пор, пока цель не будет уничтожена. Вероятность уничтожения цели при первом выстреле равна 0,3, а при каждом последующем — 0,9. Какое минимальное количество выстрелов потребуется, чтобы вероятность уничтожения цели была не менее 0,96?",
      answerType: "NUMBER",
      correctAnswer: "3",
      hints: [
        "Постройте дерево: 1-й выстрел — уничтожена (0,3) или нет (0,7); если нет, 2-й выстрел — уничтожена (0,9) или нет (0,1·... уже с учётом первого промаха); и так далее.",
        "Считайте накопленную вероятность «уничтожена к N-му выстрелу включительно» и сравнивайте с 0,96.",
      ],
      explanation: "P(уничтожена за 1)=0,3. P(уничтожена за ≤2)=0,3+0,7·0,9=0,93. P(уничтожена за ≤3)=0,93+0,7·0,1·0,9=0,993≥0,96 — а за ≤2 было только 0,93<0,96. Значит нужно 3 выстрела.",
      difficulty: 3,
      egeTaskNumber: 5,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbTree,
      text: "Вероятность выигрыша по одному билету лотереи равна 0,2. Найдите наименьшее число билетов N, которое нужно купить, чтобы вероятность выиграть хотя бы один раз была больше 0,5.",
      answerType: "NUMBER",
      correctAnswer: "4",
      keyFormula: "P(хотя бы 1)=1−(1−p)^N",
      hints: ["P(ни одного выигрыша за N билетов)=0,8^N.", "Переберите N=1,2,3,4... пока 1−0,8^N не превысит 0,5."],
      explanation: "N=3: 1−0,8³=1−0,512=0,488 (не хватает). N=4: 1−0,8⁴=1−0,4096=0,5904>0,5. Ответ: 4.",
      difficulty: 3,
      egeTaskNumber: 5,
      tier: "bank",
    },
    // --- Навык 5: Выбор нескольких предметов без возврата ---
    {
      id: stableId("p"),
      skillId: skProbNoReturn,
      text: "В наборе 25 фломастеров: 11 синих, 6 красных и 8 зелёных. Наугад выбирают 2 фломастера. Найдите вероятность того, что оба окажутся синим и красным (в любом порядке).",
      answerType: "NUMBER",
      correctAnswer: "0.22",
      hints: [
        "Порядок «сначала синий, потом красный» и «сначала красный, потом синий» — два разных пути, оба подходят.",
        "P=2·(11/25)·(6/24).",
      ],
      explanation: "P=2·(11/25)·(6/24)=2·66/600=132/600=0,22.",
      difficulty: 2,
      egeTaskNumber: 5,
    },
    {
      id: stableId("p"),
      skillId: skProbNoReturn,
      text: "В коробке лежат 11 синих, 6 красных и 8 зелёных фломастеров. Наугад выбирают 2 фломастера. Найдите вероятность того, что хотя бы один из них окажется зелёным. Результат округлите до сотых.",
      answerType: "NUMBER",
      correctAnswer: "0.55",
      hints: [
        "Проще всего разбить на случаи: (зелёный,незелёный)+(незелёный,зелёный)+(зелёный,зелёный) — все три пути дают «хотя бы один зелёный».",
      ],
      explanation: "P=11/25·8/24+6/25·8/24+8/25·7/24=41/75≈0,55.",
      difficulty: 3,
      egeTaskNumber: 5,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbNoReturn,
      text: "На одной полке стоит 36 блюдец: 14 синих и 22 красных. На другой полке стоит 36 чашек: 27 синих и 9 красных. Наугад берут два блюдца и две чашки. Найдите вероятность того, что из них можно будет составить две чайные пары (блюдце с чашкой), каждая из которых будет одного цвета.",
      answerType: "NUMBER",
      correctAnswer: "0.29",
      hints: [
        "Разберите по цвету двух взятых блюдец — три случая: оба синих, оба красных, одно синее и одно красное.",
        "Для каждого случая блюдец нужна СВОЯ подходящая по цвету пара чашек — посчитайте вероятность для каждого случая отдельно и сложите.",
      ],
      explanation: "P(2 синих блюдца)·P(2 синих чашки)+P(2 красных блюдца)·P(2 красных чашки)+P(разные блюдца)·P(разные чашки)=29/100=0,29.",
      difficulty: 3,
      egeTaskNumber: 5,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbNoReturn,
      text: "В верхнем ящике стола лежат вперемешку 10 белых и 15 чёрных кубиков, в нижнем — 15 белых и 10 чёрных. Аня наугад берёт 2 кубика из верхнего и кладёт их в нижний, а Оля берёт 2 кубика из нижнего и кладёт в верхний. Найдите вероятность того, что после этого количество кубиков каждого цвета в обоих ящиках не изменилось.",
      answerType: "NUMBER",
      correctAnswer: "0.355",
      hints: [
        "Есть три случая для Ани (2 белых / 2 чёрных / разные) — для КАЖДОГО из них у Оли должен получиться ЗЕРКАЛЬНЫЙ случай, иначе баланс цветов нарушится.",
      ],
      explanation: "Сумма по трём симметричным случаям: P=71/200=0,355 (перепроверено точными дробями).",
      difficulty: 3,
      egeTaskNumber: 5,
      tier: "bank",
    },
    // --- Навык 6: Рассадка и порядок ---
    {
      id: stableId("p"),
      skillId: skProbArrangement,
      text: "В классе 21 учащийся, среди них два друга — Вадим и Олег. Учащихся случайным образом разбивают на 3 равные группы. Найдите вероятность того, что Вадим и Олег окажутся в ОДНОЙ группе.",
      answerType: "NUMBER",
      correctAnswer: "0.3",
      hints: [
        "Зафиксируйте группу Вадима — там останется 6 свободных мест (из 20 оставшихся мест) в ЕГО группе, где может оказаться Олег.",
      ],
      explanation: "Свободных мест всего 20, из них 6 — в группе Вадима. P=6/20=0,3.",
      difficulty: 2,
      egeTaskNumber: 4,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbArrangement,
      text: "В классе 26 учащихся, среди них два друга — Андрей и Сергей. Учащихся случайным образом разбивают на 2 равные группы. Найдите вероятность того, что Андрей и Сергей окажутся в РАЗНЫХ группах.",
      answerType: "NUMBER",
      correctAnswer: "0.52",
      hints: [
        "Зафиксируйте группу Андрея — там остаётся 12 свободных мест из 25 оставшихся, а в другой группе — 13.",
      ],
      explanation: "Свободных мест всего 25, из них 13 — в другой группе. P=13/25=0,52.",
      difficulty: 2,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbArrangement,
      text: "В группе туристов 24 человека. Их вертолётом доставляют в труднодоступный район, перевозя по 3 человека за рейс. Порядок, в котором вертолёт перевозит туристов, случаен. Найдите вероятность того, что турист З. полетит четвёртым рейсом вертолёта.",
      answerType: "NUMBER",
      correctAnswer: "0.125",
      hints: ["В каждом рейсе одинаковое число мест — вероятность оказаться в конкретном рейсе не зависит от того, какой это по счёту рейс."],
      explanation: "Мест в одном рейсе 3, всего туристов 24. P=3/24=0,125.",
      difficulty: 2,
      egeTaskNumber: 4,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbArrangement,
      text: "В группе туристов 25 человек. Их вертолётом доставляют в труднодоступный район, перевозя по 5 человек за рейс. Порядок случаен. Найдите вероятность того, что турист Н. полетит вторым рейсом вертолёта.",
      answerType: "NUMBER",
      correctAnswer: "0.2",
      hints: ["Столько же мест в каждом рейсе — вероятность попасть в конкретный рейс одинакова для любого рейса."],
      explanation: "P=5/25=0,2.",
      difficulty: 1,
      egeTaskNumber: 4,
      tier: "bank",
    },
    // --- Навык 7: Условная вероятность и комбинаторика ---
    {
      id: stableId("p"),
      skillId: skProbConditional,
      text: "Ваня бросил игральный кубик, и у него выпало больше 2 очков. Петя бросил игральный кубик, и у него выпало меньше 6 очков. Найдите вероятность того, что у Пети выпало очков больше, чем у Вани.",
      answerType: "NUMBER",
      correctAnswer: "0.15",
      hints: [
        "Условия сужают пространство: у Вани возможны только 3,4,5,6 (4 варианта), у Пети — только 1,2,3,4,5 (5 вариантов).",
        "Переберите все 4×5=20 пар и посчитайте, в скольких Петя строго больше Вани.",
      ],
      explanation: "Подходят пары (Петя;Ваня): (5;3),(5;4),(4;3) — три из 20. P=3/20=0,15.",
      difficulty: 3,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbConditional,
      text: "Ваня бросил игральный кубик, и у него выпало больше 2 очков. Петя бросил игральный кубик, и у него выпало меньше 5 очков. Найдите вероятность того, что у Пети выпало очков МЕНЬШЕ, чем у Вани.",
      answerType: "NUMBER",
      correctAnswer: "0.8125",
      hints: [
        "У Вани возможны 3,4,5,6 (4 варианта), у Пети — 1,2,3,4 (4 варианта), всего пар 16.",
        "Проще посчитать противоположное событие — Петя ≥ Вани — таких исходов всего 3.",
      ],
      explanation: "P(Петя≥Ваня)=3/16. P(Петя<Ваня)=1−3/16=13/16=0,8125.",
      difficulty: 3,
      egeTaskNumber: 4,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skProbConditional,
      text: "Игральный кубик бросают дважды. Известно, что в сумме выпало 8 очков. Какова вероятность, что хотя бы один раз выпадала «5»?",
      answerType: "NUMBER",
      correctAnswer: "0.4",
      hints: [
        "Условие «сумма=8» сужает пространство исходов до пяти пар: (2,6),(3,5),(4,4),(5,3),(6,2).",
        "В скольких из этих пяти пар встречается число 5?",
      ],
      explanation: "Из 5 подходящих по условию пар «5» встречается в 2 — (3,5) и (5,3). P=2/5=0,4.",
      difficulty: 2,
      egeTaskNumber: 4,
    },
    {
      id: stableId("p"),
      skillId: skProbConditional,
      text: "Монету бросают 10 раз. Во сколько раз вероятность того, что орёл выпадет ровно 4 раза, больше вероятности того, что орёл выпадет ровно 3 раза?",
      answerType: "NUMBER",
      correctAnswer: "1.75",
      keyFormula: "C(n,k)=n!/(k!(n−k)!)",
      hints: [
        "Вероятности отличаются только количеством способов выбрать, какие именно броски — орлы: C(10,4) против C(10,3).",
        "Отношение вероятностей равно отношению C(10,4)/C(10,3), степени (1/2) сокращаются.",
      ],
      explanation: "C(10,4)=210, C(10,3)=120. Отношение: 210/120=1,75.",
      difficulty: 3,
      egeTaskNumber: 4,
      tier: "bank",
    }
  );

  // ---------------- Модуль: Тригонометрия ----------------
  // Контент подготовлен на основе реальных конспектов преподавателя —
  // единая тема от простых тождеств/выражений до уравнений (элементарные →
  // с tg/ctg → комбинированные → однородные), как и договаривались. Первый
  // навык — вычисление тригонометрических выражений (формулы приведения,
  // двойной угол, чётность/нечётность, ОТТ). Все ответы перепроверены
  // численно через Python (math.sin/cos в радианах), не переписаны из PDF
  // на веру.
  const trigTopicId = stableId("t");
  db.topics.push({ id: trigTopicId, order: 3, title: "Тригонометрия" });

  const chTrigMain = stableId("s");
  db.subtopics.push({ id: chTrigMain, topicId: trigTopicId, order: 1, title: "Тригонометрия" });

  const skTrigIdentities = stableId("sk");
  const skTrigElementary = stableId("sk");
  const skTrigMethods = stableId("sk");
  const skTrigHomogeneous = stableId("sk");
  const skTrigPastYears = stableId("sk");


  db.skills.push({
    id: skTrigIdentities,
    subtopicId: chTrigMain,
    order: 1,
    title: "Тригонометрические тождества и выражения",
    theoryCards: [
      {
        title: "Единичная окружность и знаки функций",
        body: "На единичной окружности cos α — абсцисса точки, sin α — её ордината. Функции периодичны: sin и cos не меняются при добавлении 2π, а tg и ctg — при добавлении π. Знаки по четвертям: I — все положительны, II — только sin, III — только tg и ctg, IV — только cos.",
      },
      {
        title: "Формулы приведения — алгоритм",
        body: "Выделите в аргументе часть, кратную π/2: угол вида (? + α). Если «?» попадает в точку Да (вертикальная ось, ±π/2, 3π/2) — функция меняется на кофункцию (sin↔cos, tg↔ctg). Если в точку Нет (горизонтальная ось, 0, π) — функция сохраняется. Знак результата определяется по четверти, в которую попадает ИСХОДНЫЙ угол с исходной функцией.",
      },
      {
        title: "Основное тригонометрическое тождество",
        formula: "sin²α + cos²α = 1",
        body: "Следует из теоремы Пифагора для прямоугольного треугольника, вписанного в единичную окружность. Если разделить обе части на cos²α, получается полезное следствие: tg²α+1=1/cos²α.",
      },
      {
        title: "Формулы двойного угла",
        formula: "sin 2α = 2 sin α · cos α;  cos 2α = 2cos²α − 1 = 1 − 2sin²α",
        body: "Одна из самых часто используемых пар формул. Обратите внимание — у косинуса двойного угла есть три равносильные записи, выбирайте ту, что удобнее убирает лишнее слагаемое в конкретной задаче.",
      },
    ],
  });

  db.skills.push({
    id: skTrigElementary,
    subtopicId: chTrigMain,
    order: 2,
    title: "Элементарные тригонометрические уравнения",
    theoryCards: [
      {
        title: "Уравнение sin x = a",
        formula: "x = arcsin a + 2πk;  x = π − arcsin a + 2πk,  k∈Z",
        body: "Решений нет, если a>1 или a<−1. При a=1: x=π/2+2πk. При a=−1: x=−π/2+2πk. При a=0: x=πk. В остальных случаях (−1<a<1) — две серии по формуле выше, где arcsin a ∈ [−π/2; π/2].",
      },
      {
        title: "Уравнение cos x = a",
        formula: "x = ±arccos a + 2πk,  k∈Z",
        body: "Решений нет, если a>1 или a<−1. При a=1: x=2πk. При a=−1: x=π+2πk. При a=0: x=π/2+πk. В остальных случаях — одна формула с ±, где arccos a ∈ [0; π].",
      },
      {
        title: "Уравнения tg x = a и ctg x = a",
        formula: "x = arctg a + πk;  x = arcctg a + πk,  k∈Z",
        body: "В отличие от sin/cos, здесь нет ограничений на a — решение существует всегда, и это ровно ОДНА серия (не две), потому что период tg и ctg равен π, а не 2π. arctg a ∈ (−π/2; π/2), arcctg a ∈ (0; π).",
      },
      {
        title: "Отбор корней по условию (наибольший/наименьший)",
        body: "Когда просят найти наибольший отрицательный или наименьший положительный корень — сначала решите уравнение (получите формулу вида x=a+bk), затем подставляйте целые k подряд (например, k=−2,−1,0,1,2) и стройте табличку значений x, пока не увидите нужный корень. Направление перебора: чтобы найти наименьший ПОЛОЖИТЕЛЬНЫЙ, увеличивайте k от отрицательных; чтобы найти наибольший ОТРИЦАТЕЛЬНЫЙ — так же, но следите, где знак x меняется.",
      },
    ],
  });

  db.skills.push({
    id: skTrigMethods,
    subtopicId: chTrigMain,
    order: 3,
    title: "Методы решения тригонометрических уравнений",
    theoryCards: [
      {
        title: "Разложение на множители",
        body: "Самый частый метод: перенести всё в одну сторону, сгруппировать слагаемые и вынести общий множитель за скобки, чтобы получить произведение, равное нулю. Например, 2cos2x·sinx − √3·sinx + 2cos2x − √3 = (sinx+1)(2cos2x−√3). Произведение равно нулю, когда равен нулю хотя бы один из множителей — уравнение распадается на два более простых.",
      },
      {
        title: "Замена переменной (t=sin x или t=cos x)",
        body: "Если уравнение сводится к квадратному (или кубическому) относительно sin x или cos x — введите замену t=sinx (или t=cosx), решите обычное алгебраическое уравнение относительно t, а затем сделайте ОБРАТНУЮ замену. Важно: не забудьте проверить, что найденные корни t попадают в область значений [−1;1] — иначе такой корень t не подходит.",
      },
      {
        title: "Отбор корней на отрезке — метод двойного неравенства",
        body: "Когда серия корней имеет вид x=a+2πk (или x=a+πk), а нужно найти корни на конкретном отрезке [p;q] — подставьте формулу корня в двойное неравенство p⩽a+2πk⩽q и решите его относительно k. Целые k, удовлетворяющие неравенству, дадут все подходящие корни.",
      },
      {
        title: "Отбор корней на отрезке — через окружность",
        body: "Альтернатива двойному неравенству: отметьте все серии корней на тригонометрической окружности, а затем «прокрутите» окружность нужное число полных оборотов (±2πm), чтобы совместить нужный отрезок с одним оборотом окружности [0;2π] или похожим удобным диапазоном — так визуально виднее, какие точки подходят.",
      },
    ],
  });

  db.skills.push({
    id: skTrigHomogeneous,
    subtopicId: chTrigMain,
    order: 4,
    title: "Однородные и неоднородные уравнения",
    theoryCards: [
      {
        title: "Однородные уравнения первой степени",
        formula: "a·sinx + b·cosx = 0  ⟹  tgx = −b/a",
        body: "Делим обе части на cosx (доказано, что cosx=0 не может быть решением — иначе из уравнения следует sinx=0, а sin²x+cos²x=0≠1, противоречие). После деления получаем элементарное уравнение относительно tgx.",
      },
      {
        title: "Однородные уравнения второй степени",
        formula: "a·sin²x + b·sinx·cosx + c·cos²x = 0",
        body: "Аналогично делим на cos²x (тем же рассуждением от противного cosx=0 не подходит). Получаем КВАДРАТНОЕ уравнение относительно tgx: a·tg²x+b·tgx+c=0. Решается заменой t=tgx.",
      },
      {
        title: "Неоднородные уравнения второй степени",
        formula: "a·sin²x+b·sinx·cosx+c·cos²x=d",
        body: "Правая часть d≠0 — уравнение НЕ однородное. Хитрость: распишите d как d·1=d·(sin²x+cos²x) и перенесите в левую часть — получится однородное уравнение второй степени с коэффициентами (a−d), b, (c−d), которое уже умеем решать.",
      },
      {
        title: "Метод вспомогательного угла",
        formula: "a·sinx+b·cosx=c  ⟹  делим на √(a²+b²)",
        body: "Для уравнений вида a·sinx+b·cosx=c делим обе части на √(a²+b²) — коэффициенты перед sinx и cosx станут косинусом и синусом некоторого «вспомогательного угла» φ, и левая часть свернётся по формуле синуса суммы: sin(x+φ)=c/√(a²+b²). Дальше — обычное элементарное уравнение.",
      },
    ],
  });

  db.skills.push({
    id: skTrigPastYears,
    subtopicId: chTrigMain,
    order: 5,
    title: "Задачи прошлых лет (ЕГЭ)",
    theoryCards: [
      {
        title: "ОДЗ — не забывайте проверять",
        body: "Если в уравнении встречается деление на выражение с x, чётный корень или логарифм от выражения с x — сначала запишите ОДЗ (например, знаменатель≠0, подкоренное⩾0, аргумент логарифма>0). После нахождения корней уравнения проверьте каждую серию на соответствие ОДЗ — часть корней может отсеяться.",
      },
      {
        title: "Комбинация приёмов в одной задаче",
        body: "Реальные задачи №13 часто требуют СРАЗУ несколько техник: сначала привести всё к одной функции через формулы приведения/тождества, затем разложить на множители или сделать замену переменной, и только потом отбирать корни на отрезке. Не пугайтесь длины решения — двигайтесь по шагам, которые уже отработаны в предыдущих навыках.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 18·sin 23°/sin 337°.",
      answerType: "NUMBER",
      correctAnswer: "-18",
      keyFormula: "sin(360°−x)=−sin x",
      hints: [
        "337°=360°−23° — сведите sin 337° к sin 23° через формулу приведения.",
        "sin(360°−23°)=−sin 23° — знаменатель и числитель сократятся, останется знак минус.",
      ],
      explanation: "sin 337°=sin(360°−23°)=−sin 23°. Тогда 18sin23°/sin337°=18sin23°/(−sin23°)=−18.",
      difficulty: 2,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 8·cos 9°·sin 9°/cos 72°.",
      answerType: "NUMBER",
      correctAnswer: "4",
      keyFormula: "sin2α=2sinα·cosα",
      hints: [
        "В числителе узнайте формулу синуса двойного угла: 2cos9°sin9°=sin18°.",
        "72°=90°−18° — сведите cos72° к sin18° через формулу приведения, они сократятся.",
      ],
      explanation: "8cos9°sin9°=4·(2cos9°sin9°)=4sin18°. cos72°=cos(90°−18°)=sin18°. Итог: 4sin18°/sin18°=4.",
      difficulty: 2,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 7·tg 13°·tg 77°.",
      answerType: "NUMBER",
      correctAnswer: "7",
      keyFormula: "tgα·ctgα=1",
      hints: [
        "77°=90°−13° — сведите tg77° к ctg13° через формулу приведения.",
        "Произведение tg13°·ctg13° равно 1 по определению котангенса.",
      ],
      explanation: "tg77°=tg(90°−13°)=ctg13°. Тогда 7tg13°·ctg13°=7·1=7.",
      difficulty: 1,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения tg 1°·tg 3°·tg 5°·…·tg 85°·tg 87°·tg 89°.",
      answerType: "NUMBER",
      correctAnswer: "1",
      hints: [
        "Разбейте множители на пары, дающие в сумме 90°: tg1° и tg89°, tg3° и tg87°, и так далее.",
        "Каждая такая пара — это tgα·ctgα=1 (по формуле приведения tg(90°−α)=ctgα). Останется непарным только tg45°=1.",
      ],
      explanation: "Все пары (tg1°·tg89°), (tg3°·tg87°) и т.д. равны 1, непарный tg45°=1. Итог: 1.",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 12/(sin²37° + sin²127°).",
      answerType: "NUMBER",
      correctAnswer: "12",
      keyFormula: "sin²α+cos²α=1",
      hints: [
        "127°=90°+37° — сведите sin127° к cos37° через формулу приведения.",
        "После этого в знаменателе получится основное тригонометрическое тождество.",
      ],
      explanation: "sin127°=sin(90°+37°)=cos37°. Знаменатель: sin²37°+cos²37°=1. Итог: 12/1=12.",
      difficulty: 2,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите tg 2α, если cos α=1/√10 и 3π/2<α<2π.",
      answerType: "NUMBER",
      correctAnswer: "0.75",
      keyFormula: "tg2α=2sinαcosα/(2cos²α−1)",
      hints: [
        "Угол в четвёртой четверти — sin α там отрицателен. Найдите sinα через ОТТ, не забыв про знак.",
        "Подставьте sinα и cosα в формулу тангенса двойного угла через синус/косинус.",
      ],
      explanation: "sinα=−√(1−1/10)=−3/√10 (4-я четверть). tg2α=(2·(−3/√10)·(1/√10))/(2/10−1)=(−6/10)/(−8/10)=0,75.",
      difficulty: 3,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения (14cos α − 4sin α − 7)/(−21cos α + 6sin α + 4), если tg α=3,5.",
      answerType: "NUMBER",
      correctAnswer: "-1.75",
      hints: [
        "Из tgα=3,5 выразите sinα через cosα: sinα=3,5·cosα.",
        "Подставьте это выражение вместо sinα в числитель и знаменатель — cosα сократится.",
      ],
      explanation: "sinα=3,5cosα. Числитель: 14cosα−14cosα−7=−7. Знаменатель: −21cosα+21cosα+4=4. Итог: −7/4=−1,75.",
      difficulty: 2,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 7·sin 75°·cos 75°.",
      answerType: "NUMBER",
      correctAnswer: "1.75",
      keyFormula: "sin2α=2sinαcosα",
      hints: ["Домножьте и разделите на 2, чтобы получить формулу синуса двойного угла.", "150°=180°−30° — сведите через формулу приведения к табличному значению."],
      explanation: "7sin75°cos75°=(7/2)·2sin75°cos75°=(7/2)sin150°=(7/2)sin30°=(7/2)(1/2)=1,75.",
      difficulty: 2,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения √48 − √192·sin²(19π/12).",
      answerType: "NUMBER",
      correctAnswer: "-6",
      hints: [
        "√192=2√48 — вынесите общий множитель, чтобы получить вид a(1−2sin²x).",
        "1−2sin²x — это как раз формула косинуса двойного угла cos2x.",
      ],
      explanation: "√48−2√48sin²(19π/12)=√48(1−2sin²(19π/12))=√48·cos(19π/6). По приведению cos(19π/6)=cos(3π+π/6)=−cos(π/6)=−√3/2. Итог: 4√3·(−√3/2)=−6.",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 4√2·cos²(15π/8) − 2√2.",
      answerType: "NUMBER",
      correctAnswer: "2",
      keyFormula: "2cos²α−1=cos2α",
      hints: ["Вынесите 2√2 за скобки, чтобы получить вид 2√2·(2cos²x−1).", "Это в точности формула косинуса двойного угла."],
      explanation: "2√2(2cos²(15π/8)−1)=2√2·cos(15π/4)=2√2·cos(−π/4)=2√2·(√2/2)=2.",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 7√2·sin(15π/8)·cos(15π/8).",
      answerType: "NUMBER",
      correctAnswer: "-3.5",
      keyFormula: "sin2α=2sinαcosα",
      hints: ["Домножьте и разделите на 2, чтобы получить синус двойного угла.", "15π/4 сведите к табличному углу через период 2π."],
      explanation: "(7√2/2)·2sin(15π/8)cos(15π/8)=(7√2/2)sin(15π/4)=(7√2/2)sin(−π/4)=(7√2/2)(−√2/2)=−3,5.",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения √3·cos²(5π/12) − √3·sin²(5π/12).",
      answerType: "NUMBER",
      correctAnswer: "-1.5",
      keyFormula: "cos²α−sin²α=cos2α",
      hints: ["Вынесите √3 за скобки — в скобках получится cos²x−sin²x.", "Это одна из форм записи косинуса двойного угла."],
      explanation: "√3(cos²(5π/12)−sin²(5π/12))=√3cos(5π/6)=√3·(−√3/2)=−1,5.",
      difficulty: 2,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 24√2·cos(−π/3)·sin(−π/4).",
      answerType: "NUMBER",
      correctAnswer: "-12",
      hints: ["cos — чётная функция (знак минуса в аргументе не влияет), sin — нечётная (знак минуса выходит наружу)."],
      explanation: "cos(−π/3)=cos(π/3)=1/2. sin(−π/4)=−sin(π/4)=−√2/2. Итог: 24√2·(1/2)·(−√2/2)=−12.",
      difficulty: 2,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения −18√2·sin(−135°).",
      answerType: "NUMBER",
      correctAnswer: "18",
      hints: ["sin — нечётная функция: sin(−135°)=−sin(135°).", "135°=180°−45° — табличное значение через формулу приведения."],
      explanation: "sin(−135°)=−sin135°=−(√2/2). Итог: −18√2·(−√2/2)=18.",
      difficulty: 2,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 5·sin 61°/sin 299°.",
      answerType: "NUMBER",
      correctAnswer: "-5",
      hints: ["299°=360°−61° — сведите через формулу приведения к sin61°."],
      explanation: "sin299°=sin(360°−61°)=−sin61°. Итог: 5sin61°/(−sin61°)=−5.",
      difficulty: 1,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 7cos(π+β) − 2sin(π/2+β), если cos β=−1/3.",
      answerType: "NUMBER",
      correctAnswer: "3",
      hints: [
        "Приведите оба слагаемых к cosβ через формулы приведения: cos(π+β)=−cosβ, sin(π/2+β)=cosβ.",
      ],
      explanation: "7·(−cosβ)−2·cosβ=−9cosβ=−9·(−1/3)=3.",
      difficulty: 2,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 5·sin 74°/(cos 37°·cos 53°).",
      answerType: "NUMBER",
      correctAnswer: "10",
      hints: [
        "74°=2·37° — в числителе используйте синус двойного угла.",
        "53°=90°−37° — сведите cos53° к sin37° через формулу приведения.",
      ],
      explanation: "sin74°=2sin37°cos37°. cos53°=sin37°. Итог: 5·2sin37°cos37°/(cos37°·sin37°)=10.",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigIdentities,
      text: "Найдите значение выражения 3cos α, если sin α=−2√2/3 и α∈(3π/2; 2π).",
      answerType: "NUMBER",
      correctAnswer: "1",
      keyFormula: "sin²α+cos²α=1",
      hints: ["Угол в четвёртой четверти — cosα там положителен.", "Найдите cosα через ОТТ, зная sinα."],
      explanation: "cosα=√(1−8/9)=√(1/9)=1/3 (положителен в 4-й четверти). Итог: 3·(1/3)=1.",
      difficulty: 2,
      egeTaskNumber: 7,
      tier: "bank",
    },
    // --- Навык 2: Элементарные тригонометрические уравнения ---
    {
      id: stableId("p"),
      skillId: skTrigElementary,
      diagram: { kind: "unitCircle" },
      text: "Найдите наибольший отрицательный корень уравнения cos(π(x−7)/3)=1/2.",
      answerType: "NUMBER",
      correctAnswer: "-4",
      keyFormula: "cos t=a ⟺ t=±arccos a+2πk",
      hints: [
        "Решите уравнение относительно t=π(x−7)/3: t=±π/3+2πk, затем выразите x.",
        "Получатся 2 серии корней x=8+6k и x=6+6k. Постройте таблицу для нескольких целых k в каждой серии и найдите наибольший из отрицательных.",
      ],
      explanation: "π(x−7)/3=±π/3+2πk ⟹ x=8+6k или x=6+6k. Перебирая k, среди отрицательных значений в обеих сериях наибольшее — x=−4 (при k=−2 в серии x=8+6k).",
      difficulty: 3,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skTrigElementary,
      diagram: { kind: "unitCircle" },
      text: "Найдите наименьший положительный корень уравнения cos(π(x−7)/3)=1/2.",
      answerType: "NUMBER",
      correctAnswer: "2",
      hints: ["То же уравнение, что и для наибольшего отрицательного корня — переберите те же две серии, но в другую сторону."],
      explanation: "Серии x=8+6k и x=6+6k. Среди положительных значений наименьшее — x=2 (при k=−1 в серии x=8+6k).",
      difficulty: 3,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skTrigElementary,
      diagram: { kind: "unitCircle" },
      text: "Найдите наименьший положительный корень уравнения sin(π(x−3)/12)=−√3/2.",
      answerType: "NUMBER",
      correctAnswer: "19",
      keyFormula: "sin t=a ⟺ t=arcsin a+2πk или t=π−arcsin a+2πk",
      hints: [
        "Решите относительно t=π(x−3)/12: получите 2 серии для t, затем выразите x.",
        "Получатся серии x=−1+24k и x=−5+24k. Постройте таблицу и найдите наименьший положительный корень.",
      ],
      explanation: "Серии решений: x=−1+24k и x=−5+24k. Наименьший положительный получается при k=1 в серии x=−5+24k: x=19.",
      difficulty: 3,
      egeTaskNumber: 6,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigElementary,
      diagram: { kind: "unitCircle" },
      text: "Найдите наибольший отрицательный корень уравнения tg(πx/4)=1.",
      answerType: "NUMBER",
      correctAnswer: "-3",
      keyFormula: "tg t=a ⟺ t=arctg a+πk",
      hints: ["πx/4=π/4+πk ⟹ x=1+4k. Постройте таблицу для нескольких целых k."],
      explanation: "x=1+4k. При k=−1: x=−3 (наибольший из отрицательных); при k=0: x=1 (уже положительный).",
      difficulty: 2,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skTrigElementary,
      diagram: { kind: "unitCircle" },
      text: "Найдите наибольший отрицательный корень уравнения tg(πx/4)=−1.",
      answerType: "NUMBER",
      correctAnswer: "-1",
      hints: ["πx/4=−π/4+πk ⟹ x=−1+4k. Постройте таблицу для нескольких целых k."],
      explanation: "x=−1+4k. При k=0: x=−1 (наибольший из отрицательных); при k=1: x=3 (уже положительный).",
      difficulty: 2,
      egeTaskNumber: 6,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigElementary,
      diagram: { kind: "unitCircle" },
      text: "Найдите наибольший отрицательный корень уравнения tg(π(x−1)/6)=√3.",
      answerType: "NUMBER",
      correctAnswer: "-3",
      hints: ["π(x−1)/6=π/3+πk ⟹ x=3+6k. Постройте таблицу для нескольких целых k."],
      explanation: "x=3+6k. При k=−1: x=−3 (наибольший из отрицательных); при k=0: x=3 (уже положительный).",
      difficulty: 3,
      egeTaskNumber: 6,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigElementary,
      diagram: { kind: "unitCircle" },
      text: "Найдите наибольший отрицательный корень уравнения ctg(πx/3)=−1/√3.",
      answerType: "NUMBER",
      correctAnswer: "-1",
      keyFormula: "ctg t=a ⟺ t=arcctg a+πk",
      hints: ["πx/3=2π/3+πk ⟹ x=2+3k. Постройте таблицу для нескольких целых k."],
      explanation: "x=2+3k. При k=−1: x=−1 (наибольший из отрицательных); при k=0: x=2 (уже положительный).",
      difficulty: 3,
      egeTaskNumber: 6,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigElementary,
      diagram: { kind: "unitCircle" },
      text: "Найдите наибольший корень уравнения ctg(π/x)=0.",
      answerType: "NUMBER",
      correctAnswer: "2",
      hints: [
        "π/x=π/2+πk ⟹ x=2/(1+2k). Так как ищем наибольший корень, рассматривайте только неотрицательные k.",
        "Проверьте, как ведёт себя дробь 2/(1+2k) при увеличении k — растёт или убывает?",
      ],
      explanation: "x=2/(1+2k). При увеличении неотрицательного k дробь убывает, значит наибольшее значение при k=0: x=2.",
      difficulty: 3,
      egeTaskNumber: 6,
      tier: "bank",
    },
    // --- Навык 3: Методы решения (развёрнутые задачи, формат №13 ЕГЭ) ---
    {
      id: stableId("p"),
      skillId: skTrigMethods,
      text: "а) Решите уравнение 2sin²(3π/2+x)=√3cos x. б) Найдите все его корни, принадлежащие промежутку [−7π/2; −2π].",
      answerType: "DETAILED",
      correctAnswer:
        "а) По формуле приведения sin(3π/2+x)=−cosx, значит 2cos²x=√3cosx, то есть cosx(2cosx−√3)=0. Отсюда cosx=0 (x=π/2+πk) или cosx=√3/2 (x=±π/6+2πk), k∈Z. б) Отбором на отрезке [−7π/2;−2π] подходят x=−7π/2, −5π/2, −13π/6.",
      keyFormula: "cosx(2cosx−√3)=0",
      hints: [
        "Приведите sin(3π/2+x) к −cosx по формуле приведения — уравнение станет квадратным относительно cosx.",
        "Вынесите общий множитель cosx за скобки, чтобы разложить на произведение двух множителей.",
        "Для отбора на отрезке — отметьте обе серии корней на окружности и сдвиньте отрезок на удобное число оборотов 2π.",
      ],
      explanation:
        "cosx(2cosx−√3)=0 ⟹ cosx=0 или cosx=√3/2. Серии: x=π/2+πk и x=±π/6+2πk. На отрезке [−7π/2;−2π] подходят −7π/2, −5π/2, −13π/6.",
      difficulty: 3,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skTrigMethods,
      text: "а) Решите уравнение 2cos2x·sinx − √3sinx + 2cos2x = √3. б) Найдите все его корни, принадлежащие промежутку [−π/2; 3π/2).",
      answerType: "DETAILED",
      correctAnswer:
        "а) Группировкой: 2cos2x(sinx+1)−√3(sinx+1)=0 ⟹ (sinx+1)(2cos2x−√3)=0. Отсюда sinx=−1 (x=−π/2+2πk) или cos2x=√3/2 (x=±π/12+πn), k,n∈Z. б) На промежутке [−π/2;3π/2) подходят x=−π/2, −π/12, π/12, 11π/12, 13π/12.",
      keyFormula: "(sinx+1)(2cos2x−√3)=0",
      hints: [
        "Перенесите всё в одну сторону и сгруппируйте пары слагаемых так, чтобы вынести общий множитель — сначала (2cos2x·sinx−√3sinx), потом (2cos2x−√3).",
        "После группировки получится произведение двух скобок, равное нулю.",
        "Для отбора корня x=−π/2+2πk используйте двойное неравенство — единственное подходящее k=0.",
      ],
      explanation:
        "(sinx+1)(2cos2x−√3)=0 ⟹ sinx=−1 или cos2x=√3/2. Серии: x=−π/2+2πk и x=±π/12+πn. На [−π/2;3π/2) подходят −π/2, −π/12, π/12, 11π/12, 13π/12.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigMethods,
      text: "а) Решите уравнение 2sin³x + sinx + 2√2 = 2√2cos²x. б) Укажите корни этого уравнения, принадлежащие отрезку [−5π/2; −π].",
      answerType: "DETAILED",
      correctAnswer:
        "а) Замените cos²x=1−sin²x: получится 2sin³x+2√2sin²x+sinx=0, то есть sinx(√2sinx+1)²=0. Отсюда sinx=0 (x=πk) или sinx=−1/√2 (x=−π/4+2πk или x=−3π/4+2πk), k∈Z. б) На отрезке [−5π/2;−π] подходят x=−9π/4, −2π, −π.",
      keyFormula: "sinx(√2sinx+1)²=0",
      hints: [
        "Замените cos²x через 1−sin²x, чтобы получить уравнение только с sinx.",
        "Вынесите sinx за скобку — оставшееся выражение свернётся в полный квадрат (√2sinx+1)².",
        "Полный квадрат равен нулю ровно при одном значении — не пропустите, что это даёт только ОДНУ серию, а не две.",
      ],
      explanation:
        "sinx(√2sinx+1)²=0 ⟹ sinx=0 или sinx=−1/√2. Серии: x=πk; x=−π/4+2πk; x=−3π/4+2πk. На [−5π/2;−π] подходят −9π/4, −2π, −π.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigMethods,
      text: "а) Решите уравнение 2sin²x + √2sinx − 2 = 0. б) Найдите все корни этого уравнения, принадлежащие промежутку (−π; π).",
      answerType: "DETAILED",
      correctAnswer:
        "а) Замена t=sinx, t∈[−1;1]: 2t²+√2t−2=0, дискриминант 18, корни t=√2/2 и t=−√2 (не подходит, вне [−1;1]). Значит sinx=√2/2, x=π/4+2πk или x=3π/4+2πk, k∈Z. б) На (−π;π) подходят x=π/4, x=3π/4.",
      keyFormula: "t=sinx, 2t²+√2t−2=0",
      hints: [
        "Введите замену t=sinx и решите обычное квадратное уравнение относительно t.",
        "Обязательно проверьте оба корня квадратного уравнения на принадлежность отрезку [−1;1] — один из них может не подойти.",
      ],
      explanation:
        "t=sinx: 2t²+√2t−2=0 ⟹ t=√2/2 (подходит) или t=−√2 (не подходит, <−1). sinx=√2/2 ⟹ x=π/4+2πk или x=3π/4+2πk. На (−π;π): x=π/4, x=3π/4.",
      difficulty: 3,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skTrigMethods,
      text: "а) Решите уравнение sin²x − 5cos(x−π/2) − 6 = 0. б) Найдите все корни этого уравнения, принадлежащие промежутку (−π; 3π).",
      answerType: "DETAILED",
      correctAnswer:
        "а) По формуле приведения cos(x−π/2)=sinx, уравнение примет вид sin²x−5sinx−6=0. Замена t=sinx: t²−5t−6=0, корни t=−1 и t=6 (не подходит). Значит sinx=−1, x=−π/2+2πk, k∈Z. б) На (−π;3π) подходят x=−π/2, x=3π/2.",
      keyFormula: "cos(x−π/2)=sinx",
      hints: [
        "Приведите cos(x−π/2) к sinx по формуле приведения — уравнение сведётся к квадратному относительно sinx.",
        "Проверьте оба корня квадратного уравнения на принадлежность [−1;1].",
      ],
      explanation:
        "cos(x−π/2)=sinx ⟹ sin²x−5sinx−6=0. t=sinx: (t+1)(t−6)=0, t=−1 (подходит) или t=6 (не подходит). sinx=−1 ⟹ x=−π/2+2πk. На (−π;3π): x=−π/2, x=3π/2.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigMethods,
      text: "а) Решите уравнение 11cos2x = 7sin(x−π/2) − 9. б) Найдите корни уравнения, принадлежащие отрезку [−π; 0].",
      answerType: "DETAILED",
      correctAnswer:
        "а) По формуле приведения sin(x−π/2)=−cosx, а cos2x=2cos²x−1. Уравнение: 22cos²x+7cosx−2=0. Замена t=cosx: корни t=−1/2 и t=2/11 (оба подходят). Значит x=±2π/3+2πk или x=±arccos(2/11)+2πk, k∈Z. б) На [−π;0] подходят x=−2π/3 и x=−arccos(2/11).",
      keyFormula: "22cos²x+7cosx−2=0",
      hints: [
        "Приведите sin(x−π/2) к −cosx, а cos2x — к 2cos²x−1 через формулы двойного угла и приведения.",
        "Получится квадратное уравнение относительно cosx — оба корня в этот раз попадут в допустимый диапазон [−1;1].",
        "Один из арккосинусов не будет табличным значением — оставьте его в ответе через arccos.",
      ],
      explanation:
        "22cos²x+7cosx−2=0 ⟹ cosx=−1/2 или cosx=2/11. Серии: x=±2π/3+2πk; x=±arccos(2/11)+2πk. На [−π;0]: x=−2π/3, x=−arccos(2/11).",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    // --- Навык 4: Однородные и неоднородные уравнения ---
    {
      id: stableId("p"),
      skillId: skTrigHomogeneous,
      text: "а) Решите уравнение sin 2x + cos 2x = 0. б) Укажите корни уравнения, принадлежащие отрезку [5π/2; 4π].",
      answerType: "DETAILED",
      correctAnswer:
        "а) Однородное уравнение первой степени относительно 2x. Делим на cos2x≠0: tg2x=−1, 2x=−π/4+πk, x=−π/8+πk/2, k∈Z. б) На отрезке [5π/2;4π] подходят x=23π/8, 27π/8, 31π/8.",
      keyFormula: "tg2x=−1",
      hints: [
        "Это однородное уравнение первой степени (только с 2x вместо x) — разделите обе части на cos2x.",
        "Получится элементарное уравнение tg2x=−1 с периодом π/2 (не 2π) — при отборе на большом отрезке аккуратно переберите несколько k.",
      ],
      explanation:
        "Деление на cos2x даёт tg2x=−1 ⟹ x=−π/8+πk/2, k∈Z. На отрезке [5π/2;4π] (перебором k=6,7,8) подходят 23π/8, 27π/8, 31π/8.",
      difficulty: 3,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skTrigHomogeneous,
      text: "а) Решите уравнение sin(πx/2) − √3·cos(πx/2) = 0. б) Найдите все его корни, принадлежащие промежутку (2; 2π).",
      answerType: "DETAILED",
      correctAnswer:
        "а) Однородное первой степени. Делим на cos(πx/2)≠0: tg(πx/2)=√3, πx/2=π/3+πk, x=2/3+2k, k∈Z. б) На промежутке (2;2π) подходят x=2⅔ и x=4⅔.",
      keyFormula: "tg(πx/2)=√3",
      hints: [
        "Разделите обе части на cos(πx/2) — получится элементарное уравнение относительно tg(πx/2).",
        "После нахождения серии x=2/3+2k подставляйте целые k и сравнивайте получившиеся числа с границами (2;2π≈6,28) — здесь границы НЕ содержат π в чистом виде, придётся сравнивать десятичные приближения.",
      ],
      explanation:
        "tg(πx/2)=√3 ⟹ x=2/3+2k, k∈Z. Перебором: k=1 даёт x=2⅔ (подходит), k=2 даёт x=4⅔ (подходит), k=0 и k=3 — вне промежутка.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigHomogeneous,
      text: "а) Решите уравнение sin²3x = 10sin3x·cos3x − 9cos²3x. б) Найдите все его корни, принадлежащие отрезку [−π/6; π/6].",
      answerType: "DETAILED",
      correctAnswer:
        "а) Перенесите всё влево: sin²3x−10sin3x·cos3x+9cos²3x=0 — однородное второй степени. Делим на cos²3x: tg²3x−10tg3x+9=0, замена t=tg3x: (t−1)(t−9)=0. Отсюда tg3x=1 (x=π/12+πk/3) или tg3x=9 (x=(1/3)arctg9+πk/3), k∈Z. б) На [−π/6;π/6] подходят x=π/12 и x=(1/3)arctg9.",
      keyFormula: "tg²3x−10tg3x+9=0",
      hints: [
        "Перенесите всё в одну сторону — получится однородное уравнение второй степени относительно sin3x и cos3x.",
        "Разделите на cos²3x и сделайте замену t=tg3x — получится обычное квадратное уравнение.",
        "Один из корней даёт табличный arctg (=1 ⟹ π/4), другой корень (tg3x=9) не табличный — оставьте его через arctg9.",
      ],
      explanation:
        "tg²3x−10tg3x+9=0 ⟹ (t−1)(t−9)=0. tg3x=1 даёт x=π/12+πk/3; tg3x=9 даёт x=(1/3)arctg9+πk/3. На [−π/6;π/6] попадает ровно по одной точке из каждой серии: π/12 и (1/3)arctg9.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigHomogeneous,
      text: "Решите уравнение √3·sin x + cos x = 1.",
      answerType: "DETAILED",
      correctAnswer:
        "Метод вспомогательного угла: делим обе части на √(3+1)=2: (√3/2)sinx+(1/2)cosx=1/2, то есть sinx·cos(π/6)+cosx·sin(π/6)=1/2, sin(x+π/6)=1/2. Отсюда x+π/6=π/6+2πk или x+π/6=5π/6+2πk. Ответ: x=2πk или x=2π/3+2πk, k∈Z.",
      keyFormula: "a·sinx+b·cosx=c, делим на √(a²+b²)",
      hints: [
        "Коэффициенты перед sinx и cosx — это √3 и 1. Найдите √(a²+b²)=√(3+1)=2 и разделите обе части уравнения на эту величину.",
        "После деления коэффициенты √3/2 и 1/2 — это табличные cos(π/6) и sin(π/6). Соберите левую часть по формуле синуса суммы.",
      ],
      explanation:
        "Деление на 2 даёт sinx·cos(π/6)+cosx·sin(π/6)=1/2, то есть sin(x+π/6)=1/2. Серии: x+π/6=π/6+2πk ⟹ x=2πk; x+π/6=5π/6+2πk ⟹ x=2π/3+2πk.",
      difficulty: 3,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skTrigHomogeneous,
      text: "а) Решите уравнение sin x − cos x = 1. б) Найдите все его корни, принадлежащие промежутку [−π; π].",
      answerType: "DETAILED",
      correctAnswer:
        "а) Метод вспомогательного угла: делим на √(1+1)=√2: (1/√2)sinx−(1/√2)cosx=1/√2, то есть sin(x−π/4)=√2/2. Отсюда x−π/4=π/4+2πk или x−π/4=3π/4+2πk. Ответ: x=π/2+2πk или x=π+2πk, k∈Z. б) На [−π;π] подходят x=−π, π/2, π.",
      keyFormula: "sin(x−π/4)=√2/2",
      hints: [
        "Коэффициенты перед sinx и cosx равны 1 и −1. Разделите обе части на √(1²+1²)=√2.",
        "Получившиеся коэффициенты 1/√2 — это табличные значения sin(π/4) и cos(π/4). Соберите по формуле синуса разности.",
      ],
      explanation:
        "sin(x−π/4)=√2/2 ⟹ x=π/2+2πk или x=π+2πk. На [−π;π] подходят x=−π (при k=−1 во второй серии), x=π/2 (при k=0), x=π (при k=0).",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    // --- Навык 5: Задачи прошлых лет (ЕГЭ) ---
    {
      id: stableId("p"),
      skillId: skTrigPastYears,
      text: "а) Решите уравнение 4^(sin2x)−2^(2√3sinx)/√(7sinx)=0. б) Найдите все корни этого уравнения, принадлежащие отрезку [−13π/2; −5π].",
      answerType: "DETAILED",
      correctAnswer:
        "ОДЗ: sinx>0. Перепишем: 2^(4sinxcosx)=2^(2√3sinx), значит 4sinxcosx=2√3sinx, 2sinx(2cosx−√3)=0. Отсюда sinx=0 (не подходит по ОДЗ) или cosx=√3/2 (x=±π/6+2πn). С учётом ОДЗ sinx>0 подходит только x=π/6+2πn, n∈Z. б) На отрезке [−13π/2;−5π] подходит x=−35π/6.",
      keyFormula: "sinx>0 (ОДЗ), 2sinx(2cosx−√3)=0",
      hints: [
        "Сначала запишите ОДЗ — под корнем должно быть sinx>0.",
        "Приведите обе части к одному основанию 2 (используя sin2x=2sinxcosx), приравняйте показатели степеней.",
        "После разложения на множители не забудьте отбросить ветку, не проходящую по ОДЗ.",
      ],
      explanation:
        "ОДЗ: sinx>0. Уравнение сводится к 2sinx(2cosx−√3)=0. Ветка sinx=0 отсеивается по ОДЗ, остаётся cosx=√3/2 с учётом sinx>0: x=π/6+2πn. На [−13π/2;−5π] попадает x=−35π/6.",
      difficulty: 3,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skTrigPastYears,
      text: "а) Решите уравнение sin 2x − √3·cos(π−x) = 0. б) Укажите корни этого уравнения, принадлежащие отрезку [−4π; −5π/2].",
      answerType: "DETAILED",
      correctAnswer:
        "а) cos(π−x)=−cosx, уравнение: 2sinxcosx+√3cosx=0, cosx(2sinx+√3)=0. Отсюда cosx=0 (x=π/2+πk) или sinx=−√3/2 (x=−π/3+2πk или x=−2π/3+2πk), k∈Z. б) На [−4π;−5π/2] подходят x=−7π/2, −8π/3, −5π/2.",
      keyFormula: "cosx(2sinx+√3)=0",
      hints: ["Приведите cos(π−x) к −cosx по формуле приведения — получится разложение на множители."],
      explanation:
        "cosx(2sinx+√3)=0 ⟹ cosx=0 или sinx=−√3/2. Серии: x=π/2+πk; x=−π/3+2πk; x=−2π/3+2πk. На [−4π;−5π/2] подходят −7π/2, −8π/3, −5π/2.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigPastYears,
      text: "а) Решите уравнение cos 2x + √2·sin(x−π) − 1 = 0. б) Укажите корни этого уравнения, принадлежащие отрезку [3π/2; 3π].",
      answerType: "DETAILED",
      correctAnswer:
        "а) cos2x=1−2sin²x, sin(x−π)=−sinx. Уравнение: −2sin²x−√2sinx=0, −sinx(2sinx+√2)=0. Отсюда sinx=0 (x=πk) или sinx=−√2/2 (x=−π/4+2πk или x=−3π/4+2πk), k∈Z. б) На [3π/2;3π] подходят x=7π/4, 2π, 3π.",
      keyFormula: "−sinx(2sinx+√2)=0",
      hints: ["Замените cos2x через sin²x и sin(x−π) через −sinx — получится уравнение только с sinx."],
      explanation:
        "−sinx(2sinx+√2)=0 ⟹ sinx=0 или sinx=−√2/2. Серии: x=πk; x=−π/4+2πk; x=−3π/4+2πk. На [3π/2;3π] подходят 7π/4, 2π, 3π.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigPastYears,
      text: "а) Решите уравнение 2cos²x − sin(x−π) − 1 = 0. б) Укажите корни этого уравнения, принадлежащие отрезку [−7π/2; −2π].",
      answerType: "DETAILED",
      correctAnswer:
        "а) cos²x=1−sin²x, sin(x−π)=−sinx. Уравнение: 2−2sin²x+sinx−1=0, то есть 2sin²x−sinx−1=0. Замена t=sinx: (t−1)(2t+1)=0. Отсюда sinx=1 (x=π/2+2πk) или sinx=−1/2 (x=−π/6+2πn или x=−5π/6+2πn). б) На [−7π/2;−2π] подходят x=−7π/2, −17π/6, −13π/6.",
      keyFormula: "2sin²x−sinx−1=0",
      hints: ["Замените cos²x через 1−sin²x и sin(x−π) через −sinx — получится квадратное уравнение относительно sinx."],
      explanation:
        "2sin²x−sinx−1=0 ⟹ sinx=1 или sinx=−1/2. Серии: x=π/2+2πk; x=−π/6+2πn; x=−5π/6+2πn. На [−7π/2;−2π] подходят −7π/2, −17π/6, −13π/6.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigPastYears,
      text: "а) Решите уравнение 3tg²x − 5/cos x + 1 = 0. б) Укажите корни этого уравнения, принадлежащие отрезку [−7π/2; −2π].",
      answerType: "DETAILED",
      correctAnswer:
        "ОДЗ: cosx≠0. Приведите всё к общему знаменателю cos²x: 3sin²x−5cosx+cos²x=0, то есть 3(1−cos²x)+cos²x−5cosx=0, 2cos²x+5cosx−3=0. Замена t=cosx: (2t−1)(t+3)=0, t=1/2 (подходит) или t=−3 (не подходит). Значит cosx=1/2, x=±π/3+2πk, k∈Z. б) На [−7π/2;−2π] подходит только x=−7π/3.",
      keyFormula: "2cos²x+5cosx−3=0",
      hints: [
        "Запишите ОДЗ (cosx≠0), приведите tg²x и 1/cosx к общему знаменателю cos²x.",
        "После приведения к общему знаменателю числитель даёт квадратное уравнение относительно cosx.",
      ],
      explanation:
        "2cos²x+5cosx−3=0 ⟹ cosx=1/2 (t=−3 отбрасывается, вне [−1;1]). x=±π/3+2πk. На [−7π/2;−2π] подходит x=−7π/3.",
      difficulty: 3,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skTrigPastYears,
      text: "а) Решите уравнение 2sin³x + √2cos²x = 2sin x. б) Найдите все корни этого уравнения, принадлежащие отрезку [−3π; −3π/2].",
      answerType: "DETAILED",
      correctAnswer:
        "а) cos²x=1−sin²x. Уравнение: 2sinx(1−cos²x)+√2cos²x=2sinx, после упрощения cos²x(√2−2sinx)=0. Отсюда cosx=0 (x=π/2+πk) или sinx=√2/2 (x=π/4+2πk или x=3π/4+2πk), k∈Z. б) На [−3π;−3π/2] подходят x=−5π/2, −7π/4, −3π/2.",
      keyFormula: "cos²x(√2−2sinx)=0",
      hints: ["Замените cos²x через 1−sin²x в правой части, раскройте скобки и вынесите общий множитель."],
      explanation:
        "cos²x(√2−2sinx)=0 ⟹ cosx=0 или sinx=√2/2. Серии: x=π/2+πk; x=π/4+2πk; x=3π/4+2πk. На [−3π;−3π/2] подходят −5π/2, −7π/4, −3π/2.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    // --- Дополнительные bank-задачи (не раздувают core-урок) ---
    {
      id: stableId("p"),
      skillId: skTrigMethods,
      text: "а) Решите уравнение cos x · cos 2x = √2sin²x + cos x. б) Найдите все корни этого уравнения, принадлежащие отрезку [−5π/2; −π].",
      answerType: "DETAILED",
      correctAnswer:
        "а) cos2x=1−2sin²x. Уравнение: cosx−2cosx·sin²x=√2sin²x+cosx, то есть sin²x(2cosx+√2)=0. Отсюда sinx=0 (x=πk) или cosx=−√2/2 (x=±3π/4+2πk), k∈Z. б) На [−5π/2;−π] подходит x=−5π/4.",
      keyFormula: "sin²x(2cosx+√2)=0",
      hints: ["Замените cos2x через 1−2sin²x — уравнение сведётся к разложению на множители с sin²x."],
      explanation:
        "sin²x(2cosx+√2)=0 ⟹ sinx=0 или cosx=−√2/2. Серии: x=πk; x=±3π/4+2πk. На [−5π/2;−π] подходит x=−5π/4.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigMethods,
      text: "а) Решите уравнение log₃(√2cos(π/2−x)+sin2x+81)=4. б) Найдите все корни этого уравнения, принадлежащие отрезку [π; 5π/2].",
      answerType: "DETAILED",
      correctAnswer:
        "ОДЗ: выражение под логарифмом положительно. По формуле приведения и синуса двойного угла: √2sinx+2sinxcosx+81=81, то есть sinx(2cosx+√2)=0 (все корни автоматически проходят по ОДЗ, так как 81>0). Отсюда sinx=0 (x=πk) или cosx=−√2/2 (x=±3π/4+2πk), k∈Z. б) На [π;5π/2] подходят x=π, 5π/4, 2π.",
      keyFormula: "sinx(2cosx+√2)=0",
      hints: [
        "log₃(A)=4 означает A=3⁴=81 — сначала избавьтесь от логарифма.",
        "Приведите cos(π/2−x) к sinx и sin2x к 2sinxcosx.",
      ],
      explanation:
        "sinx(2cosx+√2)=0 ⟹ sinx=0 или cosx=−√2/2. Серии: x=πk; x=±3π/4+2πk. На [π;5π/2] подходят π, 5π/4, 2π.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigHomogeneous,
      text: "а) Решите уравнение 2sin²x·cosx + √2cos²x = √2. б) Найдите все корни этого уравнения, принадлежащие отрезку [−7π/2; −2π].",
      answerType: "DETAILED",
      correctAnswer:
        "По ОТТ распишите √2 как √2(sin²x+cos²x). Уравнение сведётся к sin²x(2cosx−√2)=0. Отсюда sinx=0 (x=πk) или cosx=√2/2 (x=±π/4+2πk), k∈Z. б) На [−7π/2;−2π] подходят x=−3π, −9π/4, −2π.",
      keyFormula: "sin²x(2cosx−√2)=0",
      hints: ["Распишите правую часть √2 через ОТТ как √2·(sin²x+cos²x) — тогда всё уравнение станет однородным."],
      explanation:
        "sin²x(2cosx−√2)=0 ⟹ sinx=0 или cosx=√2/2. Серии: x=πk; x=±π/4+2πk. На [−7π/2;−2π] подходят −3π, −9π/4, −2π.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigHomogeneous,
      text: "а) Решите уравнение 2log₃²(2cos x) − 5log₃(2cos x) + 2 = 0. б) Найдите все корни этого уравнения, принадлежащие отрезку [π; 5π/2].",
      answerType: "DETAILED",
      correctAnswer:
        "ОДЗ: cosx>0. Замена t=log₃(2cosx): 2t²−5t+2=0, (2t−1)(t−2)=0, t=1/2 или t=2. При t=2: cosx=9/2>1, не подходит. При t=1/2: cosx=√3/2, x=±π/6+2πk, k∈Z (проходит по ОДЗ). б) На [π;5π/2] подходят x=11π/6, 13π/6.",
      keyFormula: "2t²−5t+2=0, t=log₃(2cosx)",
      hints: [
        "Запишите ОДЗ (cosx>0), затем сделайте замену t=log₃(2cosx) — получится обычное квадратное уравнение.",
        "После обратной замены проверьте оба значения cosx на допустимость (не только ОДЗ, но и диапазон [−1;1]).",
      ],
      explanation:
        "2t²−5t+2=0 ⟹ t=1/2 или t=2. t=2 даёт cosx=9/2 (не подходит, >1). t=1/2 даёт cosx=√3/2, x=±π/6+2πk. На [π;5π/2] подходят 11π/6, 13π/6.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skTrigPastYears,
      text: "а) Решите уравнение sin 2x + 2cos(x−π/2) = √3cos x + √3. б) Найдите все корни этого уравнения, принадлежащие отрезку [−3π; −3π/2].",
      answerType: "DETAILED",
      correctAnswer:
        "По формуле приведения cos(x−π/2)=sinx, по формуле двойного угла sin2x=2sinxcosx. Уравнение: 2sinxcosx+2sinx=√3(cosx+1), то есть (2sinx−√3)(cosx+1)=0. Отсюда sinx=√3/2 (x=π/3+2πk или x=2π/3+2πk) или cosx=−1 (x=π+2πk), k∈Z. б) На [−3π;−3π/2] подходят x=−5π/3, −3π.",
      keyFormula: "(2sinx−√3)(cosx+1)=0",
      hints: [
        "Приведите cos(x−π/2) к sinx, распишите sin2x через формулу двойного угла.",
        "Сгруппируйте слагаемые так, чтобы вынести общий множитель (cosx+1).",
      ],
      explanation:
        "(2sinx−√3)(cosx+1)=0 ⟹ sinx=√3/2 или cosx=−1. Серии: x=π/3+2πk; x=2π/3+2πk; x=π+2πk. На [−3π;−3π/2] подходят −5π/3, −3π.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    }
  );

  // ---------------- Модуль: Показательные и логарифмические ----------------
  const logTopicId = stableId("t");
  db.topics.push({ id: logTopicId, order: 4, title: "Показательные и логарифмические" });

  const chLogMain = stableId("s");
  db.subtopics.push({ id: chLogMain, topicId: logTopicId, order: 1, title: "Степени и логарифмы" });

  const skPowers = stableId("sk");
  const skLogarithms = stableId("sk");
  const skExpEquations = stableId("sk");
  const skLogEquations = stableId("sk");
  const skExpCombined = stableId("sk");
  const skIntervalMethod = stableId("sk");
  const skExpInequalities = stableId("sk");
  const skLogInequalities = stableId("sk");

  db.skills.push({
    id: skPowers,
    subtopicId: chLogMain,
    order: 1,
    title: "Свойства степеней",
    theoryCards: [
      {
        title: "Базовые свойства степеней",
        formula: "aˣ·aʸ=aˣ⁺ʸ;  aˣ/aʸ=aˣ⁻ʸ;  (aˣ)ʸ=aˣʸ",
        body: "При умножении степеней с одинаковым основанием показатели складываются, при делении — вычитаются, при возведении степени в степень — перемножаются. Дополнительно: a⁻ˣ=1/aˣ, a⁰=1, a¹=a.",
      },
      {
        title: "Степень произведения и частного",
        formula: "(a·b)ˣ=aˣ·bˣ;  (a/b)ˣ=aˣ/bˣ",
        body: "Степень распределяется по каждому множителю произведения или частного отдельно. Полезно для разложения чисел на простые множители перед применением свойств степеней.",
      },
      {
        title: "Замена переменной в показательных выражениях",
        body: "Если выражение содержит aˣ+a⁻ˣ (или похожую симметричную комбинацию), удобно ввести замену t=aˣ+a⁻ˣ и возвести обе части в квадрат — перекрёстные слагаемые часто сокращаются благодаря a·a⁻¹=1.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skPowers,
      text: "Найдите значение выражения 8²'⁸·16²'⁴/32³'².",
      answerType: "NUMBER",
      correctAnswer: "4",
      keyFormula: "aˣ·aʸ/aᶻ=aˣ⁺ʸ⁻ᶻ",
      hints: [
        "Приведите все числа к общему основанию 2: 8=2³, 16=2⁴, 32=2⁵.",
        "После приведения к основанию 2 сложите/вычтите показатели.",
      ],
      explanation: "8²·⁸·16²·⁴/32³·² = 2⁸·⁴·2⁹·⁶/2¹⁶ = 2⁸·⁴⁺⁹·⁶⁻¹⁶ = 2² = 4.",
      difficulty: 2,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skPowers,
      text: "Найдите значение выражения 2·(u²)³²·(5u)² : u⁶⁶ при тех значениях u, при которых оно имеет смысл.",
      answerType: "NUMBER",
      correctAnswer: "50",
      hints: [
        "Раскройте (u²)³²=u⁶⁴, разложите (5u)²=25u².",
        "Сложите все показатели степени u в числителе, затем вычтите показатель знаменателя.",
      ],
      explanation: "2·u⁶⁴·25u²/u⁶⁶ = 50·u⁶⁶/u⁶⁶ = 50 (значение не зависит от u).",
      difficulty: 2,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skPowers,
      text: "Найдите значение выражения (p⁴'⁵⁶)³·p²'⁷⁸ : p⁵'³¹ / p¹'¹⁵, если p⁵=13.",
      answerType: "NUMBER",
      correctAnswer: "169",
      hints: [
        "Упростите степень p до вида p⁵ᵏ — сложите/вычтите все показатели.",
        "Подставьте данное p⁵=13 в получившееся выражение.",
      ],
      explanation: "Показатели: 4,56·3+2,78−5,31−1,15=10=5·2. Итог: (p⁵)²=13²=169.",
      difficulty: 2,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skPowers,
      text: "Найдите значение выражения 2ˣ+2⁻ˣ, если 4ˣ+4⁻ˣ=23.",
      answerType: "NUMBER",
      correctAnswer: "5",
      keyFormula: "t²=(2ˣ+2⁻ˣ)²=4ˣ+2+4⁻ˣ",
      hints: [
        "Обозначьте t=2ˣ+2⁻ˣ и возведите обе части в квадрат — средний член сократится в 2·2ˣ·2⁻ˣ=2.",
        "После возведения в квадрат в правой части появится ровно данное в условии 4ˣ+4⁻ˣ.",
      ],
      explanation: "t²=4ˣ+2+4⁻ˣ=23+2=25. t>0 (сумма положительных степеней), значит t=5.",
      difficulty: 3,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skPowers,
      text: "Найдите значение выражения (35/24)³·(6/7)³·(2/5)³.",
      answerType: "NUMBER",
      correctAnswer: "0.125",
      hints: ["Разложите 35=5·7 и 24=2·2·6, чтобы увидеть, какие множители сократятся между дробями."],
      explanation: "35/24=(5·7)/(2·2·6). После перемножения всех трёх дробей в кубе почти все множители сокращаются, остаётся 1/2³=1/8=0,125.",
      difficulty: 3,
      egeTaskNumber: 6,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skLogarithms,
    subtopicId: chLogMain,
    order: 2,
    title: "Логарифмы: определение и свойства",
    theoryCards: [
      {
        title: "Определение логарифма",
        formula: "aᵗ=b  ⟺  logₐb=t",
        body: "Логарифм числа b по основанию a — это показатель степени t, в которую нужно возвести a, чтобы получить b. Существует при a>0, a≠1, b>0. Основное логарифмическое тождество: a^(logₐb)=b.",
      },
      {
        title: "Свойства логарифмов — сумма, разность, степень",
        formula: "logᵦa+logᵦc=logᵦ(ac);  logᵦa−logᵦc=logᵦ(a/c);  logᵦaʳ=r·logᵦa",
        body: "Сумма логарифмов с одинаковым основанием — это логарифм произведения, разность — логарифм частного. Показатель степени аргумента можно вынести множителем перед логарифмом.",
      },
      {
        title: "Смена основания и другие полезные свойства",
        formula: "logᵦa·logₐc=logᵦc;  logᵦa=1/logₐb;  a^(logᵦc)=c^(logᵦa)",
        body: "Первое свойство ('цепочка') позволяет последовательно менять основания. Второе — переставлять местами основание и аргумент. Третье, менее очевидное — переставлять местами основания степени и аргумента логарифма в показателе, часто спасает в сложных выражениях.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения (log₁₇289)·log₅₀₀(1/500).",
      answerType: "NUMBER",
      correctAnswer: "-2",
      keyFormula: "logₐ(aⁿ)=n",
      hints: ["289=17², а log₅₀₀(1/500) — это показатель степени −1 (так как 500⁻¹=1/500)."],
      explanation: "log₁₇289=log₁₇17²=2. log₅₀₀(1/500)=−1. Итог: 2·(−1)=−2.",
      difficulty: 1,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения 16^(log₂5).",
      answerType: "NUMBER",
      correctAnswer: "625",
      keyFormula: "a^(logᵦc)=c^(logᵦa)",
      hints: ["Поменяйте местами основания степени (16) и аргумент логарифма (5), используя свойство a^(logᵦc)=c^(logᵦa)."],
      explanation: "16^(log₂5)=5^(log₂16)=5⁴=625.",
      difficulty: 2,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения log₁₁242 − log₁₂₁4.",
      answerType: "NUMBER",
      correctAnswer: "2",
      hints: [
        "121=11², приведите log₁₂₁4 к основанию 11 через свойство logᵦᵣa=(1/r)·logᵦa.",
        "После приведения к одному основанию используйте свойство разности логарифмов.",
      ],
      explanation: "log₁₂₁4=log₁₁²2²=log₁₁2. log₁₁242−log₁₁2=log₁₁(242/2)=log₁₁121=2.",
      difficulty: 2,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения log(1/3)(log₁₁1331).",
      answerType: "NUMBER",
      correctAnswer: "-1",
      hints: ["1331=11³ — сначала найдите внутренний логарифм log₁₁1331."],
      explanation: "log₁₁1331=log₁₁11³=3. log(1/3)3=−1 (так как (1/3)⁻¹=3).",
      difficulty: 2,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения logᵦ(a²b⁷), если logₐb=8.",
      answerType: "NUMBER",
      correctAnswer: "7.25",
      keyFormula: "logᵦa=1/logₐb",
      hints: [
        "Разбейте logᵦ(a²b⁷) на сумму logᵦa²+logᵦb⁷ по свойству логарифма произведения.",
        "logᵦa найдите через данное logₐb=8, используя свойство logᵦa=1/logₐb.",
      ],
      explanation: "logᵦa²+logᵦb⁷=2logᵦa+7. logᵦa=1/8. Итог: 2·(1/8)+7=0,25+7=7,25.",
      difficulty: 2,
      egeTaskNumber: 7,
    },
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения log₁₅1000/log₂₂₅10⁴.",
      answerType: "NUMBER",
      correctAnswer: "1.5",
      hints: ["225=15² — приведите знаменатель к тому же основанию 15, что и числитель."],
      explanation: "log₁₅1000=3log₁₅10. log₂₂₅10⁴=log₁₅²10⁴=2log₁₅10. Итог: 3log₁₅10/(2log₁₅10)=1,5.",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения log₇144·log₁₂343.",
      answerType: "NUMBER",
      correctAnswer: "6",
      hints: ["144=12², 343=7³ — вынесите показатели степени за знак логарифма."],
      explanation: "log₇12²·log₁₂7³=2log₇12·3log₁₂7=6·(log₇12·log₁₂7)=6·1=6 (произведение logᵦa·logₐb=1).",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения 3^(log₅2) − 2^(log₂₅9).",
      answerType: "NUMBER",
      correctAnswer: "0",
      hints: ["25=5² — приведите показатель log₂₅9 к основанию 5, затем используйте перестановку оснований в степени."],
      explanation: "log₂₅9=log₅²3²=log₅3. 2^(log₅3)=3^(log₅2) (перестановка оснований). Итог: 3^(log₅2)−3^(log₅2)=0.",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения 49^(1−log₇2) + 5^(−log₅4).",
      answerType: "NUMBER",
      correctAnswer: "12.5",
      hints: [
        "Разбейте 49^(1−log₇2) как 49/49^(log₇2), затем примените перестановку оснований в степени.",
        "Аналогично разберите второе слагаемое 5^(−log₅4)=1/5^(log₅4).",
      ],
      explanation: "49^(1−log₇2)=49/2^(log₇49)=49/4. 5^(−log₅4)=1/4. Сумма: 49/4+1/4=50/4=12,5.",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения −log₂(log₂(⁴√√2)).",
      answerType: "NUMBER",
      correctAnswer: "3",
      hints: ["⁴√√2 = 2^(1/8) — сведите вложенные корни к одной степени с основанием 2."],
      explanation: "⁴√√2=2^(1/8). log₂(2^(1/8))=1/8. −log₂(1/8)=−log₂2⁻³=3.",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLogarithms,
      text: "Найдите значение выражения (3−log₅7)·(log(125/7)400+log(125/7)80).",
      answerType: "NUMBER",
      correctAnswer: "1",
      hints: [
        "Распишите 3 как log₅125, затем используйте свойство разности логарифмов для первого множителя.",
        "Во втором множителе распишите log(125/7)80 через смену основания, приведя к общему логарифму log(125/7)5.",
      ],
      explanation: "3−log₅7=log₅(125/7). Второй множитель сводится к log(125/7)5. Итог: log₅(125/7)·log(125/7)5=1 (по свойству logᵦa·logₐb=1).",
      difficulty: 3,
      egeTaskNumber: 7,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skExpEquations,
    subtopicId: chLogMain,
    order: 3,
    title: "Показательные уравнения",
    theoryCards: [
      {
        title: "Метод приведения к одному основанию",
        formula: "aᶠ⁽ˣ⁾=aᵍ⁽ˣ⁾  ⟺  f(x)=g(x)  (при a>0, a≠1)",
        body: "Если обе части уравнения — степени с ОДИНАКОВЫМ основанием, то функция aˣ строго монотонна, и уравнение равносильно равенству показателей. Приведите оба числа к общему простому основанию (например, 49=7², 0,2=1/5) перед сравнением показателей.",
      },
      {
        title: "Деление на общий множитель",
        body: "Если уравнение имеет вид k·aᶠ⁽ˣ⁾=m·aᵍ⁽ˣ⁾ с разными коэффициентами k, m — разделите обе части на aᵍ⁽ˣ⁾ (он всегда положителен, деление безопасно), получится k·aᶠ⁽ˣ⁾⁻ᵍ⁽ˣ⁾=m — снова уравнение с одним основанием.",
      },
      {
        title: "Квадратное уравнение в показателе",
        body: "Если показатель степени сам является квадратным трёхчленом (например, 4^(3x−x²)), приведите обе части к общему основанию как обычно, приравняйте показатели — получится обычное квадратное уравнение, решаемое через дискриминант.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skExpEquations,
      text: "Решите уравнение 7^(x−4)=49.",
      answerType: "NUMBER",
      correctAnswer: "6",
      keyFormula: "aᶠ⁽ˣ⁾=aᵍ⁽ˣ⁾ ⟺ f(x)=g(x)",
      hints: ["49=7² — приведите правую часть к тому же основанию 7, что и левая."],
      explanation: "7^(x−4)=7² ⟹ x−4=2 ⟹ x=6.",
      difficulty: 1,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skExpEquations,
      text: "Решите уравнение 7^(6−x)=49ˣ.",
      answerType: "NUMBER",
      correctAnswer: "2",
      hints: ["49=7² — приведите правую часть к основанию 7, не забыв перемножить показатели."],
      explanation: "7^(6−x)=(7²)ˣ=7^(2x) ⟹ 6−x=2x ⟹ x=2.",
      difficulty: 2,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skExpEquations,
      text: "Решите уравнение 4^(x+1)=0,25·4^(−x).",
      answerType: "NUMBER",
      correctAnswer: "-1",
      hints: ["0,25=4⁻¹ — приведите правую часть целиком к основанию 4, сложив показатели степени."],
      explanation: "4^(x+1)=4⁻¹·4^(−x)=4^(−1−x) ⟹ x+1=−1−x ⟹ x=−1.",
      difficulty: 2,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skExpEquations,
      text: "Найдите корень уравнения 0,3·10^(4−5x)=3^(4−5x).",
      answerType: "NUMBER",
      correctAnswer: "0.6",
      hints: [
        "Обе части содержат степень с показателем (4−5x), но разные основания — разделите обе части на 3^(4−5x).",
        "После деления получится степень частного (10/3)^(4−5x) с обеих сторон... на самом деле проще привести 0,3=3/10 и разделить на 10^(4−5x).",
      ],
      explanation: "0,3·10^(4−5x)=3^(4−5x) ⟹ (3/10)=(3/10)^(4−5x) ⟹ 1=4−5x ⟹ x=0,6.",
      difficulty: 3,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skExpEquations,
      text: "Решите уравнение 4^(3x−x²)=16√2. Если оно имеет более одного корня, в ответе укажите меньший из них.",
      answerType: "NUMBER",
      correctAnswer: "1.5",
      hints: [
        "Приведите правую часть к основанию 2: 16√2=2⁴·2^(1/2)=2^(4,5). Левую часть тоже приведите к основанию 2.",
        "После приравнивания показателей получится квадратное уравнение — но у него окажется единственный (двукратный) корень.",
      ],
      explanation: "4^(3x−x²)=2^(6x−2x²), 16√2=2^(4,5). Уравнение 6x−2x²=4,5 даёт 4x²−12x+9=0, дискриминант=0, единственный корень x=1,5.",
      difficulty: 3,
      egeTaskNumber: 6,
    }
  );

  db.skills.push({
    id: skExpCombined,
    subtopicId: chLogMain,
    order: 4,
    title: "Комбинированные показательные уравнения",
    theoryCards: [
      {
        title: "Однородное показательное уравнение",
        body: "Если уравнение содержит слагаемые вида a^(2x), a^x·b^x, b^(2x) (то есть степени ДВУХ разных оснований a и b, входящие с одинаковой суммарной «степенью 2») — это однородное уравнение. Разделите обе части на b^(2x) (он всегда положителен) — получится квадратное уравнение относительно t=(a/b)^x.",
      },
      {
        title: "Замена при трёх основаниях",
        formula: "t=(a/c)ˣ, где основания a, b=√(ac), c образуют геометрическую прогрессию",
        body: "Если в уравнении встречаются три степени с основаниями, образующими геометрическую прогрессию (например, 9ˣ, 6ˣ, 4ˣ — так как 6²=9·4), разделите на среднее по степени основание в квадрате (здесь b^(2x)) — получится квадратное уравнение относительно t=(a/b)ˣ.",
      },
      {
        title: "Отбор корня через сравнение с иррациональным числом",
        body: "Когда корень получается в виде логарифма с нетабличным значением (например, log_(6/5)2), а нужно проверить его принадлежность отрезку — сравнивайте не сам логарифм, а эквивалентные степенные неравенства (возведите обе части сравнения в одинаковую степень основания), это надёжнее приближённых вычислений в уме.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skExpCombined,
      text: "а) Решите уравнение 6^(2x−1)+2·25^(x−0,5)=16·30^(x−1). б) Найдите все корни этого уравнения, принадлежащие отрезку [0,5; 4].",
      answerType: "DETAILED",
      correctAnswer:
        "а) Приведите к виду 5·6²ˣ+12·5²ˣ=16·5ˣ·6ˣ (после раскрытия степеней с постоянными множителями). Разделите на 5²ˣ: получится однородное уравнение 5t²−16t+12=0 относительно t=(6/5)ˣ, где t₁=2, t₂=6/5. Обратная замена: x=log_(6/5)2 или x=1. б) Оба корня принадлежат [0,5;4] (проверка сравнением степеней подтверждает 1<log_(6/5)2<4).",
      keyFormula: "5t²−16t+12=0, t=(6/5)ˣ",
      hints: [
        "Раскройте все степени с постоянными коэффициентами (2⁻¹, 0,5 и т.д.), приведя уравнение к виду с чистыми степенями 6²ˣ, 5²ˣ, 6ˣ·5ˣ.",
        "Разделите обе части на 5²ˣ (или 6²ˣ) — получится квадратное уравнение относительно t=(6/5)ˣ.",
        "Для отбора корня log_(6/5)2 на отрезке — не вычисляйте приближённо, сравнивайте через возведение в степень.",
      ],
      explanation:
        "После деления на 5²ˣ: 5t²−16t+12=0 ⟹ t=2 или t=6/5. Обратная замена: x=log_(6/5)2 или x=1. Оба корня подходят на [0,5;4].",
      difficulty: 3,
      egeTaskNumber: 13,
    },
    {
      id: stableId("p"),
      skillId: skExpCombined,
      text: "а) Решите уравнение 3·9^(x+1)−5·6^(x+1)+4^(x+1,5)=0. б) Найдите все корни этого уравнения, принадлежащие отрезку [−π/2; π/2].",
      answerType: "DETAILED",
      correctAnswer:
        "а) Раскройте постоянные коэффициенты: 27·9ˣ−30·6ˣ+8·4ˣ=0. Разделите на 4ˣ: 27t²−30t+8=0 относительно t=(3/2)ˣ, где t₁=2/3, t₂=4/9. Обратная замена: x=−1 или x=−2. б) На [−π/2;π/2]≈[−1,57;1,57] подходит только x=−1 (x=−2 не входит).",
      keyFormula: "27t²−30t+8=0, t=(3/2)ˣ",
      hints: [
        "9=3², 6=3·2, 4=2² — все три основания выражаются через 3 и 2, значит уравнение однородно относительно (3/2)ˣ.",
        "Разделите обе части на 4ˣ, чтобы привести к квадратному уравнению относительно t=(3/2)ˣ.",
      ],
      explanation:
        "27t²−30t+8=0 ⟹ t=2/3 или t=4/9 ⟹ x=−1 или x=−2. На [−π/2;π/2] (≈[−1,57;1,57]) подходит только x=−1.",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skLogEquations,
    subtopicId: chLogMain,
    order: 5,
    title: "Логарифмические уравнения",
    theoryCards: [
      {
        title: "ОДЗ — обязательный первый шаг",
        body: "У логарифма logₐ(f(x)) должно выполняться f(x)>0. Прежде чем решать уравнение, выпишите это условие (или систему условий, если логарифмов несколько) — после нахождения корней обязательно проверьте их на соответствие ОДЗ.",
      },
      {
        title: "Уравнение вида logₐf(x)=c",
        formula: "logₐf(x)=c  ⟺  f(x)=aᶜ",
        body: "По определению логарифма, если logₐf(x)=c, то f(x) равно a в степени c. Число c удобно тоже представить как логарифм по тому же основанию (c=logₐ(aᶜ)) — тогда уравнение сведётся к равенству двух логарифмов с одинаковым основанием.",
      },

      {
        title: "Уравнение вида logₐf(x)=logₐg(x)",
        formula: "logₐf(x)=logₐg(x)  ⟺  f(x)=g(x)  (при выполнении ОДЗ)",
        body: "Если основания логарифмов слева и справа совпадают, можно просто приравнять аргументы — но не забыть при этом ОДЗ для обеих частей.",
      },
      {
        title: "Переменное основание логарифма",
        body: "Если основание логарифма само содержит переменную (например, log_(x−3)4=2), ОДЗ требует не только положительности основания, но и его отличия от 1. После возведения в степень по определению логарифма может получиться два корня — проверяйте оба на ОДЗ, один может отсеяться.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skLogEquations,
      text: "Найдите корень уравнения log₄(10+2x)=3.",
      answerType: "NUMBER",
      correctAnswer: "27",
      keyFormula: "logₐf(x)=c ⟺ f(x)=aᶜ",
      hints: ["По определению логарифма: если log₄(10+2x)=3, то 10+2x=4³."],
      explanation: "10+2x=4³=64 ⟹ 2x=54 ⟹ x=27.",
      difficulty: 1,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skLogEquations,
      text: "Найдите корень уравнения log₃(x−4)=log₃4.",
      answerType: "NUMBER",
      correctAnswer: "8",
      hints: ["Основания логарифмов слева и справа совпадают — можно сразу приравнять аргументы."],
      explanation: "x−4=4 ⟹ x=8 (ОДЗ x−4>0 выполнена).",
      difficulty: 1,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skLogEquations,
      text: "Найдите корень уравнения log₂(x+1)=log₂(12−3x).",
      answerType: "NUMBER",
      correctAnswer: "2.75",
      hints: [
        "Запишите ОДЗ для обеих частей: x+1>0 и 12−3x>0.",
        "Основания совпадают — приравняйте аргументы, затем проверьте корень на ОДЗ.",
      ],
      explanation: "x+1=12−3x ⟹ 4x=11 ⟹ x=2,75. Проверка ОДЗ: −1<2,75<4 — подходит.",
      difficulty: 2,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skLogEquations,
      text: "Найдите корень уравнения log₃(2x+1)=log₃(3−x)+1.",
      answerType: "NUMBER",
      correctAnswer: "1.6",
      hints: [
        "Представьте свободную единицу как log₃3, чтобы вся правая часть стала одним логарифмом.",
        "После объединения правой части через свойство суммы логарифмов — приравняйте аргументы.",
      ],
      explanation: "1=log₃3 ⟹ правая часть=log₃(3−x)+log₃3=log₃(9−3x). Тогда 2x+1=9−3x ⟹ 5x=8 ⟹ x=1,6.",
      difficulty: 3,
      egeTaskNumber: 6,
    },
    {
      id: stableId("p"),
      skillId: skLogEquations,
      text: "Найдите корень уравнения logπ(7−5x)=2·logπ9.",
      answerType: "NUMBER",
      correctAnswer: "-14.8",
      hints: ["Внесите множитель 2 внутрь логарифма как степень: 2logπ9=logπ9²."],
      explanation: "logπ(7−5x)=logπ81 ⟹ 7−5x=81 ⟹ 5x=−74 ⟹ x=−14,8.",
      difficulty: 2,
      egeTaskNumber: 6,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLogEquations,
      text: "Найдите корень уравнения log(x−3)4=2. Если уравнение имеет более одного корня, в ответе укажите наименьший из них.",
      answerType: "NUMBER",
      correctAnswer: "5",
      hints: [
        "ОДЗ для переменного основания: x−3>0 И x−3≠1 (то есть x≠4).",
        "По определению логарифма: (x−3)²=4 — это даёт ДВА возможных значения x−3, проверьте оба на ОДЗ.",
      ],
      explanation: "(x−3)²=4 ⟹ x−3=2 (x=5) или x−3=−2 (x=1, не подходит по ОДЗ x−3>0). Единственный корень x=5.",
      difficulty: 3,
      egeTaskNumber: 6,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLogEquations,
      text: "Найдите наименьший корень уравнения (x²−1)/log₂x = (7x−7)/log₂x.",
      answerType: "NUMBER",
      correctAnswer: "6",
      hints: [
        "ОДЗ: x>0 и log₂x≠0 (то есть x≠1) — знаменатели дробей не могут быть равны нулю.",
        "Раз знаменатели слева и справа одинаковы (и по ОДЗ не равны нулю), можно приравнять числители.",
      ],
      explanation: "x²−1=7x−7 ⟹ x²−7x+6=0 ⟹ x=1 или x=6. Корень x=1 не подходит по ОДЗ (log₂1=0). Единственный (и потому наименьший) корень: x=6.",
      difficulty: 3,
      egeTaskNumber: 6,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLogEquations,
      text: "а) Решите уравнение log₂²(4x²)+3log₀,₅(8x)=1. б) Найдите все корни этого уравнения, принадлежащие промежутку [0,15; 1,5].",
      answerType: "DETAILED",
      correctAnswer:
        "ОДЗ: x>0. log₂(4x²)=2log₂(2x) (степень 2 выносится без модуля, так как x>0). log₀,₅(8x)=−(log₂8+log₂x)=−(3+log₂(2x)−1)=−(2+log₂(2x)). Замена t=log₂(2x): 4t²−3(2+t)−1=0 ⟹ 4t²−3t−7=0 ⟹ (t+1)(4t−7)=0 ⟹ t=−1 или t=7/4. Обратная замена: x=1/4 или x=⁴√8. б) На [0,15;1,5] подходит только x=1/4 (⁴√8>1,5).",
      keyFormula: "4t²−3t−7=0, t=log₂(2x)",
      hints: [
        "Запишите ОДЗ (x>0), затем приведите оба логарифма к одному основанию 2 через замену t=log₂(2x).",
        "Для отбора корня ⁴√8 на промежутке сравнивайте через возведение в степень, а не приближённо в уме.",
      ],
      explanation:
        "После замены t=log₂(2x): 4t²−3t−7=0 ⟹ t=−1 или t=7/4 ⟹ x=1/4 или x=⁴√8. На [0,15;1,5] подходит только x=1/4 (⁴√8≈1,68>1,5).",
      difficulty: 3,
      egeTaskNumber: 13,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skIntervalMethod,
    subtopicId: chLogMain,
    order: 6,
    title: "Метод интервалов",
    theoryCards: [
      {
        title: "«Хорошие» и «плохие» скобки",
        body: "Скобка (x−a) — «хорошая»: перед x стоит «+», знаки слева и справа от корня a чередуются стандартно (слева «−», справа «+»). Скобка (a−x) — «плохая». Чтобы не путаться, всегда приводите каждую скобку к хорошему виду, домножая на −1 (не забывая при этом сменить знак всего неравенства при нечётном числе таких перемен).",
      },
      {
        title: "Расстановка знаков",
        body: "Отметьте на числовой оси корни всех множителей числителя и знаменателя. Начиная с самого правого промежутка (там знак всегда «+», если все скобки хорошие), двигайтесь влево: при переходе через точку с НЕЧЁТНОЙ кратностью знак меняется, при ЧЁТНОЙ кратности (например, множитель в квадрате) — знак сохраняется.",
      },
      {
        title: "Строгое и нестрогое неравенство — закрашенные и выколотые точки",
        body: "При строгом неравенстве (>, <) точки на оси выкалываются (не входят в ответ) — в частности, точки, где знаменатель обращается в 0, ВСЕГДА выкалываются, даже при нестрогом неравенстве. При нестрогом (⩾, ⩽) точки числителя закрашиваются (входят в ответ).",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skIntervalMethod,
      text: "Решите неравенство (2−x)(x−3)⩽0.",
      answerType: "DETAILED",
      correctAnswer:
        "Скобка (2−x) плохая — домножим неравенство на −1, сменив знак: (x−2)(x−3)⩾0. Корни: x=2, x=3. Метод интервалов (справа «+»): x∈(−∞;2]∪[3;+∞).",
      keyFormula: "(x−2)(x−3)⩾0",
      hints: [
        "Сначала приведите скобку (2−x) к хорошему виду, домножив всё неравенство на −1 (не забыв сменить знак неравенства).",
        "Отметьте корни на оси и расставьте знаки, начиная с «+» справа.",
      ],
      explanation: "(x−2)(x−3)⩾0 ⟹ x∈(−∞;2]∪[3;+∞) (точки закрашены, неравенство нестрогое).",
      difficulty: 2,
      egeTaskNumber: 15,
    },
    {
      id: stableId("p"),
      skillId: skIntervalMethod,
      text: "Решите неравенство (2−x)²(x−3)⩽0.",
      answerType: "DETAILED",
      correctAnswer:
        "Множитель (2−x)² уже неотрицателен при любом x (чётная степень) — можно оставить как есть, знак от него не зависит. Корни: x=2 (кратность 2, знак не меняется), x=3 (кратность 1, знак меняется). Ответ: x∈(−∞;3].",
      hints: ["Чётная степень скобки всегда даёт неотрицательный множитель — в точке x=2 знак всего выражения НЕ меняется."],
      explanation: "При переходе через x=2 (чётная кратность) знак сохраняется, через x=3 (нечётная) — меняется. x∈(−∞;3].",
      difficulty: 2,
      egeTaskNumber: 15,
    },
    {
      id: stableId("p"),
      skillId: skIntervalMethod,
      text: "Решите неравенство (2x+3)(3x−6)/(x²−5)⩾0.",
      answerType: "DETAILED",
      correctAnswer:
        "Вынесите общие множители: 2(x+3/2)(x−2)/((x−√5)(x+√5))⩾0. Корни числителя: x=−3/2, x=2 (входят). Корни знаменателя: x=±√5 (выколоты, знаменатель≠0). Ответ: x∈(−∞;−√5)∪[−3/2;2]∪(√5;+∞).",
      hints: [
        "Разложите на множители: 2x+3=2(x+3/2), 3x−6=3(x−2), x²−5=(x−√5)(x+√5).",
        "Точки знаменателя всегда выкалываются, даже в нестрогом неравенстве.",
      ],
      explanation: "Метод интервалов с 4 корнями: −√5, −3/2, 2, √5. Ответ: x∈(−∞;−√5)∪[−3/2;2]∪(√5;+∞).",
      difficulty: 3,
      egeTaskNumber: 15,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skIntervalMethod,
      text: "Решите неравенство (x²+x+1)(2x²+3x−5)/((−x²−16)(x²+2x+1))⩾0.",
      answerType: "DETAILED",
      correctAnswer:
        "x²+x+1>0 всегда (D=−3<0). 2x²+3x−5=2(x−1)(x+5/2). −x²−16<0 всегда (после домножения на −1 знак меняется). x²+2x+1=(x+1)² — чётная кратность. После упрощения: (x−1)(x+5/2)/(x+1)²⩽0 (знак сменился от домножения на −1). Ответ: x∈[−5/2;−1)∪(−1;1].",
      hints: [
        "Проверьте дискриминант каждого квадратного множителя — некоторые не имеют корней и сохраняют постоянный знак.",
        "Множитель (−x²−16) всегда отрицателен — домножение на −1 (для приведения к хорошему виду) меняет знак всего неравенства.",
      ],
      explanation: "После анализа всех множителей и приведения знаков: (x−1)(x+2,5)/(x+1)²⩽0 ⟹ x∈[−2,5;−1)∪(−1;1].",
      difficulty: 3,
      egeTaskNumber: 15,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skExpInequalities,
    subtopicId: chLogMain,
    order: 7,
    title: "Показательные неравенства",
    theoryCards: [
      {
        title: "Элементарное показательное неравенство",
        formula: "aᶠ⁽ˣ⁾<aᵍ⁽ˣ⁾ ⟺ f(x)<g(x), если a>1;  ⟺ f(x)>g(x), если 0<a<1",
        body: "Если основание a>1 — функция aˣ возрастает, знак неравенства при переходе к сравнению аргументов СОХРАНЯЕТСЯ. Если 0<a<1 — функция убывает, знак МЕНЯЕТСЯ на противоположный.",
      },
      {
        title: "Разные основания — приведение через логарифм",
        body: "Если основания разных степеней нельзя привести к общему простому числу, представьте одно основание как степень другого через логарифм: b=a^(logₐb). Это сводит неравенство к элементарному показательному с одним основанием.",
      },
      {
        title: "Замена переменной t=aˣ",
        body: "Если неравенство после преобразований содержит только степени вида aᵏˣ (при разных k, кратных общему), введите замену t=aˣ. Обязательно учтите ограничение t>0 — это может \"отрезать\" часть решений при обратной замене, даже если метод интервалов формально даёт более широкий промежуток для t.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skExpInequalities,
      text: "Решите неравенство 4^(2x²−23)<8.",
      answerType: "DETAILED",
      correctAnswer:
        "Приведите к основанию 2: 2^(4x²−46)<2³. Основание>1, знак сохраняется: 4x²−46<3 ⟹ 4x²−49<0 ⟹ (2x−7)(2x+7)<0. Методом интервалов: x∈(−7/2;7/2).",
      keyFormula: "4x²−49<0",
      hints: [
        "Приведите обе части к основанию 2: 4=2², 8=2³.",
        "После сравнения аргументов получится квадратное неравенство — решите его методом интервалов.",
      ],
      explanation: "2^(4x²−46)<2³ ⟹ 4x²−49<0 ⟹ (2x−7)(2x+7)<0 ⟹ x∈(−3,5;3,5).",
      difficulty: 2,
      egeTaskNumber: 15,
    },
    {
      id: stableId("p"),
      skillId: skExpInequalities,
      text: "Решите неравенство 5^(2x−4)<(1/5)^(x+3).",
      answerType: "DETAILED",
      correctAnswer:
        "Приведите (1/5)^(x+3) к основанию 5: =5^(−x−3). Основание>1: 2x−4<−x−3 ⟹ 3x<1 ⟹ x<1/3. Ответ: x∈(−∞;1/3).",
      hints: ["1/5=5⁻¹ — приведите обе части к одному основанию 5, затем сравните показатели напрямую."],
      explanation: "5^(2x−4)<5^(−x−3) ⟹ 2x−4<−x−3 (основание>1, знак сохраняется) ⟹ x<1/3.",
      difficulty: 2,
      egeTaskNumber: 15,
    },
    {
      id: stableId("p"),
      skillId: skExpInequalities,
      text: "Решите неравенство 8^(x+2)<3^(3−x)/9.",
      answerType: "DETAILED",
      correctAnswer:
        "9=3², значит правая часть =3^(1−x). Приведите 8 к основанию 3 через 8=3^(log₃8): 3^((x+2)log₃8)<3^(1−x). Основание>1: (x+2)log₃8<1−x. Так как log₃8+1>0, после группировки: (x+2)(log₃8+1)<0 ⟹ x+2<0 ⟹ x<−2.",
      hints: [
        "Упростите правую часть: 3^(3−x)/9=3^(3−x)/3²=3^(1−x).",
        "Приведите 8 к основанию 3 через логарифм, затем сгруппируйте все слагаемые с (x+2).",
      ],
      explanation: "После приведения к основанию 3: (x+2)(log₃8+1)<0. Множитель (log₃8+1)>0 всегда, значит x+2<0 ⟹ x<−2.",
      difficulty: 3,
      egeTaskNumber: 15,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skExpInequalities,
      text: "Решите неравенство 1/(5ˣ+31) ⩽ 4/(5^(x+1)−1).",
      answerType: "DETAILED",
      correctAnswer:
        "Замена t=5ˣ, t>0. Неравенство: 1/(t+31)⩽4/(5t−1) ⟹ (t−125)/((t+31)(5t−1))⩽0. Методом интервалов при t>0: t∈(1/5;125]. Обратная замена: 5⁻¹<5ˣ⩽5³ ⟹ x∈(−1;3].",
      keyFormula: "t=5ˣ, t>0",
      hints: [
        "Введите замену t=5ˣ (не забыв про ограничение t>0), приведите к общему знаменателю.",
        "После метода интервалов для t сделайте обратную замену — приведите границы к степеням 5.",
      ],
      explanation: "После замены и метода интервалов: t∈(1/5;125], что даёт 5⁻¹<5ˣ⩽5³ ⟹ x∈(−1;3].",
      difficulty: 3,
      egeTaskNumber: 15,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skExpInequalities,
      text: "Решите неравенство 27^(x−3)+3·9^(x−3)−3ˣ⁻³⩽0. Замените 3^(x−3)=t.",
      answerType: "DETAILED",
      correctAnswer:
        "После замены t=3^(x−3), t>0: t³+3t²−t⩽0 ⟹ t²(t+3)−(t+3)⩽0 ⟹ (t²−1)(t+3)⩽0 ⟹ (t−1)(t+1)(t+3)⩽0. При t>0: t∈(0;1]. Обратная замена: 0<3^(x−3)⩽1 ⟹ x−3⩽0 ⟹ x⩽3.",
      hints: [
        "После замены сгруппируйте слагаемые попарно, чтобы разложить на множители через a²−b²=(a+b)(a−b).",
        "Не забудьте учесть ограничение t>0 при отборе решений.",
      ],
      explanation: "(t−1)(t+1)(t+3)⩽0 при t>0 даёт t∈(0;1], то есть 3^(x−3)⩽1 ⟹ x⩽3.",
      difficulty: 3,
      egeTaskNumber: 15,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skExpInequalities,
      text: "Решите неравенство 5^(2x/(x+3)) − 5^((2x+3)/(x+3)) ⩾ 5^(x/(x+3)) − 5.",
      answerType: "DETAILED",
      correctAnswer:
        "Замена t=5^(x/(x+3))>0. Так как (2x+3)/(x+3)=x/(x+3)+1, то 5^((2x+3)/(x+3))=5t. Неравенство: t²−5t⩾t−5 ⟹ (t−1)(t−5)⩾0 ⟹ t∈(0;1]∪[5;+∞). Обратная замена «по кускам»: t⩽1 даёт x/(x+3)⩽0 ⟹ x∈(−3;0]; t⩾5 даёт x/(x+3)⩾1 ⟹ x∈(−∞;−3). Объединяя: x∈(−∞;−3)∪(−3;0].",
      keyFormula: "(t−1)(t−5)⩾0, t=5^(x/(x+3))",
      hints: [
        "Представьте показатель (2x+3)/(x+3) как x/(x+3)+1, чтобы выразить второе слагаемое через ту же замену t, умноженную на 5.",
        "После решения квадратного неравенства для t делайте обратную замену «по кускам» — отдельно для t⩽1 и отдельно для t⩾5, каждый раз получая своё неравенство на x методом интервалов.",
      ],
      explanation:
        "(t−1)(t−5)⩾0 при t>0 даёт t∈(0;1]∪[5;+∞). Обратная замена по кускам: x∈(−3;0] (от t⩽1) и x∈(−∞;−3) (от t⩾5). Итог: x∈(−∞;−3)∪(−3;0].",
      difficulty: 3,
      egeTaskNumber: 15,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skExpInequalities,
      text: "Решите неравенство 25·4^(0,5−2/x) − 133·10^(−2/x) + 4·5^(1−4/x) ⩽ 0.",
      answerType: "DETAILED",
      correctAnswer:
        "Обозначьте a=2^(−2/x), b=5^(−2/x) — уравнение однородно второй степени: 50a²−133ab+20b²⩽0. Разделите на a²: 20t²−133t+50⩽0 относительно t=(5/2)^(−2/x), где t∈[2/5;25/4]. Обратная замена через сравнение показателей (основание 5/2>1): −1⩽−2/x⩽2, что после решения даёт x∈(−∞;−1]∪[2;+∞).",
      keyFormula: "20t²−133t+50⩽0, t=(5/2)^(−2/x)",
      hints: [
        "Приведите 4^(...) и 10^(...) к основаниям 2 и 5 отдельно — заметите, что неравенство однородно относительно 2^(−2/x) и 5^(−2/x).",
        "Разделите на a²=(2^(−2/x))² и сделайте замену t=(5/2)^(−2/x).",
        "После нахождения границ для t переходите к сравнению показателей −2/x — получится система из двух неравенств, решаемых методом интервалов.",
      ],
      explanation:
        "После однородной замены: 20t²−133t+50⩽0 ⟹ t∈[2/5;25/4]. Обратная замена даёт систему на −2/x, решение которой: x∈(−∞;−1]∪[2;+∞).",
      difficulty: 3,
      egeTaskNumber: 15,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skLogInequalities,
    subtopicId: chLogMain,
    order: 8,
    title: "Логарифмические неравенства",
    theoryCards: [
      {
        title: "Элементарное логарифмическое неравенство",
        formula: "logₐf(x)<logₐg(x) ⟺ f(x)<g(x), если a>1;  ⟺ f(x)>g(x), если 0<a<1",
        body: "Как и в показательных неравенствах, знак сохраняется при основании a>1 и меняется на противоположный при 0<a<1. Но в логарифмических неравенствах ВСЕГДА появляется ОДЗ (аргументы обоих логарифмов должны быть положительны) — после решения обязательно пересеките ответ с ОДЗ.",
      },
      {
        title: "Замена t=logₐx — без ограничения на знак",
        body: "В отличие от показательных неравенств (где t=aˣ всегда требует t>0), при замене t=logₐx никакого дополнительного ограничения на знак t НЕТ — логарифм может быть любым действительным числом. Не забывайте про это отличие.",
      },
      {
        title: "Осторожно при разложении свойств логарифма",
        body: "Внесение степени в логарифм loga(x)ⁿ=n·logₐx работает всегда. А вот ВЫНЕСЕНИЕ степени из аргумента loga(xⁿ)=n·logₐ|x| требует модуля при чётном n (аргумент мог быть и отрицательным) — модуль можно убрать только если из ОДЗ уже известно, что x>0. При нечётном n модуль не нужен вообще.",
      },
      {
        title: "Метод рационализации",
        body: "Продвинутая техника: сложное логарифмическое (или показательное) неравенство можно заменить на РАВНОСИЛЬНОЕ рациональное неравенство по специальным формулам замены (например, (a−1)(f−g) вместо loga f − loga g). Это позволяет свести всю задачу сразу к методу интервалов, минуя пошаговый анализ знака основания на каждом шаге.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skLogInequalities,
      text: "Решите неравенство log₂(x²)⩾1+log₂x.",
      answerType: "DETAILED",
      correctAnswer:
        "ОДЗ: x>0 (из x²>0 и x>0 совместно). Распишите 1=log₂2: log₂x²⩾log₂2x. Основание>1: x²⩾2x ⟹ x(x−2)⩾0 ⟹ x∈(−∞;0]∪[2;+∞). С учётом ОДЗ x>0: ответ x∈[2;+∞).",
      keyFormula: "x(x−2)⩾0",
      hints: [
        "Запишите ОДЗ первым делом: из log₂(x²) нужно x²>0, из log₂x нужно x>0 — вместе даёт просто x>0.",
        "Представьте 1 как log₂2, объедините правую часть в один логарифм через свойство суммы.",
      ],
      explanation: "После приведения к элементарному виду и решения x(x−2)⩾0 с учётом ОДЗ x>0: ответ x∈[2;+∞).",
      difficulty: 2,
      egeTaskNumber: 15,
    },
    {
      id: stableId("p"),
      skillId: skLogInequalities,
      text: "Решите неравенство log₂²x+3log₂x+2⩽0.",
      answerType: "DETAILED",
      correctAnswer:
        "ОДЗ: x>0. Замена t=log₂x (без ограничения на знак t). Неравенство: t²+3t+2⩽0 ⟹ (t+1)(t+2)⩽0 ⟹ t∈[−2;−1]. Обратная замена: −2⩽log₂x⩽−1 ⟹ log₂(1/4)⩽log₂x⩽log₂(1/2) ⟹ x∈[1/4;1/2].",
      keyFormula: "t=log₂x, t²+3t+2⩽0",
      hints: [
        "Введите замену t=log₂x — здесь, в отличие от показательных неравенств, никакого ограничения на знак t нет.",
        "После решения квадратного неравенства относительно t сделайте обратную замену, приведя границы к степеням двойки.",
      ],
      explanation: "t∈[−2;−1] ⟹ x∈[1/4;1/2] (основание 2>1, знак сохраняется при обратном переходе).",
      difficulty: 3,
      egeTaskNumber: 15,
    },
    {
      id: stableId("p"),
      skillId: skLogInequalities,
      text: "Решите неравенство (log₇(49x²)−7)/(log₇²x−4)⩽1.",
      answerType: "DETAILED",
      correctAnswer:
        "Ограничение: x>0. Замена t=log₇x. log₇(49x²)=2+2t (степень 2 выносится без модуля, так как x>0 по ОДЗ). Неравенство сводится к (t−1)²/((t−2)(t+2))⩾0. Методом интервалов: t∈(−∞;−2)∪{1}∪(2;+∞). Обратная замена по кускам даёт x∈(0;1/49)∪{7}∪(49;+∞).",
      keyFormula: "(t−1)²/((t−2)(t+2))⩾0",
      hints: [
        "Сделайте замену t=log₇x, приведя log₇(49x²) к виду 2+2t.",
        "После метода интервалов для t делайте обратную замену «по кускам» — для каждого промежутка/точки отдельно.",
      ],
      explanation: "После всех преобразований: t∈(−∞;−2)∪{1}∪(2;+∞), что при обратной замене даёт x∈(0;1/49)∪{7}∪(49;+∞).",
      difficulty: 3,
      egeTaskNumber: 15,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLogInequalities,
      text: "Решите неравенство log₀,₂(x³−2x²−4x+8)⩽log₀,₀₄((x−2)⁴).",
      answerType: "DETAILED",
      correctAnswer:
        "Разложите x³−2x²−4x+8=(x−2)²(x+2). ОДЗ (с учётом обеих частей) даёт x∈(−2;2)∪(2;+∞). 0,04=0,2², поэтому log₀,₀₄(x−2)⁴=log₀,₂(x−2)². Неравенство: log₀,₂((x−2)²(x+2))⩽log₀,₂(x−2)². Основание<1, знак меняется: (x−2)²(x+2)⩾(x−2)² ⟹ (x−2)²(x+1)⩾0 ⟹ x∈[−1;+∞) (с учётом чётности x=2 не меняет знак). Пересекая с ОДЗ: x∈[−1;2)∪(2;+∞).",
      keyFormula: "(x−2)²(x+1)⩾0",
      hints: [
        "Разложите кубическое выражение x³−2x²−4x+8 на множители группировкой.",
        "0,04=0,2² — приведите правую часть к тому же основанию 0,2, что и левая, вынеся степень из аргумента.",
        "Основание 0,2<1 — не забудьте сменить знак неравенства при переходе к сравнению аргументов.",
      ],
      explanation: "После приведения к общему основанию и смены знака (основание<1): (x−2)²(x+1)⩾0. С учётом ОДЗ ответ: x∈[−1;2)∪(2;+∞).",
      difficulty: 3,
      egeTaskNumber: 15,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLogInequalities,
      text: "Решите неравенство log_(x+1)(x−1)⩾0, используя метод рационализации.",
      answerType: "DETAILED",
      correctAnswer:
        "ОДЗ: x+1>0, x+1≠1, x−1>0 ⟹ x>1. Метод рационализации применим (логарифм — единственный множитель слева, справа 0): logg(x)f(x)∼(g(x)−1)(f(x)−1). Получаем (x+1−1)(x−1−1)⩾0 ⟹ x(x−2)⩾0 ⟹ x∈(−∞;0]∪[2;+∞). С учётом ОДЗ x>1: ответ x∈[2;+∞).",
      keyFormula: "logg(x)f(x) ∼ (g(x)−1)(f(x)−1)",
      hints: [
        "Метод рационализации применим здесь: логарифм — единственный множитель в левой части, а справа стоит 0.",
        "Замените log_(x+1)(x−1) на произведение (x+1−1)(x−1−1) — знаки этих двух выражений на ОДЗ всегда совпадают.",
      ],
      explanation:
        "(x+1−1)(x−1−1)⩾0 ⟹ x(x−2)⩾0 ⟹ x∈(−∞;0]∪[2;+∞). Пересекая с ОДЗ (x>1): x∈[2;+∞).",
      difficulty: 2,
      egeTaskNumber: 15,
    },
    {
      id: stableId("p"),
      skillId: skLogInequalities,
      text: "Решите неравенство (x²+3x−10)·log₀,₅(x²−1)·log_(x²−1)(x+2)⩽0, используя метод рационализации.",
      answerType: "DETAILED",
      correctAnswer:
        "ОДЗ: x²−1>0, x²−1≠1, x+2>0 — даёт x∈(−2;−√2)∪(−√2;−1)∪(1;√2)∪(√2;+∞). Оба логарифма входят как МНОЖИТЕЛИ, справа 0 — метод рационализации применим к каждому: log₀,₅(x²−1)∼(0,5−1)(x²−1−1)=−0,5(x²−2); log_(x²−1)(x+2)∼(x²−1−1)(x+2−1)=(x²−2)(x+1). После упрощения и деления на положительную константу получаем (x+5)(x−2)(x+1)(x²−2)²⩾0. Методом интервалов с учётом ОДЗ: x∈(−2;−√2)∪(−√2;−1)∪[2;+∞).",
      keyFormula: "(x+5)(x−2)(x+1)(x²−2)²⩾0",
      hints: [
        "Проверьте применимость метода: логарифмы должны быть МНОЖИТЕЛЯМИ (не слагаемыми) в произведении, а справа — 0. Оба условия выполнены.",
        "Замените КАЖДЫЙ логарифм-множитель на соответствующее рациональное выражение по формуле метода рационализации.",
        "После упрощения получится многочлен — решайте методом интервалов, не забыв пересечь с ОДЗ.",
      ],
      explanation:
        "После рационализации обоих логарифмов и упрощения: (x+5)(x−2)(x+1)(x²−2)²⩾0. Методом интервалов с учётом ОДЗ: x∈(−2;−√2)∪(−√2;−1)∪[2;+∞).",
      difficulty: 3,
      egeTaskNumber: 15,
      tier: "bank",
    }
  );

  // ---------------- Модуль: Счётные задачи (номер 9 ЕГЭ) ----------------
  // Единственный источник для этой темы — сама подборка реальных задач
  // (нет отдельного "теоретического" урока, в отличие от других тем) —
  // используем её как основной материал, а не как дополнительную практику.
  // Это НЕ отдельный предмет — глава внутри "Текстовые и прикладные
  // задачи" (объединяется с реальным topicId ниже, в блоке той темы —
  // именно там, а не здесь, чтобы не трогать порядковые номера stableId()
  // для всего, что вставлено ПОСЛЕ этого места файла).
  const countTopicId = stableId("t"); // намеренно не используется как topics.push
  const chCountMain = stableId("s");

  const skCountFormula = stableId("sk");

  db.skills.push({
    id: skCountFormula,
    subtopicId: chCountMain,
    order: 1,
    title: "Вычисление по формуле",
    theoryCards: [
      {
        title: "Что такое задача №9",
        body: "В этих задачах дана формула, связывающая несколько физических (или иных прикладных) величин — обычно из физики, но встречаются и из других областей. По условию известны все величины, кроме одной — её и нужно найти. Ответ всегда число (или несколько чисел, если условие содержит неравенство или ограничение).",
      },
      {
        title: "Алгоритм решения",
        body: "1) Выпишите формулу и то, что дано. 2) Подставьте известные числа напрямую в формулу. 3) Решите получившееся уравнение (или неравенство) относительно неизвестной величины. 4) Проверьте единицы измерения и ограничения из условия (например, «угол острый» или «наименьший корень») — это часто определяет, какой из нескольких формальных корней брать в ответ.",
      },
      {
        title: "Работа с большими числами и степенями",
        body: "Числа в этих задачах часто даются в виде a·10ⁿ (стандартный вид) или содержат большие степени. Раскладывайте такие числа на множители (используя признаки делимости), а не пытайтесь вычислить в лоб — это почти всегда даёт красивое сокращение вместо громоздкой арифметики.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skCountFormula,
      text: "Автомобиль разгоняется на прямолинейном участке шоссе с постоянным ускорением a км/ч². Скорость v вычисляется по формуле v=√(2la), где l — пройденный автомобилем путь. Найдите ускорение, с которым должен двигаться автомобиль, чтобы, проехав 0,9 километра, приобрести скорость 150 км/ч. Ответ дайте в км/ч².",
      answerType: "NUMBER",
      correctAnswer: "12500",
      keyFormula: "v=√(2la)",
      hints: ["Подставьте v=150 и l=0,9 в формулу, возведите обе части в квадрат, чтобы избавиться от корня."],
      explanation: "150²=2·0,9·a ⟹ 22500=1,8a ⟹ a=12500.",
      difficulty: 1,
      egeTaskNumber: 9,
    },
    {
      id: stableId("p"),
      skillId: skCountFormula,
      text: "Два тела массой m=10 кг каждое движутся с одинаковой скоростью v=8 м/с под углом 2α друг к другу. Энергия (в джоулях), выделяющаяся при их абсолютно неупругом соударении, вычисляется по формуле Q=mv²sin²α. Найдите, под каким наименьшим углом 2α (в градусах) должны двигаться тела, чтобы в результате соударения выделилось энергии не менее 480 джоулей.",
      answerType: "NUMBER",
      correctAnswer: "120",
      keyFormula: "Q=mv²sin²α⩾480",
      hints: [
        "Подставьте данные в неравенство Q⩾480, выразите sin²α.",
        "Угол 2α лежит в [0°;180°], значит α∈[0°;90°], где sinα⩾0 — извлекать корень можно без модуля.",
      ],
      explanation: "10·8²·sin²α⩾480 ⟹ sin²α⩾3/4 ⟹ sinα⩾√3/2 ⟹ α⩾60°. Наименьший угол 2α=120°.",
      difficulty: 3,
      egeTaskNumber: 9,
    },
    {
      id: stableId("p"),
      skillId: skCountFormula,
      text: "На верфи инженеры проектируют аппарат кубической формы. Действующая на него выталкивающая (архимедова) сила вычисляется по формуле Fₐ=ρgl³, где ρ=1000 кг/м³ — плотность воды, g=9,8 Н/кг, l — длина ребра куба в метрах. Какой может быть максимальная длина ребра куба, чтобы выталкивающая сила при погружении была не больше чем 893025 Н? Ответ дайте в метрах.",
      answerType: "NUMBER",
      correctAnswer: "4.5",
      keyFormula: "ρgl³⩽893025",
      hints: [
        "Подставьте ρ и g в неравенство, выразите l³.",
        "Разложите 893025 на множители (используя признаки делимости на 9 и 25) — число красиво сократится.",
      ],
      explanation: "1000·9,8·l³⩽893025 ⟹ l³⩽(9/2)³ ⟹ l⩽4,5.",
      difficulty: 3,
      egeTaskNumber: 9,
    },
    {
      id: stableId("p"),
      skillId: skCountFormula,
      text: "Для определения эффективной температуры звёзд используют закон Стефана—Больцмана: P=σST⁴, где P — мощность излучения (Вт), σ=5,7·10⁻⁸ Вт/(м²·К⁴), S — площадь поверхности звезды (м²), T — температура (К). Площадь поверхности некоторой звезды равна (1/648)·10²⁰ м², а мощность излучения равна 1,824·10²⁶ Вт. Найдите температуру этой звезды в кельвинах.",
      answerType: "NUMBER",
      correctAnswer: "12000",
      keyFormula: "T⁴=P/(σS)",
      hints: ["Выразите T⁴ из формулы, подставьте данные и разложите получившееся большое число на множители по степеням."],
      explanation: "T⁴=1,824·10²⁶/(5,7·10⁻⁸·(1/648)·10²⁰)=2⁸·10¹²·3⁴ ⟹ T=2²·10³·3=12000.",
      difficulty: 3,
      egeTaskNumber: 9,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skCountFormula,
      text: "При адиабатическом процессе для идеального газа выполняется закон pV^(4/3)=8,1·10⁴ Па·м⁴, где p — давление в паскалях, V — объём в кубических метрах. Найдите объём V (в куб. м), который будет занимать газ при давлении p=6,25·10⁵ Па.",
      answerType: "NUMBER",
      correctAnswer: "0.216",
      keyFormula: "V^(4/3)=8,1·10⁴/p",
      hints: ["Подставьте p, выразите V^(4/3), затем возведите обе части в степень 3/4, чтобы найти V."],
      explanation: "V^(4/3)=8,1·10⁴/(6,25·10⁵)=(3/5)⁴ ⟹ V=(3/5)³=0,216.",
      difficulty: 2,
      egeTaskNumber: 9,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skCountFormula,
      text: "Наблюдатель находится на высоте h (в метрах). Расстояние до наблюдаемой линии горизонта (в километрах) вычисляется по формуле l=√(Rh)/500, где R=6400 км — радиус Земли. На какой высоте находится наблюдатель, если он видит горизонт на расстоянии 25,6 километра? Ответ дайте в метрах.",
      answerType: "NUMBER",
      correctAnswer: "51.2",
      keyFormula: "h=500l²/R",
      hints: ["Возведите обе части формулы в квадрат и выразите h напрямую."],
      explanation: "l²=Rh/500² ⟹ h=500l²/R=500·25,6²/6400=51,2.",
      difficulty: 2,
      egeTaskNumber: 9,
    },
    {
      id: stableId("p"),
      skillId: skCountFormula,
      text: "Двигаясь со скоростью v=4 м/с, трактор тащит сани с силой F=90 кН, направленной под острым углом α к горизонту. Мощность, развиваемая трактором, вычисляется по формуле N=Fv·cosα. Найдите угол α (в градусах), при котором мощность равна 180 кВт.",
      answerType: "NUMBER",
      correctAnswer: "60",
      keyFormula: "N=Fv·cosα",
      hints: ["Подставьте данные, выразите cosα — получится табличное значение."],
      explanation: "180=90·4·cosα ⟹ cosα=0,5 ⟹ α=60° (угол острый по условию).",
      difficulty: 1,
      egeTaskNumber: 9,
    },
    {
      id: stableId("p"),
      skillId: skCountFormula,
      text: "Мяч бросили под острым углом α к горизонту. Время полёта мяча (в секундах) определяется по формуле t=2v₀sinα/g. При каком значении угла α (в градусах) время полёта составит 3 секунды, если начальная скорость v₀=30 м/с, а g=10 м/с²?",
      answerType: "NUMBER",
      correctAnswer: "30",
      keyFormula: "t=2v₀sinα/g",
      hints: ["Подставьте все данные, выразите sinα — получится табличное значение."],
      explanation: "3=2·30·sinα/10 ⟹ sinα=0,5 ⟹ α=30° (угол острый по условию).",
      difficulty: 1,
      egeTaskNumber: 9,
      tier: "bank",
    }
  );

  // ---------------- Модуль: Текстовые и прикладные задачи (номер 10 ЕГЭ) ----------------
  const wordTopicId = stableId("t");
  db.topics.push({ id: wordTopicId, order: 6, title: "Текстовые и прикладные задачи" });

  // Глава 1: "Счётные задачи" (номер 9 — формула-подстановка) — та же
  // тема-предмет, что и текстовые задачи (номер 10), просто отдельная
  // глава внутри неё, как "Треугольники"/"Трапеция" внутри Планиметрии,
  // а не отдельный предмет. chCountMain и её навык/задачи уже объявлены
  // выше по файлу (см. "Модуль: Счётные задачи") — здесь только
  // привязываем к реальной теме, чтобы не сдвигать stableId() для
  // остального контента (Векторная геометрия идёт ниже).
  db.subtopics.push({ id: chCountMain, topicId: wordTopicId, order: 1, title: "Счётные задачи" });

  const chWordMain = stableId("s");
  db.subtopics.push({ id: chWordMain, topicId: wordTopicId, order: 2, title: "Текстовые задачи" });

  const skWordMotion = stableId("sk");
  const skWordWaterWork = stableId("sk");
  const skWordMixtures = stableId("sk");

  db.skills.push({
    id: skWordMotion,
    subtopicId: chWordMain,
    order: 1,
    title: "Задачи на движение",
    theoryCards: [
      {
        title: "Основная формула",
        formula: "S = v·t",
        body: "Расстояние = скорость × время. Отсюда v=S/t и t=S/v. Следите, чтобы единицы измерения были согласованы (например, если скорость в км/ч, а время дано в минутах — переведите в часы).",
      },
      {
        title: "Сближение, удаление, погоня",
        body: "Если два объекта едут НАВСТРЕЧУ друг другу — их скорость сближения равна СУММЕ скоростей. Если едут в РАЗНЫЕ стороны от общей точки — скорость удаления тоже равна сумме скоростей. Если один ДОГОНЯЕТ другого (едут в одну сторону) — скорость сближения равна РАЗНОСТИ скоростей (большая минус меньшая).",
      },
      {
        title: "Таблица — главный инструмент",
        body: "Заведите таблицу со столбцами скорость/время/расстояние и одной строкой на каждый участок движения. Заполняйте её по формуле S=v·t, а затем используйте связи между участками (общее время, общее расстояние, разница во времени) — это почти всегда даёт уравнение для нахождения неизвестной.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skWordMotion,
      text: "Два велосипедиста одновременно отправляются в 190-километровый пробег. Первый едет со скоростью на 9 км/ч большей, чем второй, и прибывает к финишу на 9 часов раньше второго. Найдите скорость велосипедиста, пришедшего к финишу первым. Ответ дайте в км/ч.",
      answerType: "NUMBER",
      correctAnswer: "19",
      keyFormula: "190/x − 190/(x+9) = 9",
      hints: [
        "Обозначьте скорость второго (медленного) велосипедиста за x, тогда скорость первого — x+9.",
        "Время каждого — 190/скорость. Разница времён равна 9 часам.",
      ],
      explanation: "190/x−190/(x+9)=9 ⟹ x²+9x−190=0 ⟹ x=10 (второй отрицательный корень не подходит). Скорость первого: 10+9=19 км/ч.",
      difficulty: 2,
      egeTaskNumber: 10,
    },
    {
      id: stableId("p"),
      skillId: skWordMotion,
      text: "Дорога между пунктами A и B состоит из подъёма и спуска, а её длина равна 36 км. Путь из A в B занял у туриста 10 часов, из которых 2 часа ушло на спуск. Найдите скорость туриста на спуске, если она больше скорости на подъёме на 3 км/ч. Ответ дайте в км/ч.",
      answerType: "NUMBER",
      correctAnswer: "6",
      keyFormula: "8x + 2(x+3) = 36",
      hints: ["На подъём ушло 10−2=8 часов. Обозначьте скорость на подъёме за x, распишите расстояние каждого участка через S=v·t."],
      explanation: "8x+2(x+3)=36 ⟹ 10x+6=36 ⟹ x=3. Скорость на спуске: 3+3=6 км/ч.",
      difficulty: 1,
      egeTaskNumber: 10,
    },
    {
      id: stableId("p"),
      skillId: skWordMotion,
      text: "Велосипедист выехал с постоянной скоростью из города A в город B, расстояние между которыми равно 105 км. На следующий день он отправился обратно со скоростью на 7 км/ч больше прежней, сделав по дороге остановку на 4 часа. В результате он затратил на обратный путь столько же времени, сколько на путь из A в B. Найдите скорость велосипедиста на пути из B в A. Ответ дайте в км/ч.",
      answerType: "NUMBER",
      correctAnswer: "17.5",
      keyFormula: "105/(x−7) = 105/x + 4",
      hints: ["Обозначьте скорость на ОБРАТНОМ пути (то, что нужно найти) за x — тогда скорость туда была x−7."],
      explanation: "105/(x−7)=105/x+4 ⟹ 4x²−28x−735=0 ⟹ x=17,5 (второй корень отрицательный).",
      difficulty: 3,
      egeTaskNumber: 10,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skWordMotion,
      text: "Два поезда движутся навстречу друг другу — один со скоростью 70 км/ч, другой со скоростью 80 км/ч. Пассажир, сидящий во втором поезде, заметил, что первый поезд прошёл мимо него за 12 секунд. Какова длина первого поезда? Ответ дайте в метрах.",
      answerType: "NUMBER",
      correctAnswer: "500",
      keyFormula: "S = (v₁+v₂)·t",
      hints: [
        "Перейдите в систему отсчёта пассажира — тогда скорость первого поезда относительно него равна сумме скоростей 70+80=150 км/ч.",
        "Переведите скорость в м/с перед умножением на время в секундах.",
      ],
      explanation: "Относительная скорость: 150 км/ч=41,67 м/с (точно 150000/3600). Длина: (150000/3600)·12=500 м.",
      difficulty: 2,
      egeTaskNumber: 10,
    },
    {
      id: stableId("p"),
      skillId: skWordMotion,
      text: "Удав ползёт равномерно со скоростью 1,5 км/ч. Он полностью проползает мимо здания длиной 20 метров за 1 минуту. Найдите длину удава в метрах.",
      answerType: "NUMBER",
      correctAnswer: "5",
      keyFormula: "S_удава = v·t − S_здания",
      hints: ["Голова удава за это время преодолевает расстояние, равное (длина удава + длина здания)."],
      explanation: "Скорость 1,5 км/ч=25 м/мин. За 1 минуту голова прошла 25 м, из них 20 м — это здание, значит длина удава: 25−20=5.",
      difficulty: 1,
      egeTaskNumber: 10,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skWordWaterWork,
    subtopicId: chWordMain,
    order: 2,
    title: "Движение по воде. Работа и производительность",
    theoryCards: [
      {
        title: "Движение по течению и против течения",
        formula: "v_по течению = v_собств + v_теч;  v_против = v_собств − v_теч",
        body: "Собственная скорость лодки (или пловца) складывается со скоростью течения, если движение ПО течению, и вычитается, если движение ПРОТИВ течения. Скорость плота (или любого объекта без своего двигателя) считается равной скорости течения.",
      },
      {
        title: "Работа и производительность",
        formula: "A = p·t",
        body: "Работа = производительность × время, полная аналогия с движением (работа↔расстояние, производительность↔скорость). Если работают вместе — производительности СКЛАДЫВАЮТСЯ. Если работу не задали числом — примите её за 1 (единицу), это не повлияет на ответ, так как в итоговом уравнении она сократится.",
      },
      {
        title: "Система уравнений при нескольких парах",
        body: "Если известна производительность НЕСКОЛЬКИХ пар работников (например, «А и Б вместе», «Б и В вместе», «В и А вместе»), сложите все три данных уравнения — получится удвоенная сумма всех трёх производительностей, откуда легко найти совместную работу втроём.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skWordWaterWork,
      text: "Моторная лодка прошла против течения реки 153 км и вернулась в пункт отправления, затратив на обратный путь на 8 часов меньше. Найдите скорость лодки в неподвижной воде, если скорость течения равна 4 км/ч. Ответ дайте в км/ч.",
      answerType: "NUMBER",
      correctAnswer: "13",
      keyFormula: "153/(x−4) = 153/(x+4) + 8",
      hints: ["Обозначьте собственную скорость лодки за x. Против течения скорость x−4, по течению x+4."],
      explanation: "153/(x−4)=153/(x+4)+8 ⟹ x²=169 ⟹ x=13 (отрицательный корень не подходит).",
      difficulty: 2,
      egeTaskNumber: 10,
    },
    {
      id: stableId("p"),
      skillId: skWordWaterWork,
      text: "Расстояние между пристанями A и B равно 144 км. Из A в B по течению реки отправился плот, а через 1 час вслед за ним отправилась яхта, которая, прибыв в пункт B, тотчас повернула обратно и возвратилась в A. К этому времени плот проплыл 18 км. Найдите скорость яхты в неподвижной воде, если скорость течения реки равна 1 км/ч. Ответ дайте в км/ч.",
      answerType: "NUMBER",
      correctAnswer: "17",
      keyFormula: "144/(x−1) + 144/(x+1) = 17",
      hints: [
        "Скорость плота равна скорости течения (1 км/ч) — через время t=18/1=18 часов он проплыл 18 км.",
        "Яхта вышла на час позже, значит потратила на весь путь (туда и обратно) 18−1=17 часов.",
      ],
      explanation: "144/(x−1)+144/(x+1)=17 ⟹ 17x²−288x−17=0 ⟹ x=17 (второй корень отрицательный).",
      difficulty: 3,
      egeTaskNumber: 10,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skWordWaterWork,
      text: "Один маляр может покрасить забор за 2 часа, а второй маляр тот же забор — за 3 часа. За сколько часов маляры покрасят такой же забор, работая вместе?",
      answerType: "NUMBER",
      correctAnswer: "1.2",
      keyFormula: "t = 1/(p₁+p₂)",
      hints: ["Найдите, какую долю забора красит каждый маляр за час (1/время), сложите производительности."],
      explanation: "За час вместе красят 1/2+1/3=5/6 забора. Время на весь забор: 1:(5/6)=1,2 часа.",
      difficulty: 1,
      egeTaskNumber: 10,
    },
    {
      id: stableId("p"),
      skillId: skWordWaterWork,
      text: "Катя и Настя, работая вместе, пропалывают грядку за 24 минуты, а одна Настя — за 42 минуты. За сколько минут пропалывает грядку одна Катя?",
      answerType: "NUMBER",
      correctAnswer: "56",
      keyFormula: "p_Кати = p_вместе − p_Насти",
      hints: ["Производительность Кати — это разность производительности вместе и производительности одной Насти."],
      explanation: "p_Кати=1/24−1/42=1/56. Значит Катя одна пропалывает грядку за 56 минут.",
      difficulty: 2,
      egeTaskNumber: 10,
    },
    {
      id: stableId("p"),
      skillId: skWordWaterWork,
      text: "Игорь и Паша красят весь забор за 9 часов. Паша и Володя красят этот же забор за 12 часов, а Володя и Игорь — за 18 часов. За сколько часов мальчики покрасят забор, работая втроём?",
      answerType: "NUMBER",
      correctAnswer: "8",
      keyFormula: "2(p_И+p_П+p_В) = 1/9+1/12+1/18",
      hints: ["Сложите все три данных уравнения — слева получится удвоенная сумма всех трёх производительностей."],
      explanation: "Сумма трёх уравнений: 2(p_И+p_П+p_В)=1/9+1/12+1/18=1/4, значит p_И+p_П+p_В=1/8. Время втроём: 8 часов.",
      difficulty: 3,
      egeTaskNumber: 10,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skWordMixtures,
    subtopicId: chWordMain,
    order: 3,
    title: "Растворы, сплавы, смеси",
    theoryCards: [
      {
        title: "Формула концентрации",
        formula: "k = m/M,  m = M·k",
        body: "m — масса вещества, M — масса всего раствора (сплава, смеси), k — концентрация в виде дроби. Если концентрация дана в процентах, разделите на 100, чтобы получить дробь (например, 32%→0,32).",
      },
      {
        title: "Таблица — как и в задачах на движение",
        body: "Столбцы: концентрация / масса раствора / масса вещества. При смешивании двух растворов: масса итогового раствора = сумма масс исходных (M=M₁+M₂), масса вещества в итоговом растворе = сумма масс вещества в исходных (m=m₁+m₂).",
      },
      {
        title: "Смешивание РАВНЫХ масс — полезный факт",
        formula: "k = (k₁+k₂)/2",
        body: "Если смешивают два раствора ОДИНАКОВОЙ массы с концентрациями k₁ и k₂, концентрация смеси равна их среднему арифметическому — не зависит от самой массы, только от концентраций.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skWordMixtures,
      text: "Смешали 15-процентный раствор некоторого вещества с 25-процентным раствором этого же вещества, причём по массе растворы были взяты в отношении 3:2. Сколько процентов составляет концентрация получившегося раствора?",
      answerType: "NUMBER",
      correctAnswer: "19",
      keyFormula: "k = (m₁+m₂)/(M₁+M₂)",
      hints: [
        "Обозначьте массу первого раствора за 3x, второго — за 2x (по данному отношению).",
        "Найдите массу вещества в каждом растворе через m=M·k, сложите, разделите на суммарную массу.",
      ],
      explanation: "m=3x·0,15+2x·0,25=0,95x; M=5x. k=0,95x/5x=0,19=19%.",
      difficulty: 2,
      egeTaskNumber: 10,
    },
    {
      id: stableId("p"),
      skillId: skWordMixtures,
      text: "Имеется два сосуда. Первый содержит 30 кг, а второй — 20 кг раствора кислоты различной концентрации. Если эти растворы смешать, то получится раствор, содержащий 68% кислоты. Если же смешать РАВНЫЕ массы этих растворов, то получится раствор, содержащий 70% кислоты. Сколько килограммов кислоты содержится в первом сосуде?",
      answerType: "NUMBER",
      correctAnswer: "18",
      keyFormula: "k₁+k₂=1,4;  30k₁+20k₂=34",
      hints: [
        "Смешивание РАВНЫХ масс даёт среднее арифметическое концентраций: (k₁+k₂)/2=0,7.",
        "Смешивание исходных масс (30 и 20 кг) даёт второе уравнение через массы вещества: 30k₁+20k₂=50·0,68.",
        "Решите систему из двух линейных уравнений относительно k₁ и k₂.",
      ],
      explanation: "Система k₁+k₂=1,4 и 30k₁+20k₂=34 даёт k₁=0,6. Масса кислоты в первом сосуде: 30·0,6=18 кг.",
      difficulty: 3,
      egeTaskNumber: 10,
      tier: "bank",
    }
  );

  // ---------------- Модуль: Векторная геометрия (номер 2 ЕГЭ) ----------------
  const vecTopicId = stableId("t");
  db.topics.push({ id: vecTopicId, order: 7, title: "Векторная геометрия" });

  const chVecMain = stableId("s");
  db.subtopics.push({ id: chVecMain, topicId: vecTopicId, order: 1, title: "Векторы" });

  const skVecOps = stableId("sk");
  const skVecOnGrid = stableId("sk");

  db.skills.push({
    id: skVecOps,
    subtopicId: chVecMain,
    order: 1,
    title: "Действия с векторами через координаты",
    theoryCards: [
      {
        title: "Сложение, вычитание, умножение на число",
        formula: "a→(x₁;y₁)±b→(x₂;y₂) = (x₁±x₂; y₁±y₂);  k·a→(x;y) = (kx; ky)",
        body: "Координаты суммы/разности векторов складываются/вычитаются покоординатно. При умножении вектора на число k — каждая координата умножается на k.",
      },
      {
        title: "Длина вектора",
        formula: "|a→| = √(x²+y²)",
        body: "Длина вектора по его координатам находится по теореме Пифагора — как расстояние от начала координат до точки (x;y).",
      },
      {
        title: "Скалярное произведение через координаты",
        formula: "a→·b→ = x₁x₂ + y₁y₂",
        body: "Скалярное произведение — сумма произведений соответствующих координат. Если a→·b→=0, векторы перпендикулярны.",
      },
      {
        title: "Угол между векторами",
        formula: "cos φ = (a→·b→) / (|a→|·|b→|)",
        body: "Косинус угла между векторами — это скалярное произведение, делённое на произведение их длин. Найдя косинус, определите сам угол (обычно табличное значение).",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skVecOps,
      text: "Даны векторы a→(17;0) и b→(1;−1). Найдите длину вектора a→−12b→.",
      answerType: "NUMBER",
      correctAnswer: "13",
      keyFormula: "|a→−12b→| = √(x²+y²)",
      hints: ["Найдите координаты вектора a→−12b→ покоординатно, затем примените формулу длины."],
      explanation: "a→−12b→=(17−12;0+12)=(5;12). Длина: √(25+144)=√169=13.",
      difficulty: 1,
      egeTaskNumber: 2,
    },
    {
      id: stableId("p"),
      skillId: skVecOps,
      text: "Даны векторы a→(3;3), b→(7;8) и c→(13;29). Найдите сумму координат вектора a→+b→−c→.",
      answerType: "NUMBER",
      correctAnswer: "-21",
      hints: ["Найдите координаты вектора r→=a→+b→−c→ покоординатно, затем сложите обе координаты."],
      explanation: "r→=(3+7−13;3+8−29)=(−3;−18). Сумма координат: −3+(−18)=−21.",
      difficulty: 1,
      egeTaskNumber: 2,
    },
    {
      id: stableId("p"),
      skillId: skVecOps,
      text: "Даны векторы a→(5;−7) и b→(14;1). Найдите скалярное произведение a→·b→.",
      answerType: "NUMBER",
      correctAnswer: "63",
      keyFormula: "a→·b→ = x₁x₂+y₁y₂",
      hints: ["Перемножьте соответствующие координаты и сложите результаты."],
      explanation: "a→·b→=5·14+(−7)·1=70−7=63.",
      difficulty: 1,
      egeTaskNumber: 2,
    },
    {
      id: stableId("p"),
      skillId: skVecOps,
      text: "Даны векторы a→(5;3) и b→(4;−6). Найдите скалярное произведение a→·b→.",
      answerType: "NUMBER",
      correctAnswer: "2",
      hints: ["Перемножьте соответствующие координаты и сложите результаты."],
      explanation: "a→·b→=5·4+3·(−6)=20−18=2.",
      difficulty: 1,
      egeTaskNumber: 2,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skVecOps,
      text: "Даны векторы a→(1;2), b→(3;−6) и c→(4;−3). Найдите скалярное произведение (a→+b→)·c→.",
      answerType: "NUMBER",
      correctAnswer: "28",
      hints: ["Сначала найдите координаты вектора a→+b→, затем примените формулу скалярного произведения с c→."],
      explanation: "a→+b→=(1+3;2−6)=(4;−4). (a→+b→)·c→=4·4+(−4)·(−3)=16+12=28.",
      difficulty: 2,
      egeTaskNumber: 2,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skVecOps,
      text: "Даны векторы a→(5/3;5) и b→(4;2). Найдите угол между векторами a→ и b→. Ответ дайте в градусах.",
      answerType: "NUMBER",
      correctAnswer: "45",
      keyFormula: "cos φ = (a→·b→)/(|a→|·|b→|)",
      hints: [
        "Найдите скалярное произведение и длины обоих векторов отдельно, затем подставьте в формулу косинуса угла.",
      ],
      explanation: "a→·b→=(5/3)·4+5·2=50/3. |a→|=5√10/3, |b→|=2√5. cosφ=(50/3)/((5√10/3)·2√5)=√2/2 ⟹ φ=45°.",
      difficulty: 3,
      egeTaskNumber: 2,
    }
  );

  db.skills.push({
    id: skVecOnGrid,
    subtopicId: chVecMain,
    order: 2,
    title: "Векторы на координатной плоскости",
    theoryCards: [
      {
        title: "Как снять координаты вектора с рисунка",
        formula: "AB→(x₂−x₁; y₂−y₁)",
        body: "Если вектор изображён стрелкой от точки A(x₁;y₁) до точки B(x₂;y₂), его координаты — это координаты конца минус координаты начала. Считайте по клеткам сетки: сколько клеток вправо/влево (x) и вверх/вниз (y) нужно пройти от начала стрелки до её конца.",
      },
      {
        title: "Дальше — как обычно",
        body: "После того как считали координаты векторов с рисунка, дальше действуйте как в вычислительных задачах: складывайте/вычитайте покоординатно, находите длину через √(x²+y²), скалярное произведение через x₁x₂+y₁y₂.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skVecOnGrid,
      text: "На координатной плоскости изображены векторы a→, b→ и c→. Найдите длину вектора a→+b→+c→.",
      answerType: "NUMBER",
      correctAnswer: "0",
      diagram: {
        kind: "vectorPlane",
        range: 6,
        vectors: [
          { from: [0, 0], to: [1, 2], label: "a", color: "pine" },
          { from: [0, 0], to: [4, 0], label: "b", color: "pine" },
          { from: [0, 0], to: [-5, -2], label: "c", color: "amber" },
        ],
      },
      hints: [
        "Считайте координаты каждого вектора по клеткам сетки от начала координат: a→(1;2), b→(4;0), c→(−5;−2).",
        "Сложите координаты всех трёх векторов покоординатно.",
      ],
      explanation: "a→+b→+c→=(1+4−5;2+0−2)=(0;0) — нулевой вектор. Его длина равна 0.",
      difficulty: 2,
      egeTaskNumber: 2,
    },
    {
      id: stableId("p"),
      skillId: skVecOnGrid,
      text: "На координатной плоскости изображены векторы a→ и b→. Найдите длину вектора a→−b→.",
      answerType: "NUMBER",
      correctAnswer: "6.5",
      diagram: {
        kind: "vectorPlane",
        range: 6,
        vectors: [
          { from: [0, 0], to: [2, 3], label: "a", color: "pine" },
          { from: [0, 0], to: [-4, 0.5], label: "b", color: "amber" },
        ],
      },
      hints: [
        "Считайте координаты векторов по клеткам: a→(2;3), b→(−4;0,5).",
        "Найдите разность покоординатно, затем длину получившегося вектора.",
      ],
      explanation: "a→−b→=(2−(−4);3−0,5)=(6;2,5). Длина: √(36+6,25)=√42,25=6,5.",
      difficulty: 2,
      egeTaskNumber: 2,
    },
    {
      id: stableId("p"),
      skillId: skVecOnGrid,
      text: "На координатной плоскости изображены векторы a→ и b→, координаты которых являются целыми числами. Найдите длину вектора a→+3b→.",
      answerType: "NUMBER",
      correctAnswer: "8",
      diagram: {
        kind: "vectorPlane",
        range: 6,
        vectors: [
          { from: [0, 0], to: [2, 3], label: "a", color: "pine" },
          { from: [0, 0], to: [2, -1], label: "b", color: "amber" },
        ],
      },
      hints: ["Считайте координаты векторов по клеткам: a→(2;3), b→(2;−1).", "Умножьте b→ на 3, затем сложите с a→ покоординатно."],
      explanation: "a→+3b→=(2+6;3−3)=(8;0). Длина: √(64+0)=8.",
      difficulty: 2,
      egeTaskNumber: 2,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skVecOnGrid,
      text: "На координатной плоскости изображены векторы a→ и b→. Найдите скалярное произведение этих векторов.",
      answerType: "NUMBER",
      correctAnswer: "56",
      diagram: {
        kind: "vectorPlane",
        range: 6,
        vectors: [
          { from: [2, 3], to: [-2, -6], label: "a", color: "pine" },
          { from: [3, 2], to: [-2, -2], label: "b", color: "amber" },
        ],
      },
      hints: [
        "Вектор из точки в точку — это координаты конца минус координаты начала.",
        "Считайте координаты обоих векторов по клеткам, затем перемножьте соответствующие координаты и сложите.",
      ],
      explanation: "a→=(−4;−9), b→=(−5;−4). Скалярное произведение: (−4)·(−5)+(−9)·(−4)=20+36=56.",
      difficulty: 3,
      egeTaskNumber: 2,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skVecOnGrid,
      text: "На координатной плоскости изображены векторы a→ и b→. Найдите скалярное произведение этих векторов.",
      answerType: "NUMBER",
      correctAnswer: "12",
      diagram: {
        kind: "vectorPlane",
        range: 6,
        vectors: [
          { from: [-3, -2], to: [1, 4], label: "a", color: "pine" },
          { from: [1, 4], to: [7, 2], label: "b", color: "amber" },
        ],
      },
      hints: ["Считайте координаты векторов по клеткам как (конец минус начало): a→(4;6), b→(6;−2)."],
      explanation: "Скалярное произведение: 4·6+6·(−2)=24−12=12.",
      difficulty: 2,
      egeTaskNumber: 2,
      tier: "bank",
    }
  );

  // ---------------- Модуль: Стереометрия (номер 3 ЕГЭ) ----------------
  const stereoTopicId = stableId("t");
  db.topics.push({ id: stereoTopicId, order: 8, title: "Стереометрия" });

  const chStereoMain = stableId("s");
  db.subtopics.push({ id: chStereoMain, topicId: stereoTopicId, order: 1, title: "Многогранники" });

  const chStereoRevolution = stableId("s");
  db.subtopics.push({ id: chStereoRevolution, topicId: stereoTopicId, order: 2, title: "Тела вращения" });

  const skBox = stableId("sk");
  const skPrism = stableId("sk");
  const skPyramid = stableId("sk");
  const skRevolution = stableId("sk");
  const skInscribed = stableId("sk");

  db.skills.push({
    id: skBox,
    subtopicId: chStereoMain,
    order: 1,
    title: "Параллелепипед",
    theoryCards: [
      {
        title: "Прямоугольный параллелепипед",
        formula: "d = √(a²+b²+c²);  V = abc;  Sп = 2(ab+bc+ac)",
        body: "Все грани — прямоугольники. Диагональ d находится через теорему Пифагора в пространстве (все три измерения одновременно). Volume — произведение трёх измерений, площадь поверхности — сумма площадей трёх пар граней, умноженная на 2.",
      },
      {
        title: "Куб",
        formula: "d = a√3;  V = a³;  Sп = 6a²",
        body: "Прямоугольный параллелепипед, у которого все рёбра равны. Все грани — равные квадраты.",
      },
      {
        title: "Угол между скрещивающимися прямыми",
        body: "Чтобы найти угол между скрещивающимися прямыми, выполните параллельный перенос: проведите через одну из прямых прямую, параллельную другой. Угол между пересекающимися прямыми, полученными таким образом, и есть искомый (по определению — не тупой, от 0° до 90°).",
      },
      {
        title: "Метод множителей для объёма части параллелепипеда",
        body: "Если нужно найти объём многогранника, отсечённого от параллелепипеда/куба (пирамиды, призмы из части вершин) — сравните формулу объёма части с формулой объёма всего тела: часто высота остаётся общей, а меняется только множитель, связанный с площадью основания (например, отношение подобных треугольников в квадрате).",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skBox,
      text: "В прямоугольном параллелепипеде ABCDA₁B₁C₁D₁ известно, что CC₁=9, AB=2, B₁C₁=6. Найдите длину диагонали BD₁.",
      answerType: "NUMBER",
      correctAnswer: "11",
      diagram: { kind: "box" },
      keyFormula: "d = √(a²+b²+c²)",
      hints: ["Диагональ параллелепипеда находится через теорему Пифагора сразу по трём измерениям — не нужно искать промежуточные диагонали граней."],
      explanation: "BD₁²=CC₁²+AB²+B₁C₁²=9²+2²+6²=121 ⟹ BD₁=11.",
      difficulty: 1,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skBox,
      text: "В кубе ABCDA₁B₁C₁D₁ найдите угол между прямыми CD₁ и BC₁. Ответ дайте в градусах.",
      answerType: "NUMBER",
      correctAnswer: "60",
      diagram: { kind: "box", isCube: true },
      hints: [
        "Проведите AD₁ параллельно BC₁ — тогда искомый угол равен углу AD₁C.",
        "Стороны треугольника AD₁C — диагонали равных квадратных граней куба, значит треугольник равносторонний.",
      ],
      explanation: "AD₁∥BC₁, значит угол(BC₁,CD₁)=угол AD₁C. Треугольник AD₁C равносторонний (стороны — диагонали равных граней), все углы по 60°.",
      difficulty: 2,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skBox,
      text: "В прямоугольном параллелепипеде ABCDA₁B₁C₁D₁ известны длины рёбер: AB=9, AD=12, AA₁=9. Найдите синус угла между прямыми DD₁ и B₁C.",
      answerType: "NUMBER",
      correctAnswer: "0.8",
      diagram: { kind: "box" },
      hints: [
        "DD₁ параллельна BB₁ — значит искомый угол равен углу BB₁C.",
        "Найдите B₁C через теорему Пифагора в прямоугольном треугольнике BB₁C, затем sin как отношение противолежащего катета к гипотенузе.",
      ],
      explanation: "DD₁∥BB₁, угол(DD₁,B₁C)=угол BB₁C. B₁C=√(BC²+BB₁²)=√(144+81)=15. sin=BC/B₁C=12/15=0,8.",
      difficulty: 2,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skBox,
      text: "В прямоугольном параллелепипеде ABCDA₁B₁C₁D₁ известно, что AB=9, BC=7, AA₁=6. Найдите объём многогранника, вершинами которого являются точки A, B, C, B₁.",
      answerType: "NUMBER",
      correctAnswer: "63",
      diagram: { kind: "box" },
      keyFormula: "V = (1/3)·Sосн·h",
      hints: ["Это треугольная пирамида с прямоугольным треугольником ABC в основании и высотой BB₁."],
      explanation: "V=(1/3)·(1/2·AB·BC)·BB₁=(1/6)·9·7·6=63.",
      difficulty: 2,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skBox,
      text: "Найдите объём многогранника, вершинами которого являются вершины A, B, C, D, B₁ прямоугольного параллелепипеда ABCDA₁B₁C₁D₁, у которого AB=2, BC=5, BB₁=3.",
      answerType: "NUMBER",
      correctAnswer: "10",
      diagram: { kind: "box" },
      hints: ["Это пирамида с прямоугольником ABCD в основании и высотой BB₁."],
      explanation: "V=(1/3)·Sосн·h=(1/3)·AB·BC·BB₁=(1/3)·2·5·3=10.",
      difficulty: 2,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skBox,
      text: "В прямоугольном параллелепипеде ABCDA₁B₁C₁D₁ известно, что AB=6, BC=5, AA₁=4. Найдите объём многогранника, вершинами которого являются точки A, B, C, D, A₁, B₁.",
      answerType: "NUMBER",
      correctAnswer: "60",
      diagram: { kind: "box" },
      hints: ["Этот многогранник — ровно половина параллелепипеда (треугольная призма ADA₁BCB₁)."],
      explanation: "V=(1/2)·AB·BC·AA₁=(1/2)·6·5·4=60.",
      difficulty: 2,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skBox,
      text: "Объём куба равен 24. Найдите объём треугольной призмы, отсекаемой от куба плоскостью, проходящей через середины двух рёбер, выходящих из одной вершины, и параллельной третьему ребру, выходящему из этой же вершины.",
      answerType: "NUMBER",
      correctAnswer: "3",
      hints: [
        "Высота отсекаемой призмы совпадает с высотой куба (как призмы) — сравнивайте только площади оснований.",
        "Отсекающая плоскость через середины рёбер даёт треугольник, подобный основанию куба с коэффициентом 1/2.",
      ],
      explanation: "Площадь отсечённого треугольника — 1/4 от половины квадрата (подобие с коэффициентом 1/2 в квадрате, и сам треугольник — половина грани), то есть 1/8 от объёма куба: V=24/8=3.",
      difficulty: 3,
      egeTaskNumber: 3,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skPrism,
    subtopicId: chStereoMain,
    order: 2,
    title: "Призма",
    theoryCards: [
      {
        title: "Объём и площадь боковой поверхности призмы",
        formula: "V = Sосн·h;  Sбок = Pосн·h (для прямой призмы)",
        body: "h — высота призмы (расстояние между плоскостями оснований, а НЕ длина бокового ребра, если призма наклонная). Для ПРЯМОЙ призмы высота равна боковому ребру, а боковая поверхность — периметр основания на высоту.",
      },
      {
        title: "Правильная треугольная призма",
        body: "Прямая призма, в основании которой лежит правильный (равносторонний) треугольник.",
      },
      {
        title: "Метод множителей — снова",
        body: "Та же техника, что и для параллелепипеда: если плоскость проходит через СРЕДНЮЮ ЛИНИЮ основания призмы (параллельно боковой грани или ребру), высота отсечённой и исходной призмы совпадает — сравнивайте только площади оснований. Средняя линия отсекает треугольник, подобный исходному с коэффициентом 1/2, значит площадь меньше в 4 раза.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skPrism,
      diagram: { kind: "triangularPrism" },
      text: "Площадь боковой поверхности треугольной призмы равна 36. Через среднюю линию основания этой призмы проведена плоскость, параллельная боковой грани. Найдите площадь боковой поверхности отсечённой треугольной призмы.",
      answerType: "NUMBER",
      correctAnswer: "18",
      hints: ["Каждая боковая грань отсечённой призмы — параллелограмм с той же высотой, но основанием вдвое меньше (средняя линия) — значит и площадь вдвое меньше."],
      explanation: "Средняя линия делит каждую сторону пополам — каждая боковая грань отсечённой призмы вдвое меньше по площади. Sотс=(1/2)·36=18.",
      difficulty: 2,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skPrism,
      diagram: { kind: "triangularPrism" },
      text: "Через среднюю линию основания треугольной призмы проведена плоскость, параллельная боковому ребру. Объём отсечённой треугольной призмы равен 5. Найдите объём исходной призмы.",
      answerType: "NUMBER",
      correctAnswer: "20",
      keyFormula: "метод множителей: площади отличаются в 4 раза",
      hints: ["Высоты отсечённой и исходной призмы совпадают. Средняя линия отсекает треугольник, подобный исходному с коэффициентом 1/2 — площадь меньше в 4 раза."],
      explanation: "Sосн исходного треугольника в 4 раза больше отсечённого (подобие с k=1/2 даёт отношение площадей k²=1/4). V=4·5=20.",
      difficulty: 2,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skPrism,
      diagram: { kind: "triangularPrism" },
      text: "Через среднюю линию основания правильной треугольной призмы, объём которой равен 84, проведена плоскость, параллельная боковому ребру. Найдите объём отсечённой треугольной призмы.",
      answerType: "NUMBER",
      correctAnswer: "21",
      hints: ["Та же логика, что и в предыдущей задаче, только в обратную сторону — площадь отсечённого треугольника в 4 раза МЕНЬШЕ исходного."],
      explanation: "V=84/4=21.",
      difficulty: 1,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skPrism,
      diagram: { kind: "triangularPrism" },
      text: "Найдите объём многогранника, вершинами которого являются вершины A, B, C, B₁ правильной треугольной призмы ABCA₁B₁C₁, площадь основания которой равна 6, а боковое ребро равно 8.",
      answerType: "NUMBER",
      correctAnswer: "16",
      hints: ["Это треугольная пирамида с основанием ABC и высотой, равной боковому ребру призмы (так как призма правильная — прямая)."],
      explanation: "V=(1/3)·Sосн·h=(1/3)·6·8=16.",
      difficulty: 2,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skPrism,
      diagram: { kind: "triangularPrism" },
      text: "Найдите объём многогранника, вершинами которого являются вершины A, C, A₁, B₁ правильной треугольной призмы ABCA₁B₁C₁. Площадь основания призмы равна 9, боковое ребро равно 4.",
      answerType: "NUMBER",
      correctAnswer: "12",
      hints: ["Рассмотрите этот многогранник как пирамиду с основанием AA₁B₁ и вершиной C — её объём равен объёму пирамиды с основанием ABC и той же вершиной C (площади оснований равны)."],
      explanation: "V=VAA₁BC=(1/3)·Sосн·h=(1/3)·9·4=12.",
      difficulty: 3,
      egeTaskNumber: 3,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skPyramid,
    subtopicId: chStereoMain,
    order: 3,
    title: "Пирамида",
    theoryCards: [
      {
        title: "Объём пирамиды",
        formula: "V = (1/3)·Sосн·h",
        body: "h — высота пирамиды, расстояние от вершины до плоскости основания (не длина бокового ребра, если пирамида не прямая).",
      },
      {
        title: "Правильная четырёхугольная пирамида",
        body: "Основание — квадрат, все боковые рёбра равны, высота падает точно в центр основания O. Диагонали квадрата в основании делятся точкой O пополам — это часто даёт прямоугольный треугольник (SO⊥основание) для применения теоремы Пифагора.",
      },
      {
        title: "Метод множителей для пирамиды",
        body: "Та же техника: если сравниваете объём части пирамиды (например, отсечённой средней линией основания, или с вершиной в середине бокового ребра) с объёмом всей пирамиды — ищите, во сколько раз отличаются площадь основания и высота по отдельности, затем перемножьте эти отношения.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skPyramid,
      text: "В правильной четырёхугольной пирамиде SABCD точка O — центр основания, S — вершина, SO=48, SC=80. Найдите длину отрезка BD.",
      answerType: "NUMBER",
      correctAnswer: "128",
      diagram: { kind: "pyramid", showCenter: true },
      keyFormula: "OC² = SC² − SO²",
      hints: [
        "SOC — прямоугольный треугольник (SO — высота, перпендикулярна основанию). Найдите OC по теореме Пифагора.",
        "O — центр квадрата ABCD, значит OB=OC (обе половины диагонали BD).",
      ],
      explanation: "OC²=80²−48²=6400−2304=4096 ⟹ OC=64. BD=2·OC=128 (O делит диагональ пополам).",
      difficulty: 2,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skPyramid,
      text: "Объём треугольной пирамиды равен 78. Через вершину пирамиды и среднюю линию её основания проведена плоскость. Найдите объём отсечённой треугольной пирамиды.",
      answerType: "NUMBER",
      correctAnswer: "19.5",
      hints: ["Высоты исходной и отсечённой пирамиды совпадают (общая вершина). Средняя линия отсекает треугольник с площадью в 4 раза меньше исходного."],
      explanation: "V=78/4=19,5.",
      difficulty: 2,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skPyramid,
      text: "В правильной четырёхугольной пирамиде SABCD с основанием ABCD боковое ребро SC равно 17, сторона основания равна 15√2. Найдите объём пирамиды.",
      answerType: "NUMBER",
      correctAnswer: "1200",
      diagram: { kind: "pyramid", showCenter: true },
      hints: [
        "Найдите диагональ квадрата AC через теорему Пифагора для стороны основания, затем половину диагонали AO.",
        "SO найдите через теорему Пифагора в треугольнике AOS (SO⊥AO, гипотенуза SA=SC=17).",
      ],
      explanation: "AC²=2·(15√2)²=900 ⟹ AC=30, AO=15. SO²=17²−15²=64 ⟹ SO=8. V=(1/3)·(15√2)²·8=(1/3)·450·8=1200.",
      difficulty: 3,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skPyramid,
      text: "Объём правильной четырёхугольной пирамиды SABCD равен 36. Точка E — середина ребра SB. Найдите объём треугольной пирамиды EABC.",
      answerType: "NUMBER",
      correctAnswer: "9",
      hints: ["Площадь основания ABC вдвое меньше площади ABCD (половина квадрата — диагональю). Высота от E тоже вдвое меньше высоты от S (E — середина SB)."],
      explanation: "Оба множителя (площадь основания и высота) уменьшаются вдвое: V=36·(1/2)·(1/2)=9.",
      difficulty: 3,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skPyramid,
      text: "Найдите объём пирамиды, вписанной в куб, если ребро куба равно 3 (основание пирамиды — грань куба, вершина — противоположная вершина куба).",
      answerType: "NUMBER",
      correctAnswer: "9",
      hints: ["Высота такой пирамиды равна ребру куба (расстояние между противоположными гранями)."],
      explanation: "V=(1/3)·Sосн·h=(1/3)·3²·3=9.",
      difficulty: 1,
      egeTaskNumber: 3,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skRevolution,
    subtopicId: chStereoRevolution,
    order: 1,
    title: "Тела вращения",
    theoryCards: [
      {
        title: "Цилиндр",
        formula: "V = πr²h;  Sбок = 2πrh;  Sполн = 2πr(h+r)",
        body: "Аналог призмы, в основании которой лежит круг радиуса r. h — расстояние между основаниями.",
      },
      {
        title: "Конус",
        formula: "V = (1/3)πr²h;  Sбок = πrl;  Sполн = πr(r+l)",
        body: "Аналог пирамиды, в основании которой лежит круг. l — образующая (отрезок от вершины до края основания). Высота, радиус основания и образующая связаны теоремой Пифагора: l²=r²+h².",
      },
      {
        title: "Шар",
        formula: "V = (4/3)πr³;  Sполн = 4πr²",
        body: "Множество точек, равноудалённых от центра. Большой круг — сечение шара плоскостью, проходящей через центр (радиус большого круга равен радиусу самого шара).",
      },
      {
        title: "Метод множителей для круглых тел",
        body: "Та же техника, что и для многогранников: если несколько измерений (радиус, высота) меняются в разных отношениях, найдите отдельно, во сколько раз меняется каждый множитель формулы, и перемножьте эти отношения. Для шара все измерения выражаются через один радиус — при увеличении радиуса в k раз объём растёт в k³, а площадь поверхности — в k² раз.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skRevolution,
      text: "Радиус основания цилиндра равен 2, высота равна 3. Найдите площадь боковой поверхности цилиндра, делённую на π.",
      answerType: "NUMBER",
      correctAnswer: "12",
      diagram: { kind: "cylinder" },
      keyFormula: "Sбок = 2πrh",
      hints: ["Подставьте радиус и высоту в формулу боковой поверхности, затем разделите на π."],
      explanation: "Sбок=2π·2·3=12π. Разделив на π: 12.",
      difficulty: 1,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skRevolution,
      text: "Объём первого цилиндра равен 6. У второго цилиндра высота в два раза меньше, а радиус основания в три раза больше, чем у первого. Найдите объём второго цилиндра.",
      answerType: "NUMBER",
      correctAnswer: "27",
      keyFormula: "метод множителей: V₂=V₁·(1/2)·3²",
      hints: ["Радиус входит в формулу объёма в квадрате — не забудьте возвести отношение радиусов в квадрат."],
      explanation: "V₂=V₁·(1/2)·3²=6·(1/2)·9=27.",
      difficulty: 2,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skRevolution,
      text: "Высота конуса равна 16, а диаметр основания равен 60. Найдите длину образующей конуса.",
      answerType: "NUMBER",
      correctAnswer: "34",
      diagram: { kind: "cone" },
      keyFormula: "l² = r²+h²",
      hints: ["Радиус — половина диаметра. Высота, радиус и образующая связаны теоремой Пифагора."],
      explanation: "r=30. l²=16²+30²=256+900=1156 ⟹ l=34.",
      difficulty: 1,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skRevolution,
      text: "Во сколько раз уменьшится объём конуса, если его высота уменьшится в 9 раз, а радиус основания останется прежним?",
      answerType: "NUMBER",
      correctAnswer: "9",
      hints: ["Радиус не меняется — значит меняется только множитель, связанный с высотой, в той же пропорции."],
      explanation: "Площадь основания не меняется, высота уменьшилась в 9 раз — объём тоже уменьшится в 9 раз.",
      difficulty: 1,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skRevolution,
      text: "Сосуд имеет форму конуса и вмещает 2700 мл жидкости. Определите, сколько мл жидкости налито в сосуд, если высота жидкости в 3 раза меньше высоты сосуда.",
      answerType: "NUMBER",
      correctAnswer: "100",
      hints: [
        "Жидкость в конусе тоже образует конус (подобный исходному) с вершиной в той же точке.",
        "Если высота меньше в 3 раза, то и радиус меньше в 3 раза (подобие) — объём меньше в 3³=27 раз.",
      ],
      explanation: "Коэффициент подобия 1/3 по высоте даёт уменьшение объёма в 3³=27 раз (радиус тоже меньше в 3 раза). V=2700/27=100.",
      difficulty: 3,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skRevolution,
      text: "Даны два конуса. Площадь полной поверхности первого относится к площади полной поверхности второго как 4:1. Известно, что радиус первого в 2 раза меньше его образующей и в 2 раза больше радиуса второго. Найдите отношение образующей второго конуса к образующей первого.",
      answerType: "NUMBER",
      correctAnswer: "0.5",
      hints: [
        "Выразите r₁ через l₁ (r₁=l₁/2) и r₂ через l₁ (r₂=r₁/2=l₁/4).",
        "Подставьте всё в отношение площадей полной поверхности πr(r+l) и решите относительно l₂/l₁.",
      ],
      explanation: "При r₁=l₁/2, r₂=l₁/4: из отношения площадей 4:1 получаем 3l₁=l₁+4l₂ ⟹ l₂/l₁=0,5.",
      difficulty: 3,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skRevolution,
      text: "Площадь поверхности шара равна 24. Найдите площадь большого круга шара.",
      answerType: "NUMBER",
      correctAnswer: "6",
      hints: ["Площадь большого круга — это πR², а площадь поверхности шара — 4πR². Найдите отношение между ними."],
      explanation: "Sп=4πR²=24 ⟹ πR²=24/4=6 — это и есть площадь большого круга.",
      difficulty: 1,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skRevolution,
      text: "Во сколько раз увеличится площадь поверхности шара, если радиус шара увеличить в 2 раза?",
      answerType: "NUMBER",
      correctAnswer: "4",
      hints: ["Площадь поверхности шара пропорциональна квадрату радиуса."],
      explanation: "Sп=4πr² — квадратичная зависимость от радиуса. При увеличении r в 2 раза площадь увеличится в 2²=4 раза.",
      difficulty: 1,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skRevolution,
      text: "Объём первого шара равен 54. Найдите объём второго шара, если его радиус в 3 раза меньше радиуса первого шара.",
      answerType: "NUMBER",
      correctAnswer: "2",
      hints: ["Объём шара пропорционален кубу радиуса."],
      explanation: "V пропорционален r³. При уменьшении радиуса в 3 раза объём уменьшится в 3³=27 раз: V=54/27=2.",
      difficulty: 2,
      egeTaskNumber: 3,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skInscribed,
    subtopicId: chStereoRevolution,
    order: 2,
    title: "Вписанные и описанные тела",
    theoryCards: [
      {
        title: "Шар, вписанный в куб",
        body: "Диаметр шара равен ребру куба: 2R=a. Шар касается всех шести граней куба.",
      },
      {
        title: "Цилиндр и конус с общим основанием и высотой",
        formula: "Vцилиндра = 3·Vконуса (при равных Sосн и h)",
        body: "Формулы объёма отличаются ровно множителем 3 (у конуса есть 1/3, у цилиндра — нет), если основание и высота одинаковы.",
      },
      {
        title: "Шар, вписанный в цилиндр",
        body: "Радиус шара равен радиусу основания цилиндра, а высота цилиндра равна диаметру шара: h=2R.",
      },
      {
        title: "Конус, вписанный в шар (центры совпадают)",
        body: "Если центр основания конуса совпадает с центром шара, высота конуса равна радиусу шара, а если ещё и радиус основания конуса равен радиусу шара — получается прямоугольный треугольник для образующей по теореме Пифагора.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skInscribed,
      text: "Шар вписан в куб, площадь грани которого равна 3/π. Найдите площадь поверхности шара.",
      answerType: "NUMBER",
      correctAnswer: "3",
      hints: ["Диаметр шара равен ребру куба: 2R=a. Площадь грани куба a²=3/π даёт (2R)²=4R²=3/π."],
      explanation: "4R²=3/π. Площадь поверхности шара: 4πR²=π·4R²=π·(3/π)=3.",
      difficulty: 2,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skInscribed,
      text: "Шар, объём которого равен 12π, вписан в куб. Найдите объём куба.",
      answerType: "NUMBER",
      correctAnswer: "72",
      hints: ["Ребро куба a=2R (диаметр шара). Из объёма шара найдите R³, затем куб этого удвоенного значения."],
      explanation: "(4/3)πR³=12π ⟹ R³=9. Vкуба=(2R)³=8R³=8·9=72.",
      difficulty: 2,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skInscribed,
      text: "Цилиндр и конус имеют общие основание и высоту. Объём конуса равен 25. Найдите объём цилиндра.",
      answerType: "NUMBER",
      correctAnswer: "75",
      keyFormula: "Vцилиндра = 3·Vконуса",
      hints: ["Формулы объёма конуса и цилиндра отличаются ровно множителем 3 при равных основании и высоте."],
      explanation: "Vцилиндра=3·Vконуса=3·25=75.",
      difficulty: 1,
      egeTaskNumber: 3,
    },
    {
      id: stableId("p"),
      skillId: skInscribed,
      text: "Шар вписан в цилиндр. Площадь полной поверхности цилиндра равна 6. Найдите площадь поверхности шара.",
      answerType: "NUMBER",
      correctAnswer: "4",
      hints: ["Радиус шара равен радиусу цилиндра, высота цилиндра h=2R. Выразите площадь полной поверхности цилиндра через R и приравняйте к 6."],
      explanation: "Sпп=2πR²+2πR·2R=6πR²=6 ⟹ πR²=1. Sшара=4πR²=4·1=4.",
      difficulty: 2,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skInscribed,
      text: "Найдите объём шара, вписанного в цилиндр объёмом 15.",
      answerType: "NUMBER",
      correctAnswer: "10",
      hints: ["Vцилиндра=πR²·2R=2πR³=15. Выразите отсюда πR³, затем найдите объём шара (4/3)πR³."],
      explanation: "2πR³=15 ⟹ πR³=7,5. Vшара=(4/3)·7,5=10.",
      difficulty: 2,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skInscribed,
      text: "Конус вписан в шар. Радиус основания конуса равен радиусу шара. Объём конуса равен 6. Найдите объём шара.",
      answerType: "NUMBER",
      correctAnswer: "24",
      hints: ["Если радиус основания конуса равен радиусу шара, высота конуса тоже равна радиусу шара — тогда Vконуса=(1/3)πR³."],
      explanation: "Vконуса=(1/3)πR³=6. Vшара=4·((1/3)πR³)=4·6=24.",
      difficulty: 2,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skInscribed,
      text: "Около конуса описана сфера (содержит окружность основания конуса и его вершину), центр основания конуса совпадает с центром сферы, радиус сферы равен 10√2. Найдите образующую конуса.",
      answerType: "NUMBER",
      correctAnswer: "20",
      hints: ["Высота конуса равна радиусу сферы. Радиус основания конуса тоже равен радиусу сферы (так как окружность основания лежит на сфере, а центр совпадает)."],
      explanation: "Высота и радиус основания оба равны 10√2. l²=(10√2)²+(10√2)²=400 ⟹ l=20.",
      difficulty: 3,
      egeTaskNumber: 3,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skInscribed,
      text: "Цилиндр и конус имеют общие основание и высоту. Высота цилиндра равна радиусу основания. Площадь боковой поверхности цилиндра равна 27√2. Найдите площадь боковой поверхности конуса.",
      answerType: "NUMBER",
      correctAnswer: "27",
      hints: [
        "Из Sбок цилиндра=2πRh=2πR²=27√2 выразите πR².",
        "Образующая конуса l=R√2 (теорема Пифагора, так как h=R). Подставьте πR² в формулу Sбок конуса=πRl=√2·πR².",
      ],
      explanation: "2πR²=27√2 ⟹ πR²=27√2/2. Sбок.конуса=√2·πR²=√2·27√2/2=27.",
      difficulty: 3,
      egeTaskNumber: 3,
      tier: "bank",
    }
  );

  // ---------------- Модуль: Графики функций (номер 11 ЕГЭ) ----------------
  const graphsTopicId = stableId("t");
  db.topics.push({ id: graphsTopicId, order: 9, title: "Графики функций" });

  const chGraphsMain = stableId("s");
  db.subtopics.push({ id: chGraphsMain, topicId: graphsTopicId, order: 1, title: "Графики функций" });

  const skLinearQuadratic = stableId("sk");
  const skExpLog = stableId("sk");
  const skHyperbolaSqrt = stableId("sk");

  db.skills.push({
    id: skLinearQuadratic,
    subtopicId: chGraphsMain,
    order: 1,
    title: "Прямая и парабола",
    theoryCards: [
      {
        title: "Метод подстановки",
        body: "Любую задачу №11 можно решить, найдя на графике 2-3 точки с ЦЕЛЫМИ координатами (клетки сетки, где линия проходит точно через пересечение) и подставив их в формулу функции — получится система уравнений на неизвестные коэффициенты.",
      },
      {
        title: "Прямая: y = kx + b",
        body: "k — угловой коэффициент (наклон), b — значение y при x=0 (точка пересечения с осью Oy). Найдя по графику 2 точки (x₁;y₁) и (x₁;y₁), подставьте обе в y=kx+b — получится система из двух линейных уравнений.",
      },
      {
        title: "Парабола: y = a(x−h)²+v",
        formula: "вершина параболы — точка (h; v)",
        body: "Эта форма удобнее общей y=ax²+bx+c, потому что вершина видна на рисунке напрямую — это самая нижняя (или верхняя) точка параболы. Если на графике видна вершина (h;v) и ещё одна целочисленная точка, подставьте вершину сразу, а вторую точку — чтобы найти a.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skLinearQuadratic,
      text: "На рисунке изображён график функции f(x)=kx+b, проходящий через точки (3;4) и (−1;−3). Найдите значение x, при котором выполнено f(x)=−13,5.",
      answerType: "NUMBER",
      correctAnswer: "-7",
      diagram: {
        kind: "functionGraph",
        funcType: "linear",
        params: { k: 1.75, b: -1.25 },
        markedPoints: [{ x: 3, y: 4 }, { x: -1, y: -3 }],
        range: 8,
      },
      keyFormula: "y = kx + b",
      hints: [
        "Подставьте обе целочисленные точки в уравнение прямой — получится система из двух уравнений на k и b.",
        "Найдя k и b, подставьте −13,5 вместо f(x) и решите относительно x.",
      ],
      explanation: "Система из точек (3;4) и (−1;−3): k=1,75, b=−1,25. Уравнение: −13,5=1,75x−1,25 ⟹ x=−7.",
      difficulty: 2,
      egeTaskNumber: 11,
    },
    {
      id: stableId("p"),
      skillId: skLinearQuadratic,
      text: "На рисунке изображён график функции f(x)=ax²+bx+c, где числа a, b и c — целые, с вершиной в точке (−2;−1), проходящий также через точку (0;3). Найдите значение f(11).",
      answerType: "NUMBER",
      correctAnswer: "168",
      diagram: {
        kind: "functionGraph",
        funcType: "quadratic",
        params: { a: 1, h: -2, v: -1 },
        markedPoints: [{ x: -2, y: -1 }, { x: 0, y: 3 }],
        range: 14,
      },
      keyFormula: "y = a(x−h)²+v",
      hints: [
        "Подставьте координаты вершины в форму y=a(x+2)²−1, затем вторую точку — найдите a.",
        "Подставьте x=11 в получившееся уравнение параболы.",
      ],
      explanation: "Вершина (−2;−1): y=a(x+2)²−1. Точка (0;3): 3=4a−1 ⟹ a=1. f(11)=(11+2)²−1=168.",
      difficulty: 2,
      egeTaskNumber: 11,
    },
    {
      id: stableId("p"),
      skillId: skLinearQuadratic,
      text: "На рисунке изображён график функции f(x)=ax²+bx+c, где числа a, b и c — целые, с вершиной в точке (4;1), проходящий также через точку (3;4). Найдите значение f(−1).",
      answerType: "NUMBER",
      correctAnswer: "76",
      diagram: {
        kind: "functionGraph",
        funcType: "quadratic",
        params: { a: 3, h: 4, v: 1 },
        markedPoints: [{ x: 4, y: 1 }, { x: 3, y: 4 }],
        range: 10,
      },
      hints: ["Вершина (4;1): y=a(x−4)²+1. Подставьте точку (3;4), чтобы найти a."],
      explanation: "4=a(3−4)²+1 ⟹ a=3. f(−1)=3(−1−4)²+1=3·25+1=76.",
      difficulty: 2,
      egeTaskNumber: 11,
    },
    {
      id: stableId("p"),
      skillId: skLinearQuadratic,
      text: "На рисунке изображён график функции f(x)=ax²+bx+c, где числа a, b и c — действительные, с вершиной в точке (4;−3), проходящий также через точку (2;−4). Найдите значение f(−1).",
      answerType: "NUMBER",
      correctAnswer: "-9.25",
      diagram: {
        kind: "functionGraph",
        funcType: "quadratic",
        params: { a: -0.25, h: 4, v: -3 },
        markedPoints: [{ x: 4, y: -3 }, { x: 2, y: -4 }],
        range: 10,
      },
      hints: ["Вершина (4;−3): y=a(x−4)²−3. Подставьте (2;−4), чтобы найти a — он получится отрицательным (ветви вниз)."],
      explanation: "−4=a(2−4)²−3 ⟹ a=−1/4. f(−1)=−(1/4)(−1−4)²−3=−25/4−3=−9,25.",
      difficulty: 3,
      egeTaskNumber: 11,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skLinearQuadratic,
      text: "На рисунке изображён график функции f(x)=ax²+bx+c, где числа a, b и c — целые, проходящий через точки (2;4) — вершина, (1;2) и (4;−4). Найдите f(6).",
      answerType: "NUMBER",
      correctAnswer: "-28",
      diagram: {
        kind: "functionGraph",
        funcType: "quadratic",
        params: { a: -2, h: 2, v: 4 },
        markedPoints: [{ x: 2, y: 4 }, { x: 1, y: 2 }, { x: 4, y: -4 }],
        range: 8,
      },
      hints: ["Даны три целочисленные точки, но одна из них — вершина. Используйте вершину и любую из оставшихся двух."],
      explanation: "Вершина (2;4): y=a(x−2)²+4. Точка (1;2): 2=a+4 ⟹ a=−2. f(6)=−2(6−2)²+4=−28.",
      difficulty: 3,
      egeTaskNumber: 11,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skExpLog,
    subtopicId: chGraphsMain,
    order: 2,
    title: "Показательная и логарифмическая функции",
    theoryCards: [
      {
        title: "Показательная функция: асимптота и ключевая точка",
        formula: "y = aˣ  (a>0, a≠1)",
        body: "График всегда лежит выше оси Ox (aˣ>0 при любом x), поэтому прямая y=0 — асимптота (график приближается к ней, но никогда не касается). Ключевая точка — (0;1), так как a⁰=1 при любом основании.",
      },
      {
        title: "Сдвиги показательной функции",
        formula: "y = a^(x−h) + v",
        body: "Число h внутри показателя сдвигает график ВЛЕВО/ВПРАВО (как для параболы), число v снаружи — ВВЕРХ/ВНИЗ. При сдвиге по вертикали асимптота тоже сдвигается: y=v (а не y=0).",
      },
      {
        title: "Логарифмическая функция: асимптота и ключевая точка",
        formula: "y = logₐx  (a>0, a≠1, x>0)",
        body: "Асимптота — вертикальная прямая x=0 (ось Oy), так как логарифм определён только при x>0. Ключевая точка — (1;0), так как logₐ1=0 при любом основании.",
      },
      {
        title: "Сдвиги логарифмической функции",
        formula: "y = b + logₐ(x−h)",
        body: "Число h внутри аргумента сдвигает график и его асимптоту ВЛЕВО/ВПРАВО (новая асимптота: x=h). Число b снаружи сдвигает ВВЕРХ/ВНИЗ, не затрагивая асимптоту.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skExpLog,
      text: "На рисунке изображён график функции вида f(x)=aˣ, проходящий через точки (0;1) и (1;5). Найдите значение f(2).",
      answerType: "NUMBER",
      correctAnswer: "25",
      diagram: {
        kind: "functionGraph",
        funcType: "exponential",
        params: { a: 1, h: 0, v: 0, base: 5 },
        markedPoints: [{ x: 0, y: 1 }, { x: 1, y: 5 }],
        range: 3,
      },
      keyFormula: "y = aˣ",
      hints: ["Точка (0;1) не даёт информации (a⁰=1 всегда). Подставьте вторую точку (1;5), чтобы найти основание a."],
      explanation: "5=a¹ ⟹ a=5. f(2)=5²=25.",
      difficulty: 1,
      egeTaskNumber: 11,
    },
    {
      id: stableId("p"),
      skillId: skExpLog,
      text: "На рисунке изображён график функции вида f(x)=aˣ, проходящий через точки (0;1) и (−1;3). Найдите значение f(−3).",
      answerType: "NUMBER",
      correctAnswer: "27",
      diagram: {
        kind: "functionGraph",
        funcType: "exponential",
        params: { a: 1, h: 0, v: 0, base: 1 / 3 },
        markedPoints: [{ x: 0, y: 1 }, { x: -1, y: 3 }],
        range: 4,
      },
      hints: ["Подставьте точку (−1;3): 3=a⁻¹, откуда a=1/3."],
      explanation: "a⁻¹=3 ⟹ a=1/3. f(−3)=(1/3)⁻³=3³=27.",
      difficulty: 2,
      egeTaskNumber: 11,
    },
    {
      id: stableId("p"),
      skillId: skExpLog,
      text: "На рисунке изображён график функции f(x)=aˣ⁺², проходящий через точки (0;2) и (−2;1). Найдите f(6).",
      answerType: "NUMBER",
      correctAnswer: "16",
      diagram: {
        kind: "functionGraph",
        funcType: "exponential",
        params: { a: 1, h: -2, v: 0, base: Math.sqrt(2) },
        markedPoints: [{ x: 0, y: 2 }, { x: -2, y: 1 }],
        range: 6,
      },
      hints: [
        "Точка (−2;1) не даёт информации (показатель обнуляется). Подставьте (0;2): 2=a².",
        "Основание положительно по определению — возьмите положительный корень.",
      ],
      explanation: "a²=2 ⟹ a=√2. f(6)=(√2)⁸=(2)⁴=16.",
      difficulty: 3,
      egeTaskNumber: 11,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skExpLog,
      text: "На рисунке изображён график функции f(x)=aˣ⁺ᵇ, проходящий через точки (1;3) и (2;1). Найдите f(−1).",
      answerType: "NUMBER",
      correctAnswer: "27",
      diagram: {
        kind: "functionGraph",
        funcType: "exponential",
        params: { a: 1, h: 2, v: 0, base: 1 / 3 },
        markedPoints: [{ x: 1, y: 3 }, { x: 2, y: 1 }],
        range: 5,
      },
      hints: [
        "Ключевая точка (0;1) сдвинулась в (2;1) — значит весь график сдвинут на 2 вправо: b=−2.",
        "Подставьте оставшуюся точку в y=a^(x−2), чтобы найти a.",
      ],
      explanation: "b=−2 (сдвиг ключевой точки). 3=a^(1−2)=a⁻¹ ⟹ a=1/3. f(−1)=(1/3)^(−1−2)=(1/3)⁻³=27.",
      difficulty: 3,
      egeTaskNumber: 11,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skExpLog,
      text: "На рисунке изображён график функции f(x)=aˣ+b, проходящий через точки (0;−2) и (4;1). Найдите f(10).",
      answerType: "NUMBER",
      correctAnswer: "29",
      diagram: {
        kind: "functionGraph",
        funcType: "exponential",
        params: { a: 1, h: 0, v: -3, base: Math.sqrt(2) },
        markedPoints: [{ x: 0, y: -2 }, { x: 4, y: 1 }],
        range: 6,
      },
      hints: [
        "Ключевая точка (0;1) сдвинулась в (0;−2) — значит весь график сдвинут на 3 вниз: b=−3.",
        "Подставьте вторую точку в y=aˣ−3, чтобы найти a.",
      ],
      explanation: "b=−3. 1=a⁴−3 ⟹ a⁴=4 ⟹ a=√2. f(10)=(√2)¹⁰−3=2⁵−3=32−3=29.",
      difficulty: 3,
      egeTaskNumber: 11,
    },
    {
      id: stableId("p"),
      skillId: skExpLog,
      text: "На рисунке изображён график функции вида f(x)=logₐx, проходящий через точки (1;0) и (2;−1). Найдите значение f(8).",
      answerType: "NUMBER",
      correctAnswer: "-3",
      diagram: {
        kind: "functionGraph",
        funcType: "logarithm",
        params: { a: 1, h: 0, v: 0, base: 0.5 },
        markedPoints: [{ x: 1, y: 0 }, { x: 2, y: -1 }],
        range: 9,
      },
      keyFormula: "y = logₐx",
      hints: ["Точка (1;0) не даёт информации (logₐ1=0 всегда). Подставьте (2;−1), чтобы найти основание."],
      explanation: "−1=logₐ2 ⟹ a⁻¹=2 ⟹ a=1/2. f(8)=log_(1/2)8=−3.",
      difficulty: 2,
      egeTaskNumber: 11,
    },
    {
      id: stableId("p"),
      skillId: skExpLog,
      text: "На рисунке изображён график функции f(x)=logₐ(x−2), проходящий через точки (3;0) и (4;−1). Найдите f(10).",
      answerType: "NUMBER",
      correctAnswer: "-3",
      diagram: {
        kind: "functionGraph",
        funcType: "logarithm",
        params: { a: 1, h: 2, v: 0, base: 0.5 },
        markedPoints: [{ x: 3, y: 0 }, { x: 4, y: -1 }],
        range: 11,
      },
      hints: ["Ключевая точка (1;0) сдвинулась в (3;0) — весь график сдвинут на 2 вправо."],
      explanation: "−1=logₐ(4−2)=logₐ2 ⟹ a=1/2. f(10)=log_(1/2)(10−2)=log_(1/2)8=−3.",
      difficulty: 2,
      egeTaskNumber: 11,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skExpLog,
      text: "На рисунке изображён график функции f(x)=b+logₐx, проходящий через точки (3;−1) и (1;−2). Найдите f(81).",
      answerType: "NUMBER",
      correctAnswer: "2",
      diagram: {
        kind: "functionGraph",
        funcType: "logarithm",
        params: { a: 1, h: 0, v: -2, base: 3 },
        markedPoints: [{ x: 3, y: -1 }, { x: 1, y: -2 }],
        range: 10,
      },
      hints: [
        "Ключевая точка (1;0) сдвинулась в (1;−2) — весь график сдвинут на 2 вниз: b=−2.",
        "Подставьте оставшуюся точку в y=logₐx−2, чтобы найти основание a.",
      ],
      explanation: "b=−2 (сдвиг ключевой точки). −1=logₐ3−2 ⟹ logₐ3=1 ⟹ a=3. f(81)=log₃81−2=4−2=2.",
      difficulty: 3,
      egeTaskNumber: 11,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skHyperbolaSqrt,
    subtopicId: chGraphsMain,
    order: 3,
    title: "Гипербола и корень",
    theoryCards: [
      {
        title: "Корень: вершина графика",
        formula: "y = k√(x−x₀) + y₀",
        body: "(x₀;y₀) — вершина, точка, откуда график «начинается» (левее неё функция не определена — под корнем не может быть отрицательное число). Знак k определяет направление ветви: k>0 — вверх, k<0 — вниз.",
      },
      {
        title: "Гипербола: асимптоты",
        formula: "y = k/(x−x₀) + y₀",
        body: "Вертикальная асимптота — прямая x=x₀ (там знаменатель обращается в 0), горизонтальная — прямая y=y₀ (при x→±∞ дробь стремится к 0). Знак k определяет, в каких четвертях (относительно асимптот) расположены ветви.",
      },
      {
        title: "Как читать асимптоты с графика",
        body: "На рисунке асимптоты обычно не проведены явно, но их положение видно по тому, куда «прижимаются» ветви кривой. Определив x₀ и y₀ по асимптотам, останется подставить одну целочисленную точку с графика, чтобы найти k.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skHyperbolaSqrt,
      text: "На рисунке изображён график функции f(x)=k√x, проходящий через точку (4;−3). Найдите f(2,56).",
      answerType: "NUMBER",
      correctAnswer: "-2.4",
      diagram: {
        kind: "functionGraph",
        funcType: "sqrt",
        params: { a: -1.5, h: 0, v: 0 },
        markedPoints: [{ x: 4, y: -3 }],
        range: 6,
      },
      keyFormula: "y = k√x",
      hints: ["Подставьте точку (4;−3) в функцию, чтобы найти k, затем вычислите f(2,56)."],
      explanation: "−3=k√4=2k ⟹ k=−1,5. f(2,56)=−1,5·√2,56=−1,5·1,6=−2,4.",
      difficulty: 2,
      egeTaskNumber: 11,
    },
    {
      id: stableId("p"),
      skillId: skHyperbolaSqrt,
      text: "На рисунке изображён график функции f(x)=k√x+p, проходящий через точки (0;2) — вершина, и (4;−4). Найдите значение x, при котором f(x)=−10.",
      answerType: "NUMBER",
      correctAnswer: "16",
      diagram: {
        kind: "functionGraph",
        funcType: "sqrt",
        params: { a: -3, h: 0, v: 2 },
        markedPoints: [{ x: 0, y: 2 }, { x: 4, y: -4 }],
        range: 18,
      },
      hints: [
        "Вершина (0;2) сразу даёт p=2. Подставьте вторую точку в y=k√x+2, чтобы найти k.",
        "Подставьте −10 вместо f(x) и решите относительно x.",
      ],
      explanation: "p=2. −4=k√4+2 ⟹ k=−3. Уравнение: −3√x+2=−10 ⟹ √x=4 ⟹ x=16.",
      difficulty: 3,
      egeTaskNumber: 11,
    },
    {
      id: stableId("p"),
      skillId: skHyperbolaSqrt,
      text: "На рисунке изображён график функции вида f(x)=k/x, проходящий через точку (2;1). Найдите значение f(10).",
      answerType: "NUMBER",
      correctAnswer: "0.2",
      diagram: {
        kind: "functionGraph",
        funcType: "hyperbola",
        params: { k: 2, h: 0, v: 0 },
        markedPoints: [{ x: 2, y: 1 }],
        range: 10,
      },
      keyFormula: "y = k/x",
      hints: ["Подставьте точку (2;1) в функцию, чтобы найти k."],
      explanation: "1=k/2 ⟹ k=2. f(10)=2/10=0,2.",
      difficulty: 1,
      egeTaskNumber: 11,
    },
    {
      id: stableId("p"),
      skillId: skHyperbolaSqrt,
      text: "На рисунке изображён график функции f(x)=k/(x+a) с вертикальной асимптотой x=2, проходящий через точку (−1;−1). Найдите значение x, при котором f(x)=−0,2.",
      answerType: "NUMBER",
      correctAnswer: "-13",
      diagram: {
        kind: "functionGraph",
        funcType: "hyperbola",
        params: { k: 3, h: 2, v: 0 },
        markedPoints: [{ x: -1, y: -1 }],
        range: 14,
      },
      hints: [
        "Вертикальная асимптота x=2 сразу даёт a=−2 (знаменатель x+a обращается в 0 при x=2).",
        "Подставьте точку (−1;−1) в y=k/(x−2), чтобы найти k, затем решите уравнение при f(x)=−0,2.",
      ],
      explanation: "a=−2 ⟹ y=k/(x−2). −1=k/(−1−2) ⟹ k=3. Уравнение: 3/(x−2)=−0,2 ⟹ x−2=−15 ⟹ x=−13.",
      difficulty: 3,
      egeTaskNumber: 11,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skHyperbolaSqrt,
      text: "На рисунке изображён график функции f(x)=k/x+a с горизонтальной асимптотой y=−1, проходящий через точку (−2;1). Найдите f(−8).",
      answerType: "NUMBER",
      correctAnswer: "-0.5",
      diagram: {
        kind: "functionGraph",
        funcType: "hyperbola",
        params: { k: -4, h: 0, v: -1 },
        markedPoints: [{ x: -2, y: 1 }],
        range: 10,
      },
      hints: [
        "Горизонтальная асимптота y=−1 сразу даёт a=−1.",
        "Подставьте точку (−2;1) в y=k/x−1, чтобы найти k, затем вычислите f(−8).",
      ],
      explanation: "a=−1 ⟹ y=k/x−1. 1=k/(−2)−1 ⟹ k=−4. f(−8)=−4/(−8)−1=0,5−1=−0,5.",
      difficulty: 3,
      egeTaskNumber: 11,
      tier: "bank",
    }
  );

  // ---------------- Модуль: Производная (номера 8 и 12 ЕГЭ) ----------------
  const derivTopicId = stableId("t");
  db.topics.push({ id: derivTopicId, order: 10, title: "Производная" });

  const chDerivMain = stableId("s");
  db.subtopics.push({ id: chDerivMain, topicId: derivTopicId, order: 1, title: "Смысл производной" });

  const skAnalytic = stableId("sk");
  const skComputeDeriv = stableId("sk");
  const skPhysical = stableId("sk");

  db.skills.push({
    id: skAnalytic,
    subtopicId: chDerivMain,
    order: 1,
    title: "Аналитический смысл производной",
    theoryCards: [
      {
        title: "Связь знака производной и монотонности",
        body: "Если производная f'(x) положительна на промежутке — функция f(x) на нём возрастает. Если отрицательна — убывает. Первое, на что смотрите на рисунке: график ЧЕГО вам дан — самой функции f(x) или её производной f'(x)? От этого зависит, что именно вы ищете на картинке.",
      },
      {
        title: "Точки экстремума",
        body: "Точка максимума — там, где функция меняется с возрастания на убывание (график производной пересекает ось абсцисс «сверху вниз»). Точка минимума — где с убывания на возрастание (пересечение «снизу вверх»). В обеих точках производная равна нулю.",
      },
      {
        title: "Что искать на каждом из двух графиков",
        body: "На графике САМОЙ ФУНКЦИИ f(x): где она возрастает/убывает, где у неё «ямки» (минимумы) и «горки» (максимумы). На графике ПРОИЗВОДНОЙ f'(x): где она положительна/отрицательна (выше/ниже оси Ox), где пересекает ось (это и есть точки экстремума исходной функции).",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skAnalytic,
      text: "На рисунке изображён график функции y=f(x), определённой на интервале (−3;8,5). Найдите сумму точек экстремума этой функции.",
      answerType: "NUMBER",
      correctAnswer: "17",
      diagram: {
        kind: "qualitativeCurve",
        points: [
          { x: -3, y: -1 },
          { x: -2, y: 2 },
          { x: 0, y: -2 },
          { x: 1, y: 1.5 },
          { x: 4, y: -2.5 },
          { x: 6, y: 2.5 },
          { x: 8, y: -1.5 },
          { x: 8.5, y: -1 },
        ],
        xRange: [-4, 9.5],
        yRange: [-4, 4],
      },
      keyFormula: "точки экстремума — «ямки» и «горки» графика",
      hints: ["Найдите все точки минимума («ямки») и максимума («горки») по графику, затем сложите их x-координаты."],
      explanation: "Минимумы: 0, 4, 8. Максимумы: −2, 1, 6. Сумма: 0+4+8+(−2)+1+6=17.",
      difficulty: 2,
      egeTaskNumber: 8,
    },
    {
      id: stableId("p"),
      skillId: skAnalytic,
      text: "На рисунке изображён график функции y=f(x). Найдите количество точек минимума функции f(x), принадлежащих интервалу (−4;7).",
      answerType: "NUMBER",
      correctAnswer: "5",
      diagram: {
        kind: "qualitativeCurve",
        points: [
          { x: -4, y: 2 },
          { x: -2.5, y: -2 },
          { x: -1.5, y: 1.5 },
          { x: -0.5, y: -2 },
          { x: 0.5, y: 1.5 },
          { x: 1.5, y: -2 },
          { x: 2.5, y: 1.5 },
          { x: 3.5, y: -2 },
          { x: 4.5, y: 1.5 },
          { x: 5.5, y: -2 },
          { x: 6.5, y: 1 },
          { x: 7, y: 1.5 },
        ],
        xRange: [-5, 8],
        yRange: [-3, 3],
      },
      hints: ["Точка минимума — это «ямка» на графике. Посчитайте, сколько раз график «опускается и снова поднимается»."],
      explanation: "На графике 5 «ямок» (точек минимума) на заданном интервале.",
      difficulty: 1,
      egeTaskNumber: 8,
    },
    {
      id: stableId("p"),
      skillId: skAnalytic,
      text: "На рисунке изображён график функции y=f(x), определённой на интервале (−0,5;4,1). Определите количество целых точек, в которых производная функции отрицательна.",
      answerType: "NUMBER",
      correctAnswer: "2",
      diagram: {
        kind: "qualitativeCurve",
        points: [
          { x: -0.5, y: -1 },
          { x: 0, y: -0.5 },
          { x: 1, y: 2 },
          { x: 1.5, y: 3 },
          { x: 2, y: 1 },
          { x: 2.5, y: -1 },
          { x: 3, y: 2 },
          { x: 3.5, y: 3.5 },
          { x: 4, y: 1 },
          { x: 4.1, y: 0.8 },
        ],
        xRange: [-1, 5],
        yRange: [-2, 4],
      },
      hints: [
        "Производная отрицательна там, где функция убывает. Перечислите все целые точки на интервале: 0,1,2,3,4.",
        "Для каждой целой точки посмотрите, растёт или падает график в этом месте.",
      ],
      explanation: "Целые точки: 0,1,2,3,4. Функция убывает только в точках 2 и 4. Ответ: 2.",
      difficulty: 2,
      egeTaskNumber: 8,
    },
    {
      id: stableId("p"),
      skillId: skAnalytic,
      text: "На рисунке изображён график функции y=f(x) и отмечены точки −4; −2; 2; 5. В какой из этих точек значение производной наибольшее?",
      answerType: "NUMBER",
      correctAnswer: "5",
      diagram: {
        kind: "qualitativeCurve",
        points: [
          { x: -6, y: -2 },
          { x: -4, y: 0.5 },
          { x: -2, y: 2 },
          { x: 0, y: 0 },
          { x: 2, y: -1 },
          { x: 3.5, y: -2.5 },
          { x: 5, y: 2 },
          { x: 6, y: 3.5 },
        ],
        markedXPoints: [
          { x: -4, label: "-4" },
          { x: -2, label: "-2" },
          { x: 2, label: "2" },
          { x: 5, label: "5" },
        ],
        xRange: [-7, 7],
        yRange: [-4, 4],
      },
      hints: [
        "Значение производной наибольшее там, где угол наклона касательной больше всего (график идёт вверх наиболее круто).",
        "Сравнивайте только точки, где функция ВОЗРАСТАЕТ — там, где убывает, производная отрицательна и заведомо не наибольшая.",
      ],
      explanation: "Функция возрастает в точках −4 и 5. В точке x=5 наклон (крутизна подъёма) больше, чем в x=−4. Ответ: 5.",
      difficulty: 3,
      egeTaskNumber: 8,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skAnalytic,
      text: "На рисунке изображён график y=f'(x) — производной функции f(x), определённой на интервале (−19;3). Найдите количество точек максимума функции f(x), принадлежащих отрезку [−17;−4].",
      answerType: "NUMBER",
      correctAnswer: "2",
      diagram: {
        kind: "qualitativeCurve",
        points: [
          { x: -19, y: 1 },
          { x: -17, y: 2 },
          { x: -15, y: -1 },
          { x: -12, y: 1.5 },
          { x: -9, y: -1.5 },
          { x: -6, y: 1 },
          { x: -4, y: -0.5 },
          { x: -1, y: 1.5 },
          { x: 3, y: 3 },
        ],
        markedXPoints: [{ x: -17, label: "-17" }, { x: -4, label: "-4" }],
        xRange: [-20, 4],
        yRange: [-3, 4],
        showZeroLine: true,
      },
      keyFormula: "точка максимума ⟺ f'(x) меняет знак с «+» на «−»",
      hints: ["Точка максимума соответствует пересечению графика производной с осью абсцисс СВЕРХУ ВНИЗ (переход с плюса на минус)."],
      explanation: "На отрезке [−17;−4] график производной пересекает ось сверху вниз ровно 2 раза — значит у функции f(x) там 2 точки максимума.",
      difficulty: 3,
      egeTaskNumber: 8,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skAnalytic,
      text: "На рисунке изображён график y=f'(x) — производной функции f(x), определённой на интервале (−4;6). Найдите угловой коэффициент касательной, проведённой к графику функции y=f(x) в точке с абсциссой −2.",
      answerType: "NUMBER",
      correctAnswer: "4",
      diagram: {
        kind: "qualitativeCurve",
        points: [
          { x: -4, y: 0.5 },
          { x: -2, y: 4 },
          { x: 1, y: 2 },
          { x: 3, y: -1 },
          { x: 6, y: 1.5 },
        ],
        markedXPoints: [{ x: -2, label: "-2" }],
        xRange: [-5, 7],
        yRange: [-2, 5],
        showZeroLine: true,
      },
      keyFormula: "угловой коэффициент касательной = f′(x₀)",
      hints: ["Угловой коэффициент касательной в точке равен значению ПРОИЗВОДНОЙ в этой точке — а на рисунке уже дан именно график производной."],
      explanation: "Угловой коэффициент касательной к f(x) в точке x₀=−2 равен f′(−2). По графику производной: f′(−2)=4.",
      difficulty: 1,
      egeTaskNumber: 8,
    },
    {
      id: stableId("p"),
      skillId: skAnalytic,
      text: "На рисунке изображён график функции y=f(x) и на оси абсцисс отмечены восемь точек: x₁, x₂, x₃, x₄, x₅, x₆, x₇, x₈. В скольких из этих точек производная функции y=f(x) положительна?",
      answerType: "NUMBER",
      correctAnswer: "4",
      diagram: {
        kind: "qualitativeCurve",
        points: [
          { x: -8, y: -2 },
          { x: -6, y: 2 },
          { x: -4, y: -1.5 },
          { x: -2, y: 1.5 },
          { x: 0, y: -1 },
          { x: 3, y: 2.5 },
          { x: 6, y: -1 },
          { x: 8, y: 1.5 },
          { x: 9, y: 2 },
        ],
        markedXPoints: [
          { x: -7, label: "x1" },
          { x: -5, label: "x2" },
          { x: -3, label: "x3" },
          { x: -1, label: "x4" },
          { x: 1.5, label: "x5" },
          { x: 4.5, label: "x6" },
          { x: 7, label: "x7" },
          { x: 8.5, label: "x8" },
        ],
        xRange: [-9, 10],
        yRange: [-3, 3.5],
      },
      hints: ["Производная положительна там, где функция ВОЗРАСТАЕТ. Проверьте для каждой из восьми точек, идёт ли график вверх или вниз в этом месте."],
      explanation: "Функция возрастает только в точках x₁, x₃, x₅, x₇ — значит производная положительна ровно в 4 из 8 точек.",
      difficulty: 2,
      egeTaskNumber: 8,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skAnalytic,
      text: "На рисунке изображён график y=f'(x) — производной функции y=f(x), определённой на интервале (−1,5;4,6). Найдите промежутки возрастания функции y=f(x). В ответе укажите длину наибольшего из них.",
      answerType: "NUMBER",
      correctAnswer: "4",
      diagram: {
        kind: "qualitativeCurve",
        points: [
          { x: -1.5, y: -1 },
          { x: -1, y: 0 },
          { x: 1, y: 1.5 },
          { x: 3, y: 0 },
          { x: 3.5, y: -1 },
          { x: 4.2, y: 0.3 },
          { x: 4.6, y: 0.6 },
        ],
        xRange: [-2.5, 5.5],
        yRange: [-2, 2.5],
        showZeroLine: true,
      },
      hints: [
        "Функция возрастает там, где производная положительна — найдите все промежутки, где график производной выше оси Ox.",
        "Сравните длины всех найденных промежутков возрастания — выберите наибольшую.",
      ],
      explanation: "Производная положительна на промежутке (−1;3) (длина 4) и на небольшом кусочке ближе к правому краю — он заведомо короче. Наибольшая длина: 4.",
      difficulty: 3,
      egeTaskNumber: 8,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skAnalytic,
      text: "На рисунке изображён график производной функции f(x), определённой на интервале (−6;6). В какой точке отрезка [3;5] функция f(x) принимает наибольшее значение?",
      answerType: "NUMBER",
      correctAnswer: "5",
      diagram: {
        kind: "qualitativeCurve",
        points: [
          { x: -6, y: -1 },
          { x: -3, y: 1.5 },
          { x: 0, y: -1.5 },
          { x: 2, y: 0.5 },
          { x: 3, y: 1 },
          { x: 5, y: 2 },
          { x: 6, y: 2.3 },
        ],
        markedXPoints: [{ x: 3, label: "3" }, { x: 5, label: "5" }],
        xRange: [-7, 7],
        yRange: [-2, 3],
        showZeroLine: true,
      },
      hints: [
        "Если производная положительна на всём отрезке — функция на нём непрерывно возрастает.",
        "У непрерывно возрастающей на отрезке функции наибольшее значение — на правом конце отрезка.",
      ],
      explanation: "На всём отрезке [3;5] график производной лежит выше оси Ox (положителен) — значит f(x) на этом отрезке возрастает, и наибольшее значение принимает на правой границе x=5.",
      difficulty: 2,
      egeTaskNumber: 8,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skComputeDeriv,
    subtopicId: chDerivMain,
    order: 2,
    title: "Вычисление производной. Экстремумы и наибольшее значение",
    theoryCards: [
      {
        title: "Таблица производных — основные формулы",
        formula: "(xᵃ)′=a·xᵃ⁻¹;  (eˣ)′=eˣ;  (ln x)′=1/x;  (sin x)′=cos x;  (cos x)′=−sin x",
        body: "Производная суммы — сумма производных: (f±g)′=f′±g′. Производная произведения: (f·g)′=f′g+fg′. Производная сложной функции: (f(g(x)))′=f′(g(x))·g′(x) — сначала берётся производная «внешней» функции, затем умножается на производную «внутренней».",
      },
      {
        title: "Алгоритм поиска точек экстремума",
        body: "1) Найдите производную f′(x). 2) Найдите критические точки — где f′(x)=0 (или не существует). 3) Определите знак производной на каждом промежутке между критическими точками (методом интервалов). 4) Точка, где знак меняется с «+» на «−» — максимум; с «−» на «+» — минимум.",
      },
      {
        title: "Наибольшее/наименьшее значение на отрезке",
        body: "После нахождения критических точек внутри отрезка сравните значение функции в НИХ и на ОБОИХ концах отрезка — наибольшее (или наименьшее) среди всех этих значений и есть искомый ответ. Не забывайте, что экстремум внутри отрезка не всегда оказывается наибольшим/наименьшим значением — иногда «выигрывает» именно конец отрезка.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skComputeDeriv,
      text: "Найдите точку минимума функции y=x³/3−x²/2−7.",
      answerType: "NUMBER",
      correctAnswer: "1",
      keyFormula: "y′=x²−x",
      hints: [
        "Найдите производную y′=x²−x, приравняйте к нулю, чтобы найти критические точки.",
        "Определите знак производной на каждом из трёх промежутков между критическими точками.",
      ],
      explanation: "y′=x²−x=x(x−1)=0 ⟹ x=0 или x=1. Знаки: (+) до 0, (−) между 0 и 1, (+) после 1. Значит x=0 — максимум, x=1 — минимум.",
      difficulty: 2,
      egeTaskNumber: 12,
    },
    {
      id: stableId("p"),
      skillId: skComputeDeriv,
      text: "Найдите точку максимума функции y=ln(x+5)−2x+9.",
      answerType: "NUMBER",
      correctAnswer: "-4.5",
      keyFormula: "y′=1/(x+5)−2",
      hints: ["Область определения: x>−5. Найдите производную, приравняйте к нулю."],
      explanation: "y′=1/(x+5)−2=0 ⟹ x+5=0,5 ⟹ x=−4,5. Проверка знаков подтверждает, что это точка максимума (производная меняется с + на −).",
      difficulty: 2,
      egeTaskNumber: 12,
    },
    {
      id: stableId("p"),
      skillId: skComputeDeriv,
      text: "Найдите наибольшее значение функции y=x^(3/2)−3x+1 на отрезке [1;9].",
      answerType: "NUMBER",
      correctAnswer: "1",
      keyFormula: "y′=(3/2)√x−3",
      hints: [
        "Найдите критическую точку внутри отрезка, затем сравните значение функции там и на обоих концах отрезка.",
        "Критическая точка окажется точкой МИНИМУМА — значит наибольшее значение нужно искать на одном из концов.",
      ],
      explanation: "y′=(3/2)√x−3=0 ⟹ √x=2 ⟹ x=4 (минимум внутри отрезка). y(1)=1−3+1=−1. y(9)=27−27+1=1. Наибольшее: 1.",
      difficulty: 3,
      egeTaskNumber: 12,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skComputeDeriv,
      text: "Найдите наибольшее значение функции y=(3x²−36x+36)eˣ на отрезке [−1;4].",
      answerType: "NUMBER",
      correctAnswer: "36",
      keyFormula: "(fg)′=f′g+fg′",
      hints: [
        "Используйте правило производной произведения: (fg)′=f′g+fg′.",
        "После упрощения производная вынесется в виде 3x(x−10)eˣ — на отрезке [−1;4] только один корень попадает внутрь.",
      ],
      explanation: "y′=3x(x−10)eˣ=0 ⟹ x=0 или x=10 (вне отрезка). На [−1;4] это точка максимума. y(0)=36·e⁰=36.",
      difficulty: 3,
      egeTaskNumber: 12,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skComputeDeriv,
      text: "Найдите наибольшее значение функции y=12cos x+6√3·x−2√3π+6 на отрезке [0;π/2].",
      answerType: "NUMBER",
      correctAnswer: "12",
      hints: [
        "Найдите производную y′=−12sin x+6√3, приравняйте к нулю — получится табличное значение sin x.",
        "Сравните значение функции в критической точке и на обоих концах отрезка.",
      ],
      explanation: "y′=−12sinx+6√3=0 ⟹ sinx=√3/2 ⟹ x=π/3 (единственная критическая точка на отрезке). y(π/3)=12 — наибольшее (больше значений на концах отрезка).",
      difficulty: 3,
      egeTaskNumber: 12,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skPhysical,
    subtopicId: chDerivMain,
    order: 3,
    title: "Физический смысл производной",
    theoryCards: [
      {
        title: "Скорость — производная координаты",
        formula: "v(t) = x′(t)",
        body: "Если движение точки по прямой задано законом x(t) (координата в момент времени t), то её мгновенная скорость — это производная координаты по времени.",
      },
      {
        title: "Ускорение — производная скорости",
        formula: "a(t) = v′(t) = x″(t)",
        body: "Ускорение — производная от скорости, то есть ВТОРАЯ производная от закона движения (производная от производной).",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skPhysical,
      text: "Материальная точка движется прямолинейно по закону x(t)=7t²−12t, где x — расстояние от точки x=0 в метрах, t — время в секундах. Найдите её скорость в момент времени t=1 с. Ответ дайте в метрах в секунду.",
      answerType: "NUMBER",
      correctAnswer: "2",
      keyFormula: "v(t) = x′(t)",
      hints: ["Найдите производную закона движения — это и есть функция скорости, затем подставьте t=1."],
      explanation: "v(t)=x′(t)=14t−12. v(1)=14·1−12=2.",
      difficulty: 1,
      egeTaskNumber: 8,
    },
    {
      id: stableId("p"),
      skillId: skPhysical,
      text: "Материальная точка движется прямолинейно по закону x(t)=3t²+6t+2, где x — расстояние от точки x=0 в метрах, t — время в секундах. В какой момент времени её скорость составляла 15 м/с? Ответ дайте в секундах.",
      answerType: "NUMBER",
      correctAnswer: "1.5",
      hints: ["Найдите функцию скорости v(t)=x′(t), приравняйте к 15 и решите уравнение относительно t."],
      explanation: "v(t)=x′(t)=6t+6. Уравнение 6t+6=15 ⟹ t=1,5.",
      difficulty: 1,
      egeTaskNumber: 8,
    },
    {
      id: stableId("p"),
      skillId: skPhysical,
      text: "Материальная точка движется прямолинейно по закону x(t)=12t³−5t²−t+2, где x — расстояние от точки x=0 в метрах, t — время в секундах. Найдите её ускорение в момент t=1 с. Ответ дайте в метрах в секунду в квадрате.",
      answerType: "NUMBER",
      correctAnswer: "62",
      keyFormula: "a(t) = x″(t)",
      hints: [
        "Сначала найдите скорость v(t)=x′(t), затем возьмите производную ещё раз, чтобы получить ускорение.",
      ],
      explanation: "v(t)=36t²−10t−1. a(t)=v′(t)=72t−10. a(1)=72·1−10=62.",
      difficulty: 2,
      egeTaskNumber: 8,
      tier: "bank",
    }
  );

  // ---------------- Модуль: Экономическая задача (номер 16 ЕГЭ) ----------------
  const econTopicId = stableId("t");
  db.topics.push({ id: econTopicId, order: 11, title: "Экономическая задача" });

  const chEconMain = stableId("s");
  db.subtopics.push({ id: chEconMain, topicId: econTopicId, order: 1, title: "Кредиты" });

  const chEconDeposits = stableId("s");
  db.subtopics.push({ id: chEconDeposits, topicId: econTopicId, order: 2, title: "Вклады" });

  const chEconOptimization = stableId("s");
  db.subtopics.push({ id: chEconOptimization, topicId: econTopicId, order: 3, title: "Оптимизация" });

  const chEconFunds = stableId("s");
  db.subtopics.push({ id: chEconFunds, topicId: econTopicId, order: 4, title: "Фонды и акции" });

  const skDifferentiated = stableId("sk");
  const skAnnuity = stableId("sk");
  const skMixed = stableId("sk");
  const skDeposits = stableId("sk");
  const skComplexCredit = stableId("sk");
  const skOptimization = stableId("sk");
  const skFunds = stableId("sk");

  db.skills.push({
    id: skDifferentiated,
    subtopicId: chEconMain,
    order: 1,
    title: "Дифференцированные платежи",
    theoryCards: [
      {
        title: "Проценты — база",
        formula: "r% от S = S·(r/100);  увеличить S на r% = S·(1+r/100)",
        body: "В экономических задачах почти всегда удобнее работать с обыкновенными дробями, а не с десятичными: например, 12,5%=1/8, значит увеличение на 12,5% — это умножение на 9/8.",
      },
      {
        title: "Дифференцированный платёж — определение",
        body: "Система выплат, при которой ОСНОВНОЙ ДОЛГ уменьшается равномерно (на одну и ту же сумму каждый период). Проценты начисляются каждый раз на текущий остаток долга — поэтому сумма процентов (и весь платёж целиком) с каждым периодом становится меньше.",
      },
      {
        title: "Ключевой инсайт — арифметическая прогрессия",
        formula: "Sₙ = (a₁+aₙ)/2 · n",
        body: "В схеме дифференцированного платежа начисленные проценты образуют АРИФМЕТИЧЕСКУЮ ПРОГРЕССИЮ (убывающую, так как остаток долга убывает равномерно). Это позволяет находить сумму всех процентов (переплату) по формуле суммы арифметической прогрессии, не расписывая каждый год отдельно.",
      },
      {
        title: "Таблица — главный инструмент",
        body: "Заведите таблицу со столбцами: долг до начисления % / долг после начисления % / платёж / долг после платежа. Определите ВСЕ неизвестные (обычно S — сумма кредита, r — ставка) в начале решения, затем заполняйте таблицу по периодам.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skDifferentiated,
      text: "10 лет назад Григорий брал в банке кредит на 4 года, причём он выплачивал кредит дифференцированными платежами, и переплата по кредиту составила 32,5% от кредита. Под какой годовой процент был взят тогда кредит?",
      answerType: "DETAILED",
      correctAnswer:
        "Обозначим S — сумму кредита, r — годовой процент. Ежегодный платёж по основному долгу равен S/4. Составив таблицу, видим, что начисленные проценты образуют убывающую арифметическую прогрессию с членами (r/100)S, (r/100)(3/4)S, (r/100)(2/4)S, (r/100)(1/4)S. Их сумма (по формуле арифметической прогрессии): (rS/100)·(1+3/4+2/4+1/4)/... = rS/40. Приравнивая к переплате: rS/40=0,325S ⟹ r=13.",
      keyFormula: "переплата = rS/40",
      hints: [
        "Составьте таблицу остатка долга по годам — каждый год основной долг уменьшается на S/4.",
        "Начисленные проценты по годам образуют арифметическую прогрессию — найдите её сумму через формулу Sₙ=(a₁+aₙ)/2·n.",
      ],
      explanation: "Сумма начисленных процентов (переплата) равна rS/40. Приравнивая к 0,325S: rS/40=0,325S ⟹ r=0,325·40=13.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skDifferentiated,
      text: "15 мая планируется взять кредит в банке сроком на 23 месяца с дифференцированными платежами: 1-го числа каждого месяца долг возрастает на t% по сравнению с концом предыдущего месяца, со 2-го по 14-е число нужно выплатить часть долга, а 15-го числа долг уменьшается на одну и ту же величину каждый месяц. Известно, что общая сумма выплат на 36% больше суммы кредита. Найдите t.",
      answerType: "DETAILED",
      correctAnswer:
        "Обозначим S — сумму кредита. Основной долг уменьшается на S/23 каждый месяц. Начисленные проценты образуют убывающую арифметическую прогрессию из 23 членов. Их сумма по формуле арифметической прогрессии: S·(t/100)·(1+1/23)/2·23 = tS·24/(100·23·2/23)=12tS/100. Из условия переплата равна 0,36S: 12tS/100=0,36S ⟹ t=3.",
      keyFormula: "переплата = 12tS/100",
      hints: [
        "Основной долг убывает на S/23 каждый месяц — 23 равных шага.",
        "Сумма начисленных процентов — сумма убывающей арифметической прогрессии из 23 членов.",
      ],
      explanation: "Сумма процентов равна 12tS/100. Из условия переплаты 36%: 12tS/100=0,36S ⟹ t=3.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skAnnuity,
    subtopicId: chEconMain,
    order: 2,
    title: "Аннуитетные платежи",
    theoryCards: [
      {
        title: "Аннуитетный платёж — определение",
        body: "Система выплат, при которой ПЛАТЁЖ ЦЕЛИКОМ остаётся одинаковым на протяжении всего срока кредита (в отличие от дифференцированного, где выплаты со временем уменьшаются).",
      },
      {
        title: "Удобное обозначение p",
        formula: "p = 1 + r/100",
        body: "Вместо громоздкой записи «увеличить на r%» удобно ввести множитель p — тогда «долг после начисления процентов» это просто (долг)·p. Это заметно упрощает таблицу и итоговые уравнения.",
      },
      {
        title: "Формула аннуитетного платежа",
        formula: "x = S·pⁿ / (1+p+p²+...+pⁿ⁻¹)",
        body: "S — сумма кредита, n — срок в периодах (годах/месяцах). Знаменатель — сумма геометрической прогрессии со знаменателем p. Выводится из условия, что долг на конец последнего периода равен нулю — распишите таблицу для n=2 или n=3 и решите уравнение относительно x, чтобы вывести формулу самостоятельно, если не помните её наизусть.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skAnnuity,
      text: "Для покупки квартиры Алексею не хватало 1 209 600 рублей, поэтому в январе 2015 года он взял в банке кредит под 10% годовых на 2 года с аннуитетными платежами (раз в год 15 декабря банк начисляет проценты, затем Алексей переводит платёж x). Чему должен быть равен x, чтобы Алексей выплатил долг равными платежами?",
      answerType: "NUMBER",
      correctAnswer: "696960",
      keyFormula: "x = Sp²/(p+1)",
      hints: [
        "Введите p=1+r/100=1,1. Составьте таблицу: после 1-го года долг Sp−x, после 2-го — (Sp−x)p−x=0.",
        "Решите уравнение (Sp−x)p−x=0 относительно x — получится формула x=Sp²/(p+1).",
      ],
      explanation: "p=1,1. Из (Sp−x)p−x=0 получаем x=Sp²/(p+1)=1209600·1,21/2,1=696960.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skAnnuity,
      text: "Бизнесмен Олег в январе 2016 года взял кредит в банке под 20% годовых на 3 года с аннуитетными платежами. Сколько рублей в итоге выплатил Олег банку, если известно, что его переплата по кредиту составила 675 500 рублей?",
      answerType: "NUMBER",
      correctAnswer: "2268000",
      keyFormula: "x = Sp³/(1+p+p²), 3x−S=переплата",
      hints: [
        "Введите p=1+20/100=6/5. Из таблицы за 3 года выведите x=Sp³/(1+p+p²).",
        "Второе уравнение — из условия переплаты: 3x−S=675500. Подставьте S=3x−675500 в первое уравнение и решите относительно x.",
      ],
      explanation: "x=Sp³/(1+p+p²). Подставив S=3x−675500 и p=6/5, получаем x=756000. Итоговая выплата: 3x=2268000.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skMixed,
    subtopicId: chEconMain,
    order: 3,
    title: "Смешанные платежи",
    theoryCards: [
      {
        title: "Что такое «смешанный» кредит",
        body: "Условие описывает кредит, где параметры меняются в середине срока: например, первая половина лет долг уменьшается на одну сумму, вторая — на другую; или процентная ставка меняется после нескольких лет. Ключевая идея та же, что и в обычном дифференцированном платеже — просто таблица получается «в два этажа».",
      },
      {
        title: "Как выбрать переменную для x",
        body: "Если известна сумма долга в КАКОЙ-ТО конкретный год (не только в начале и конце), удобно выразить шаг уменьшения долга через эту известную точку — например, разделить известный остаток на количество оставшихся лет. Это часто даёт более простые числа, чем работа от начала кредита.",
      },
      {
        title: "Общая стратегия",
        body: "Составьте таблицу по годам, отмечая явно, где меняются условия (ставка или размер шага). Просуммируйте столбец «Выплата» по частям (для каждого «этажа» отдельно), приравняйте к данной в условии сумме выплат — получится уравнение на неизвестный параметр.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skMixed,
      text: "В июле 2025 года планируется взять кредит в банке на некоторую сумму на 10 лет под 10% годовых (начисляется в январе на остаток долга). С июля 2026 по июль 2030 долг ежегодно уменьшается на одну и ту же величину, а к июлю 2030 долг составит 800 тыс. рублей. С июля 2031 по июль 2035 долг ежегодно уменьшается ещё на одну (другую) величину, и к июлю 2035 кредит выплачен полностью. Сумма всех платежей за весь срок составит 2090 тыс. рублей. Какую сумму планируется взять в кредит?",
      answerType: "DETAILED",
      correctAnswer:
        "Так как с 800 тыс. долг гасится за оставшиеся 5 лет равными шагами, второй шаг уменьшения долга: 800/5=160 тыс. Обозначим первый шаг за x — тогда исходная сумма кредита равна 800+5x. Составив таблицу для первых 5 лет (долг убывает от 800+5x до 800 с начислением 10% каждый год) и для оставшихся 5 лет (от 800 до 0 с шагом 160), сумма всех выплат равна 5x+0,1(800·5+15x)+160·5+(80+16)/2·5=1440+6,5x. Приравнивая к 2090: 6,5x+1440=2090 ⟹ x=100. Кредит: 800+5·100=1300 тыс. рублей.",
      keyFormula: "800+5x — исходная сумма, второй шаг = 800/5=160",
      hints: [
        "Второй шаг уменьшения долга (после 800 тыс.) найдите сразу: 800 тыс. делится поровну на оставшиеся 5 лет.",
        "Обозначьте первый (неизвестный) шаг за x — тогда исходный кредит равен 800+5x. Составьте таблицу и просуммируйте столбец «Выплата» за все 10 лет.",
      ],
      explanation: "Второй шаг: 800/5=160. При первом шаге x исходный кредит 800+5x. Сумма всех выплат: 1440+6,5x=2090 ⟹ x=100. Кредит: 800+500=1300 тыс. руб.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skMixed,
      text: "В июле 2025 года планируется взять кредит на 600 тыс. рублей на 6 лет с дифференцированными платежами. В январе 2026-2028 годов долг возрастает на r% годовых, а в январе 2029-2031 годов — на 15% годовых. К июлю 2031 года долг должен быть погашен полностью. Чему равно r, если общая сумма выплат составит 930 тыс. рублей?",
      answerType: "NUMBER",
      correctAnswer: "16",
      keyFormula: "390+300+15r=930",
      hints: [
        "Шаг уменьшения долга: 600/6=100 тыс. в год.",
        "Составьте таблицу за 6 лет — первые 3 года начисление по ставке r%, последние 3 — по 15%. Просуммируйте столбец «Выплата».",
      ],
      explanation: "Сумма выплат за первые 3 года (с неизвестной ставкой r): 3·100+r·(6+5+4)/100·100=300+15r. За последние 3 года (ставка 15%): 3·100+15·(3+2+1)=390. Итого: 300+15r+390=930 ⟹ r=16.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skDeposits,
    subtopicId: chEconDeposits,
    order: 1,
    title: "Вклады",
    theoryCards: [
      {
        title: "Вклад — это кредит наоборот",
        body: "В кредите клиент занимает деньги у банка, и его ДОЛГ растёт. Во вкладе банк «занимает» деньги у клиента, и его КАПИТАЛ растёт. Формулы очень похожи: если по вкладу начисляется r% в год, за n лет сумма умножается на (1+r/100)ⁿ.",
      },
      {
        title: "Таблица для вклада",
        body: "Столбцы: сумма ДО начисления % / сумма ПОСЛЕ начисления % / (опционально) сумма после дополнительного действия — если клиент что-то снимает или докладывает. Если дополнительных действий нет, третий столбец не нужен.",
      },
      {
        title: "Сравнение двух вкладов",
        body: "Если нужно сравнить выгодность двух разных схем начисления — составьте отдельную формулу итоговой суммы для каждой схемы и запишите неравенство «схема Б выгоднее схемы А» как (итог Б) > (итог А). Решите относительно неизвестного параметра.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skDeposits,
      text: "Клиент хочет открыть вклад на три года. По вкладу «А» банк в конце каждого года увеличивает сумму на 10%. По вкладу «Б» — увеличивает сумму на 14% в течение каждого из первых двух лет. Найдите наименьшее натуральное число процентов, начисленное за третий год по вкладу «Б», при котором за все три года этот вклад будет более выгоден, чем вклад «А».",
      answerType: "NUMBER",
      correctAnswer: "3",
      keyFormula: "1,14²·(1+x/100) > 1,1³",
      hints: [
        "Итоговая сумма по вкладу А за 3 года: S·1,1³. По вкладу Б: S·1,14²·(1+x/100).",
        "Составьте неравенство «Б выгоднее А» и решите его относительно x — не забудьте округлить до наименьшего НАТУРАЛЬНОГО числа.",
      ],
      explanation: "1,14²·(1+x/100)>1,1³ ⟹ 1,2996·(1+x/100)>1,331 ⟹ x>2,416. Наименьшее натуральное: x=3.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skDeposits,
      text: "Клиент вложил некоторую сумму под 10% годовых, начисляемых раз в год. В конце первого года (после начисления процентов) он снял 10% от имеющейся суммы, а в конце второго года (тоже после начисления) доложил 10% от имеющейся суммы. На сколько процентов изменилась сумма на счёте в конце третьего года (после начисления) по сравнению с первоначальным вкладом?",
      answerType: "NUMBER",
      correctAnswer: "31.769",
      hints: [
        "Считайте по шагам: начисление → снятие → начисление → доклад → начисление. Каждое действие — умножение текущей суммы на соответствующий коэффициент.",
        "В конце сравните итоговую сумму с первоначальной суммой S — разница в процентах и есть ответ.",
      ],
      explanation: "По шагам: начисление(×1,1)→снятие(×0,9)→начисление(×1,1)→доклад(×1,1)→начисление(×1,1). Итоговый множитель: 1,1⁴·0,9=1,31769. Рост на 31,769%.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skDeposits,
      text: "В январе 2014 года Андрей сделал вклад в размере 6 640 000 рублей под y процентов годовых. В феврале 2014 года он взял кредит на покупку квартиры стоимостью 9 млн рублей под 21% годовых на 15 лет с дифференцированными платежами. Найдите наименьшее число y, чтобы процентов, начисляемых на вклад каждый год, было достаточно для внесения платежей по кредиту.",
      answerType: "DETAILED",
      correctAnswer:
        "Кредит: шаг уменьшения долга 9000/15=600 тыс. руб/год. Платёж в 1-й год: 600+0,21·9000. Так как проценты по вкладу растут год от года, а платежи по кредиту убывают, достаточно проверить условие только для 1-го года: 6640·y/100⩾600+0,21·9000. Решая: 664y⩾6000+1890 ⟹ y⩾24900/664=37,5.",
      keyFormula: "6640y/100 ⩾ 600+0,21·9000",
      hints: [
        "Ключевой логический приём: проценты по вкладу растут с каждым годом, а платежи по кредиту убывают — поэтому достаточно проверить только САМЫЙ ПЕРВЫЙ год.",
        "Составьте неравенство для 1-го года и решите его относительно y.",
      ],
      explanation: "Достаточно 1-го года: 6640y/100⩾600+0,21·9000 ⟹ 664y⩾7890 ⟹ y⩾37,5. Наименьшее y=37,5.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skDeposits,
      text: "Планируется открыть вклад в банке в размере 10 млн рублей на 4 года под 10% годовых. В начале третьего и четвёртого годов вкладчик дополнительно пополняет счёт на целое число m млн рублей ежегодно. Найдите наименьшее значение m, при котором банк за 4 года начислит на вклад более 7 млн рублей (чистая прибыль).",
      answerType: "NUMBER",
      correctAnswer: "8",
      keyFormula: "чистая прибыль = итоговая сумма − (10+2m)",
      hints: [
        "Составьте таблицу роста вклада с учётом двух дополнительных пополнений в 3-м и 4-м годах.",
        "Чистая прибыль = итоговая сумма на счету минус ВСЕ вложенные деньги (10+m+m). Составьте неравенство >7 и найдите наименьшее целое m.",
      ],
      explanation: "Итоговая сумма: 1,1(1,1(1,1²·10+m)+m). Чистая прибыль>7 даёт неравенство 0,31m>2,359 ⟹ m>7,61. Наименьшее целое: m=8.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skOptimization,
    subtopicId: chEconOptimization,
    order: 1,
    title: "Оптимизация",
    theoryCards: [
      {
        title: "План решения задач на оптимизацию",
        body: "1) Запишите функцию, максимум/минимум которой нужно найти. 2) Найдите «условие связки» — уравнение, связывающее переменные (обычно дано в условии, например x+y=30). 3) Выразите одну переменную через другую и подставьте в функцию — получится функция одной переменной. 4) Найдите максимум/минимум этой функции — методами, аналогичными номеру 12 (через производную или, если функция квадратичная, через вершину параболы).",
      },
      {
        title: "Квадратичная функция — самый частый случай",
        formula: "x₀ = −b/(2a)  (вершина параболы y=ax²+bx+c)",
        body: "Если после подстановки условия связки функция оказывается квадратичной, не нужна производная — сразу используйте формулу вершины параболы. Если старший коэффициент a<0 (ветви вниз) — вершина даёт МАКСИМУМ, если a>0 — МИНИМУМ.",
      },
      {
        title: "Изящная альтернатива — неравенство о средних",
        formula: "(a+b)/2 ⩾ √(ab),  равенство при a=b",
        body: "Если нужно максимизировать ПРОИЗВЕДЕНИЕ двух величин при ФИКСИРОВАННОЙ их сумме — не обязательно строить квадратичную функцию и искать вершину параболы. По неравенству о средних произведение ab максимально ровно тогда, когда a=b — это часто даёт ответ в одну строчку.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skOptimization,
      text: "В январе 2014 года ставка по депозитам в банке составила x% годовых, а в январе 2015 — y% годовых. Вкладчик положил на счёт некоторую сумму в январе 2014 года. В январе 2015 года он снял со счёта пятую часть от суммы, которую положил в 2014 году. Найдите значение x, при котором сумма на счёте в январе 2016 года будет наибольшей, если x+y=30.",
      answerType: "DETAILED",
      correctAnswer:
        "Обозначим S — сумму вклада. К январю 2016: S(1+x/100−1/5)(1+y/100). Подставив y=30−x, получаем f(x)=(1/100²)(x+80)(130−x)=(1/100²)(−x²+50x+80·130) — квадратичная функция с ветвями вниз. Максимум в вершине x₀=−50/(2·(−1))=25.",
      keyFormula: "x₀=−b/(2a) для f(x)=−x²+50x+...",
      hints: [
        "Составьте функцию итоговой суммы через x и y, подставьте условие связки y=30−x.",
        "После раскрытия скобок получится квадратичная функция — найдите вершину параболы.",
      ],
      explanation: "f(x)∝(x+80)(130−x)=−x²+50x+10400 — парабола с ветвями вниз, вершина (максимум) в x=−50/(−2)=25.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skOptimization,
      text: "Компания изготавливает и продаёт изделия. Если одно изделие стоит 2000 рублей, то реализуется 1000 штук. При снижении цены на 50 рублей объём реализации возрастает на 50 штук. При какой цене фирма получит максимальный доход и каково его значение?",
      answerType: "DETAILED",
      correctAnswer:
        "Пусть x — количество снижений цены на 50 руб. Цена: 2000−50x, объём: 1000+50x. Доход: f(x)=(2000−50x)(1000+50x)=2500(40−x)(20+x)=2500(−x²+20x+800). Парабола с ветвями вниз, максимум в x₀=−20/(−2)=10. Цена: 2000−500=1500 руб. Доход: f(10)=1500·1550=2250000 руб.",
      keyFormula: "f(x)=(2000−50x)(1000+50x)",
      hints: [
        "Введите x — количество снижений цены на 50 рублей. Выразите цену и объём реализации через x.",
        "Доход = цена × объём. Раскройте скобки — получится квадратичная функция, найдите вершину параболы.",
      ],
      explanation: "f(x)=(2000−50x)(1000+50x), максимум при x=10. Цена: 1500 руб. Доход: 2250000 руб.",
      difficulty: 2,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skOptimization,
      text: "На двух заводах Александра производят одинаковый товар: на первом при t² часов работы в неделю производится t единиц товара, на втором при t² часов — 2t единиц. Зарплата рабочего 300 руб/час. Найдите наименьшую сумму на зарплаты в неделю, чтобы оба завода вместе произвели 600 единиц товара. Ответ дайте в млн рублей.",
      answerType: "NUMBER",
      correctAnswer: "21.6",
      keyFormula: "f(y)=300((600−2y)²+y²)",
      hints: [
        "Пусть x — единиц товара на первом заводе (требует x² часов), 2y — на втором (требует y² часов).",
        "Условие связки: x+2y=600. Выразите x через y и подставьте в функцию затрат f=300(x²+y²) — получится квадратичная функция от y.",
      ],
      explanation: "f(y)=300((600−2y)²+y²), минимум в y=240, тогда x=120. Минимальные затраты: 300(120²+240²)=21600000 руб=21,6 млн руб.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skOptimization,
      text: "Фёдор владеет двумя заводами: на первом при 25t³ часов в неделю производится t изделий, на втором при t³ часов — t изделий. Зарплата 360 руб/час на каждом заводе. Нужно суммарно производить 30 изделий в неделю. Какую наименьшую сумму (в млн рублей) придётся тратить на зарплаты еженедельно?",
      answerType: "NUMBER",
      correctAnswer: "6.75",
      keyFormula: "f(x)=360(25x³+(30−x)³)",
      hints: [
        "Пусть x — изделий на первом заводе (25x³ часов), 30−x — на втором ((30−x)³ часов).",
        "Минимизируйте f(x)=360(25x³+(30−x)³) — здесь понадобится настоящая производная (функция кубическая, не квадратичная).",
      ],
      explanation: "Производная даёт уравнение 2x²+5x−75=0, положительный корень x=5 (в допустимых границах [0;30]). f(5)=6750000 руб=6,75 млн руб.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skOptimization,
      text: "Строительство завода стоит 78 млн рублей. Затраты на производство x тыс. единиц продукции равны 0,5x²+2x+6 млн рублей в год. При цене p тыс. рублей за единицу прибыль фирмы за год составит px−(0,5x²+2x+6) млн рублей, причём фирма выбирает x так, чтобы прибыль была наибольшей. При каком наименьшем p строительство завода окупится не более чем за 3 года?",
      answerType: "DETAILED",
      correctAnswer:
        "Прибыль P(x)=px−(0,5x²+2x+6) — парабола с ветвями вниз по x, максимум в x=p−2. Максимальная прибыль: Pmax=0,5(p−2)²−6. Для окупаемости за 3 года нужно Pmax⩾78/3=26: 0,5(p−2)²−6⩾26 ⟹ (p−2)²⩾64 ⟹ p−2⩾8 (так как p−2>0, это количество товара) ⟹ p⩾10. Наименьшее p=10.",
      keyFormula: "Pmax=0,5(p−2)²−6 ⩾ 26",
      hints: [
        "Сначала найдите оптимальное x (при произвольном фиксированном p) через вершину параболы по x — получится x=p−2.",
        "Подставьте найденный x обратно в P(x), чтобы получить максимальную прибыль как функцию от p. Решите неравенство Pmax⩾78/3.",
      ],
      explanation: "x_опт=p−2, Pmax=0,5(p−2)²−6. Из Pmax⩾26: (p−2)²⩾64 ⟹ p⩾10 (отбрасываем p⩽−6 как нефизичное, т.к. p−2>0).",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skComplexCredit,
    subtopicId: chEconMain,
    order: 4,
    title: "Сложные задачи на кредиты",
    theoryCards: [
      {
        title: "Когда условие не описывает шаг долга напрямую",
        body: "Иногда вместо «долг уменьшается на одну и ту же величину» дана ТАБЛИЦА с конкретными значениями долга за несколько первых периодов, а дальше — общее правило (например, «начиная с такого-то года долг уменьшается равномерно»). Из данных чисел найдите сам шаг уменьшения, затем выразите оставшийся неизвестный параметр (сумму кредита или срок) через данные условия.",
      },
      {
        title: "Смена условий платежа в середине срока",
        body: "Если платёж меняется (например, увеличивается в несколько раз после определённого события — как окончание учёбы), заведите единую таблицу через удобное обозначение p=1+r/100, но с разными платежами на разных этапах. Итоговое уравнение (долг в конце = 0) получится длиннее, но решается той же техникой — раскрытием скобок и приведением подобных.",
      },
      {
        title: "Не пугайтесь длинных выражений",
        body: "В сложных задачах промежуточные выражения могут содержать степени дроби (например, (6/5)⁶) — не вычисляйте их сразу десятичным приближением, работайте с точными дробями до самого конца, это часто даёт красивое сокращение в финале.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skComplexCredit,
      text: "Николай взял кредит 1 января 2015 года на сумму S млн рублей. Условия: 1 марта каждого года долг увеличивается на 10%, с 1 мая по 1 августа выплачивается часть долга. Известно, что в феврале 2015-2020 годов долг составлял S, S−1, S−2, S−2,4, S−2,8, S−3 млн руб. соответственно, а начиная с 2020 года долг уменьшается равномерно на 200 тыс. рублей в год. В каком году Николай планирует совершить последний платёж, если общая сумма выплат равна 17 680 000 рублей?",
      answerType: "DETAILED",
      correctAnswer:
        "Обозначим n — номер последнего года. Из условия «долг после платежа в последний год=0»: S−3−0,2(n−5)=0 ⟹ S=0,2n+2. Сумма платежей за 2015-2019 годы: 3+0,1(5S−8,2). Сумма платежей за оставшиеся годы (арифметическая прогрессия): (0,1(S−3)+0,2+0,22)/2·(n−5). Приравнивая общую сумму к 17,68 и подставляя S=0,2n+2, получаем квадратное уравнение n²+21n−1530=0, откуда n=30. Год последнего платежа: 2015+30−1=2044.",
      keyFormula: "n²+21n−1530=0",
      hints: [
        "Из данных значений долга в таблице найдите связь между S и n через условие «долг после последнего платежа = 0».",
        "Сумма платежей после 2019 года образует арифметическую прогрессию — используйте формулу суммы.",
      ],
      explanation: "Решая квадратное уравнение относительно n, получаем n=30 (номер года). Год последнего платежа: 2015+29=2044.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skComplexCredit,
      text: "В июле 2025 года планируется взять кредит на n лет. Условия: в январе каждого года (с 2026) долг возрастает на 10%; в июле 2026-2029 годов долг уменьшается на 20 тыс. рублей относительно июля предыдущего года; начиная с июля 2030 — на 10 тыс. рублей; к июлю (2025+n)-го года долг погашен полностью. На какое наименьшее количество лет должен быть взят кредит, чтобы седьмой платёж был не менее 30 тыс. рублей?",
      answerType: "NUMBER",
      correctAnswer: "26",
      keyFormula: "S=10n+40, платёж₇=0,1(S−100)+10⩾30",
      hints: [
        "Из условия «долг в конце срока = 0» выразите сумму кредита S через n.",
        "Составьте выражение для седьмого платежа через S, приравняйте неравенству ⩾30 и найдите минимальное целое n.",
      ],
      explanation: "S=10n+40. Платёж за 7-й год: 0,1(S−100)+10⩾30 ⟹ S⩾300 ⟹ 10n+40⩾300 ⟹ n⩾26.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    },
    {
      id: stableId("p"),
      skillId: skComplexCredit,
      text: "На последние два года обучения студент взял образовательный кредит: банк ежегодно (в течение 2 лет) перечисляет университету стоимость года обучения S; ежегодно в ноябре начисляется 20% на долг; в декабре каждого года обучения студент платит x; после окончания обучения ещё 2 года студент платит по 5x. Сколько составит переплата, если год обучения стоит 402500 рублей?",
      answerType: "NUMBER",
      correctAnswer: "491000",
      keyFormula: "p=1+20/100=6/5; итоговое уравнение через 4 года",
      hints: [
        "Введите p=6/5. Составьте таблицу на 4 года — в первые 2 года банк дополнительно перечисляет S университету, платежи студента x; в последние 2 года платежи 5x.",
        "Из условия «долг в конце 4-го года=0» выведите уравнение на x, затем найдите переплату как (сумма всех платежей)−(сумма кредита, то есть 2S).",
      ],
      explanation: "Решая уравнение из таблицы: x=108000. Сумма платежей: 2x+10x=12x=1296000. Переплата: 12x−2S=1296000−805000=491000.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    }
  );

  db.skills.push({
    id: skFunds,
    subtopicId: chEconFunds,
    order: 1,
    title: "Фонды и акции",
    theoryCards: [
      {
        title: "Метод множителей — сравнение соседних отношений",
        body: "Вместо сравнения абсолютных величин удобно посчитать, НА ЧТО умножается величина при переходе от одного периода к следующему (отношение соседнего члена к предыдущему). Если этот множитель БОЛЬШЕ фиксированного множителя альтернативы (например, банковской ставки r) — выгоднее не менять стратегию; как только множитель становится МЕНЬШЕ — наступает момент переключения.",
      },
      {
        title: "«Гарантированный» сценарий при неопределённости",
        body: "Если в условии сказано «дорожает не более чем на p%», а нужно гарантировать результат независимо от точного роста — считайте худший для вас случай (например, если копите деньги на дорожающий актив, предполагайте, что он растёт МАКСИМАЛЬНО быстро — на все p% каждый раз), иначе плана может не хватить.",
      },
    ],
  });

  db.problems.push(
    {
      id: stableId("p"),
      skillId: skFunds,
      text: "Страховой фонд владеет акциями стоимостью t² тыс. рублей в конце года t (t=1,2,...). Если продать все акции в конце года и положить в банк, каждый следующий год сумма умножается на r>1. Известно, что продажа именно в конце 21-го года даёт наибольшую прибыль в конце 25-го года. В каких пределах может находиться r?",
      answerType: "DETAILED",
      correctAnswer:
        "Методом множителей: отношение стоимости акций в год t к году t−1 равно t²/(t−1)². Продажа в 21-м году оптимальна, когда множитель фонда в 20-й год ещё больше r (не продавать), а в 21-й год уже меньше r (пора продавать): 21²/20² > r > 22²/21². Вычисляя: 441/400 > r > 484/441, то есть r∈(484/441; 441/400).",
      keyFormula: "22²/21² < r < 21²/20²",
      hints: [
        "Посчитайте отношение стоимости акций в соседние годы (t/(t−1))² — эта последовательность убывает.",
        "Продажа в год k оптимальна, когда множитель фонда в год k ещё превышает r, а в год k+1 уже меньше r — запишите это как двойное неравенство.",
      ],
      explanation: "Множитель в 20→21 год: 21²/20²=441/400. Множитель в 21→22 год: 22²/21²=484/441. Диапазон: 484/441<r<441/400.",
      difficulty: 3,
      egeTaskNumber: 16,
    },
    {
      id: stableId("p"),
      skillId: skFunds,
      text: "Александр хочет купить пакет акций за 100000 рублей. В начале года у него нет денег. В середине каждого месяца он откладывает одну и ту же сумму x, а в конце месяца пакет дорожает, но не более чем на 30%. Какую наименьшую сумму x нужно откладывать каждый месяц, чтобы гарантированно купить пакет?",
      answerType: "NUMBER",
      correctAnswer: "54925",
      keyFormula: "минимум minX(n)=100·1,3ⁿ⁻¹/n, методом множителей",
      hints: [
        "Считайте худший случай — цена растёт ровно на 30% каждый месяц. Минимальный x для покупки в месяце n равен (цена в начале месяца n)/n.",
        "Методом множителей (отношение minX(n+1)/minX(n)=1,3n/(n+1)) найдите, при каком n последовательность minX(n) достигает минимума — это происходит, когда множитель впервые превышает 1.",
      ],
      explanation: "Множитель 1,3n/(n+1) впервые превышает 1 при переходе от n=4 к n=5, значит минимум в n=4: minX(4)=100·1,3³/4 тыс.руб=54,925 тыс.руб=54925 руб.",
      difficulty: 3,
      egeTaskNumber: 16,
      tier: "bank",
    }
  );

  // ---------------- Демо-данные ниже — только при первом запуске ----------------
  if (isFreshInstall) {
  // Полина Соколова — решила абсолютно всё в основном уроке (core), чтобы
  // можно было посмотреть, как выглядит полностью пройденный курс: все
  // навыки "Пройдено", все развёрнутые решения одобрены, домашка выполнена.
  const coreProblems = db.problems.filter((p) => (p.tier ?? "core") === "core");
  let day = 20;
  for (const p of coreProblems) {
    const createdAt = new Date(Date.now() - day * 86400 * 1000).toISOString();
    if (p.answerType === "DETAILED") {
      db.attempts.push({
        id: stableId("a"),
        studentId: student3Id,
        problemId: p.id,
        answer: p.correctAnswer,
        isCorrect: true,
        source: "lesson",
        reviewStatus: "approved",
        teacherFeedback: "Отличное, подробное решение!",
        createdAt,
      });
    } else {
      db.attempts.push({
        id: stableId("a"),
        studentId: student3Id,
        problemId: p.id,
        answer: p.correctAnswer,
        isCorrect: true,
        source: "lesson",
        createdAt,
      });
    }
    day = Math.max(0, day - 1);
  }

  // Артём Волков — тестовый аккаунт для проверки SRS: решил core-задачи
  // первых двух навыков "Треугольников". Само состояние повторения (какая
  // задача когда снова "созреет") проставляется отдельно, напрямую в
  // Postgres, ПОСЛЕ commitToDatabase внизу файла — SRS не часть общего
  // накопителя db.*, а таблица со своей отдельной бизнес-логикой.
  const srsCoreProblems = db.problems.filter(
    (p) => (p.skillId === skAngles || p.skillId === skCevians) && (p.tier ?? "core") === "core"
  );
  for (const p of srsCoreProblems) {
    db.attempts.push({
      id: stableId("a"),
      studentId: srsTestUserId,
      problemId: p.id,
      answer: p.correctAnswer,
      isCorrect: true,
      source: "lesson",
      createdAt: new Date(Date.now() - 5 * 86400 * 1000).toISOString(),
    });
  }

  // ---------------- Домашка / контрольная / пробник ----------------
  const anglesProblems = db.problems.filter((p) => p.skillId === skAngles).map((p) => p.id);
  const pythagorasProblems = db.problems.filter((p) => p.skillId === skPythagoras).map((p) => p.id);

  const dueSoon = new Date();
  dueSoon.setDate(dueSoon.getDate() + 5);
  const dueLater = new Date();
  dueLater.setDate(dueLater.getDate() + 10);

  db.homeworks.push(
    {
      id: stableId("h"),
      teacherId,
      studentId: student1Id,
      title: "Углы и теорема Пифагора: базовые задачи",
      kind: "homework",
      allowHints: true,
      problemIds: [...anglesProblems, ...pythagorasProblems.slice(0, 2)],
      dueDate: dueSoon.toISOString(),
      createdAt: new Date().toISOString(),
    },
    {
      id: stableId("h"),
      teacherId,
      studentId: student1Id,
      title: "Контрольная: треугольники",
      kind: "test",
      allowHints: false,
      problemIds: [...anglesProblems, ...pythagorasProblems.slice(0, 2)],
      dueDate: dueLater.toISOString(),
      createdAt: new Date().toISOString(),
    }
  );

  // Полине даём уже выполненную контрольную — чтобы было видно, как выглядит
  // полностью сданное задание (не только путь обучения).
  const circleProblemsForHw = db.problems.filter((p) => p.skillId === skCircleLengthArea).map((p) => p.id);
  const polinaHwId = stableId("h");
  const polinaHwDue = new Date();
  polinaHwDue.setDate(polinaHwDue.getDate() + 7);
  db.homeworks.push({
    id: polinaHwId,
    teacherId,
    studentId: student3Id,
    title: "Пробник: планиметрия",
    kind: "exam",
    allowHints: false,
    problemIds: [...anglesProblems.slice(0, 2), ...circleProblemsForHw.slice(0, 2)],
    dueDate: polinaHwDue.toISOString(),
    createdAt: new Date().toISOString(),
  });
  for (const pid of [...anglesProblems.slice(0, 2), ...circleProblemsForHw.slice(0, 2)]) {
    const problem = db.problems.find((p) => p.id === pid)!;
    db.attempts.push({
      id: stableId("a"),
      studentId: student3Id,
      problemId: pid,
      answer: problem.correctAnswer,
      isCorrect: true,
      source: "assignment",
      createdAt: new Date(Date.now() - 2 * 86400 * 1000).toISOString(),
    });
  }

  // Авторский пробник платформы — доступен ЛЮБОМУ самостоятельному
  // пользователю на Pro-плане (не привязан к конкретному studentId).
  const pythagorasProblemsForExam = db.problems.filter((p) => p.skillId === skPythagoras && p.answerType !== "DETAILED").map((p) => p.id);
  const trapezoidProblemsForExam = db.problems.filter((p) => p.skillId === skTrapezoidMidlineArea).map((p) => p.id);
  const proExamDue = new Date();
  proExamDue.setDate(proExamDue.getDate() + 30);
  db.homeworks.push({
    id: stableId("h"),
    teacherId,
    audience: "pro_standalone",
    title: "Авторский пробник №1: планиметрия",
    kind: "exam",
    allowHints: false,
    timeLimitMinutes: 40,
    problemIds: [
      ...anglesProblems.slice(0, 2),
      ...pythagorasProblemsForExam.slice(0, 2),
      ...trapezoidProblemsForExam.slice(0, 2),
    ],
    dueDate: proExamDue.toISOString(),
    createdAt: new Date().toISOString(),
  });

  // ---------------- Немного истории попыток ----------------
  db.attempts.push(
    {
      id: stableId("a"),
      studentId: student1Id,
      problemId: anglesProblems[0],
      answer: "60",
      isCorrect: true,
      source: "lesson",
      createdAt: new Date(Date.now() - 172800000).toISOString(),
    },
    {
      id: stableId("a"),
      studentId: student1Id,
      problemId: anglesProblems[1],
      answer: "50",
      isCorrect: true,
      source: "lesson",
      createdAt: new Date(Date.now() - 172000000).toISOString(),
    },
    // ошибка для демонстрации "разбора ошибок" у учителя
    {
      id: stableId("a"),
      studentId: student1Id,
      problemId: pythagorasProblems[0],
      answer: "48",
      isCorrect: false,
      source: "lesson",
      createdAt: new Date(Date.now() - 3600000).toISOString(),
    },
    // развёрнутое решение, ожидающее проверки — для демонстрации ревью
    {
      id: stableId("a"),
      studentId: student1Id,
      problemId: pythagorasProblems[2],
      answer:
        "Гипотенуза = корень(9*9+12*12) = корень(225) = 15. Медиана к гипотенузе равна половине гипотенузы, то есть 7.5.",
      isCorrect: false,
      source: "lesson",
      reviewStatus: "pending",
      createdAt: new Date(Date.now() - 1800000).toISOString(),
    }
  );

  // ---------------- Журнал занятий ----------------
  const d1 = new Date();
  d1.setDate(d1.getDate() - 6);
  const d2 = new Date();
  d2.setDate(d2.getDate() - 2);

  db.lessonLogs.push(
    {
      id: stableId("l"),
      teacherId,
      studentId: student1Id,
      date: d1.toISOString().slice(0, 10),
      topic: "Треугольники: углы и теорема Пифагора",
      report:
        "Повторили сумму углов треугольника и признак равнобедренного треугольника. Разобрали теорему Пифагора на трёх примерах, в том числе распознавание прямоугольного треугольника по тройке сторон (5-12-13). Максим быстро схватывает формулы, но иногда торопится с арифметикой — договорились проверять вычисления в конце. Домашнее задание выдано.",
      createdAt: d1.toISOString(),
    },
    {
      id: stableId("l"),
      teacherId,
      studentId: student1Id,
      date: d2.toISOString().slice(0, 10),
      topic: "Неравенства",
      report:
        "Начали тему неравенств: линейные и квадратные, метод интервалов. Разобрали типичную ошибку — потерю знака при делении на отрицательное число. К концу занятия Максим самостоятельно решил 4 из 5 неравенств. Нужно закрепить метод интервалов на следующем занятии перед переходом к дробно-рациональным неравенствам.",
      createdAt: d2.toISOString(),
    }
  );
  } // конец if (isFreshInstall) для демо-данных

  await commitToDatabase(db, isFreshInstall);

  // SRS-состояния для Артёма Волкова — напрямую в Postgres (не часть
  // db.*-накопителя выше). Половина задач уже "просрочена" (готова к
  // повторению прямо сейчас), половина ещё впереди — реалистичная
  // смешанная очередь, а не искусственно "всё готово сразу".
  if (isFreshInstall) {
    const now = Date.now();
    const srsProblemsForSeed = db.problems.filter(
      (p) => (p.skillId === skAngles || p.skillId === skCevians) && (p.tier ?? "core") === "core"
    );
    for (let i = 0; i < srsProblemsForSeed.length; i++) {
      const p = srsProblemsForSeed[i];
      const overdue = i % 2 === 0; // чередуем: просрочено / ещё нет
      const box = overdue ? 1 : 2;
      const nextReviewAt = overdue
        ? new Date(now - 2 * 3600 * 1000) // 2 часа назад — уже пора повторять
        : new Date(now + 3 * 86400 * 1000); // через 3 дня — ещё рано
      await pgDb.insert(schema.srsStates).values({
        studentId: srsTestUserId,
        problemId: p.id,
        box,
        reviewCount: 1,
        lastReviewedAt: new Date(now - 5 * 86400 * 1000),
        nextReviewAt,
      });
    }
  }

  if (isFreshInstall) {
    console.log("✅ База данных создана и заполнена демо-данными.");
    console.log("");
    console.log("Демо-аккаунты (пароль у всех: demo1234):");
    console.log("  Учитель:  teacher@demo.ru");
    console.log("  Ученик:   student@demo.ru   (домашка, контрольная, журнал занятий, 1 ответ на проверке)");
    console.log("  Ученик 2: student2@demo.ru  (чистый прогресс)");
    console.log("  Ученик 3: student3@demo.ru  (весь курс пройден — для обзора всех заданий)");
    console.log("  Free:     free@demo.ru      (самостоятельный, без учителя, энергия почти на нуле)");
    console.log("  Pro:      pro@demo.ru       (самостоятельный, без учителя, все главы + пробник)");
    console.log("  Родитель: parent@demo.ru    (видит Максима Орлова)");
    console.log("  SRS-тест: srs@demo.ru       (часть задач готова к повторению прямо сейчас)");
  } else {
    console.log("✅ Контент (темы/навыки/задачи) обновлён в Postgres.");
    console.log(
      "   Пользователи, прогресс, попытки, домашки, журнал занятий и уведомления не тронуты — они не пересоздавались."
    );
    console.log("   Если нужно начать с абсолютно чистой базы — запустите: npm run seed:reset");
  }
}

/**
 * Записывает накопленный в памяти объект db в Postgres.
 *
 * Контент (topics/subtopics/skills/problems) — ВСЕГДА upsert (insert ...
 * on conflict do update): у каждой строки стабильный id, повторный запуск
 * безопасно обновляет существующие строки и добавляет новые, но НИКОГДА не
 * удаляет — иначе внешние ключи из attempts/homeworks (ON DELETE CASCADE)
 * утащили бы за собой реальный прогресс учеников.
 *
 * Пользовательские данные (users/parentLinks/attempts/homeworks/...) —
 * пишутся только при первом запуске (isFreshInstall). При повторном запуске
 * эти таблицы просто не трогаются вообще — они уже надёжно живут в Postgres.
 */
async function commitToDatabase(built: DB, isFreshInstall: boolean) {
  await pgDb.transaction(async (tx) => {
    for (const t of built.topics) {
      await tx
        .insert(schema.topics)
        .values(t)
        .onConflictDoUpdate({ target: schema.topics.id, set: { order: t.order, title: t.title } });
    }

    for (const s of built.subtopics) {
      await tx
        .insert(schema.subtopics)
        .values(s)
        .onConflictDoUpdate({
          target: schema.subtopics.id,
          set: { topicId: s.topicId, order: s.order, title: s.title },
        });
    }

    for (const sk of built.skills) {
      const row = { id: sk.id, subtopicId: sk.subtopicId, order: sk.order, title: sk.title, theoryCards: sk.theoryCards };
      await tx
        .insert(schema.skills)
        .values(row)
        .onConflictDoUpdate({
          target: schema.skills.id,
          set: { subtopicId: row.subtopicId, order: row.order, title: row.title, theoryCards: row.theoryCards },
        });
    }

    for (const p of built.problems) {
      const row = {
        id: p.id,
        skillId: p.skillId ?? null,
        text: p.text,
        answerType: p.answerType,
        correctAnswer: p.correctAnswer,
        choices: p.choices ?? null,
        diagram: p.diagram ?? null,
        keyFormula: p.keyFormula ?? null,
        hints: p.hints,
        explanation: p.explanation,
        difficulty: p.difficulty,
        egeTaskNumber: p.egeTaskNumber ?? null,
        tier: p.tier ?? null,
      };
      await tx
        .insert(schema.problems)
        .values(row)
        .onConflictDoUpdate({
          target: schema.problems.id,
          set: {
            skillId: row.skillId,
            text: row.text,
            answerType: row.answerType,
            correctAnswer: row.correctAnswer,
            choices: row.choices,
            diagram: row.diagram,
            keyFormula: row.keyFormula,
            hints: row.hints,
            explanation: row.explanation,
            difficulty: row.difficulty,
            egeTaskNumber: row.egeTaskNumber,
            tier: row.tier,
          },
        });
    }

    if (!isFreshInstall) return; // пользовательские данные уже в базе — не трогаем

    for (const u of built.users) {
      await tx.insert(schema.users).values({
        id: u.id,
        name: u.name,
        email: u.email,
        passwordHash: u.passwordHash,
        role: u.role,
        teacherId: u.teacherId ?? null,
        plan: u.plan ?? null,
        energy: u.energy ?? null,
        energyUpdatedAt: u.energyUpdatedAt ? new Date(u.energyUpdatedAt) : null,
        proUntil: u.proUntil ? new Date(u.proUntil) : null,
        isAdmin: u.isAdmin ?? false,
        createdAt: new Date(u.createdAt),
      });
    }
    for (const l of built.parentLinks) {
      await tx.insert(schema.parentLinks).values(l);
    }
    for (const a of built.attempts) {
      await tx.insert(schema.attempts).values({
        id: a.id,
        studentId: a.studentId,
        problemId: a.problemId,
        answer: a.answer,
        isCorrect: a.isCorrect,
        source: a.source,
        reviewStatus: a.reviewStatus ?? null,
        teacherFeedback: a.teacherFeedback ?? null,
        createdAt: new Date(a.createdAt),
      });
    }
    for (const h of built.homeworks) {
      await tx.insert(schema.homeworks).values({
        id: h.id,
        teacherId: h.teacherId ?? null,
        studentId: h.studentId ?? null,
        title: h.title,
        kind: h.kind,
        allowHints: h.allowHints,
        timeLimitMinutes: h.timeLimitMinutes ?? null,
        audience: h.audience ?? null,
        problemIds: h.problemIds,
        dueDate: new Date(h.dueDate),
        createdAt: new Date(h.createdAt),
      });
    }
    for (const l of built.lessonLogs) {
      await tx.insert(schema.lessonLogs).values({
        id: l.id,
        teacherId: l.teacherId,
        studentId: l.studentId,
        date: l.date,
        topic: l.topic,
        report: l.report,
        createdAt: new Date(l.createdAt),
      });
    }
  });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => process.exit(0));
