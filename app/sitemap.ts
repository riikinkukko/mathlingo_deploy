import type { MetadataRoute } from "next";
import { EGE_TASKS, EGE_TOPICS } from "@/lib/seo/ege-content";

const BASE = "https://planimetrika.online";

// Публичные страницы для поисковиков: лендинг, посадочные по аудиториям,
// тарифы и SEO-страницы по заданиям и темам ЕГЭ (app/ege/*).
export default function sitemap(): MetadataRoute.Sitemap {
  const main = ["", "/repetitoram", "/uchenikam", "/roditelyam", "/tariffs", "/ege"].map((p) => ({
    url: `${BASE}${p}`,
    changeFrequency: "weekly" as const,
    priority: p === "" ? 1 : 0.8,
  }));
  const tasks = EGE_TASKS.map((t) => ({ url: `${BASE}/ege/${t.slug}`, changeFrequency: "monthly" as const, priority: 0.7 }));
  const topics = EGE_TOPICS.map((t) => ({ url: `${BASE}/ege/tema/${t.slug}`, changeFrequency: "monthly" as const, priority: 0.6 }));
  return [...main, ...tasks, ...topics];
}
