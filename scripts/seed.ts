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
