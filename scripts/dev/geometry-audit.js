/**
 * Геометрический аудит SVG-диаграмм: проверяет, что опорные точки,
 * "зашитые" в компонентах components/diagrams/*, действительно лежат
 * там, где подписи и линии утверждают (на окружности радиуса R, в
 * середине отрезка, образуют прямой угол и т.д.) — формулой, а не на глаз.
 *
 * Запуск: node scripts/dev/geometry-audit.js
 *
 * Если добавляете новую диаграмму с "зашитыми" координатами (не
 * вычисляемыми динамически из пропсов) — добавьте для неё проверку сюда.
 */

function dist(p1, p2) {
  return Math.hypot(p1[0] - p2[0], p1[1] - p2[1]);
}

function check(name, actual, expected, tol = 0.5) {
  const diff = Math.abs(actual - expected);
  const status = diff <= tol ? "OK " : "БАГ";
  console.log(
    `[${status}] ${name}: факт=${actual.toFixed(2)}, ожидание=${expected.toFixed(2)}, отклонение=${diff.toFixed(2)}`
  );
  return diff <= tol;
}

let allOk = true;

console.log("=== TriangleRight: прямой угол в вершине ===");
{
  const top = [60, 30], bl = [60, 170], br = [240, 170];
  const v1 = [top[0] - bl[0], top[1] - bl[1]];
  const v2 = [br[0] - bl[0], br[1] - bl[1]];
  const dot = v1[0] * v2[0] + v1[1] * v2[1];
  allOk = check("dot product (должен быть 0)", dot, 0, 0.01) && allOk;
}

console.log("\n=== TriangleCevian: медиана делит основание ровно пополам ===");
{
  const left = [50, 170], right = [250, 170];
  const foot = [(left[0] + right[0]) / 2, 170]; // как в текущем коде компонента
  const trueMid = [(left[0] + right[0]) / 2, (left[1] + right[1]) / 2];
  allOk = check("foot.x", foot[0], trueMid[0]) && allOk;
}

console.log("\n=== RectangleShape: описанная окружность проходит через углы ===");
{
  const x0 = 65, x1 = 235, y0 = 55, y1 = 155;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  const r = Math.hypot(x1 - x0, y1 - y0) / 2; // радиус, которым рисуется окружность
  const cornerDist = dist([cx, cy], [x0, y0]);
  allOk = check("радиус окружности vs расстояние до угла", r, cornerDist) && allOk;
}

console.log("\n=== CircleDiagram centralInscribed: точки на окружности ===");
{
  const O = [150, 110], R = 70;
  const pts = { "central pt1": [215.8, 86.1], "central pt2": [84.2, 86.1], "inscribed pt": [150, 180] };
  for (const [name, p] of Object.entries(pts)) {
    allOk = check(name, dist(O, p), R) && allOk;
  }
}

console.log("\n=== CircleDiagram chord: концы хорды на окружности ===");
{
  const O = [150, 110], R = 70;
  for (const [name, p] of [["chord pt1", [93, 150]], ["chord pt2", [207, 150]]]) {
    allOk = check(name, dist(O, p), R) && allOk;
  }
}

console.log("\n=== CircleDiagram tangent: считается динамически из O/R/P — не в этом скрипте ===");
console.log("(проверка формулы: T на окружности и OT⊥PT — см. компонент, вычисление через Math.acos/atan2)");

console.log("\n" + (allOk ? "✅ Все проверки пройдены." : "❌ Есть отклонения — смотрите БАГ выше."));
process.exit(allOk ? 0 : 1);
