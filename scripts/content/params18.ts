// Задание №18 ЕГЭ-2027: задачи с параметром. Отдельная тема с явными id
// (prm_*), чтобы не сдвигать счётчики stableId в seed.ts.
import type { DB } from "../../lib/types";
import { pushChapters } from "./params/types";
import { ch1 } from "./params/ch1";
import { ch2 } from "./params/ch2";
import { ch3 } from "./params/ch3";
import { ch4 } from "./params/ch4";
import { ch5 } from "./params/ch5";
import { ch6 } from "./params/ch6";

export function addParams18(db: DB) {
  const topicId = "prm_topic";
  db.topics.push({ id: topicId, order: 12, title: "Параметры" });
  pushChapters(db, topicId, [ch1, ch2, ch3, ch4, ch5, ch6]);
}
