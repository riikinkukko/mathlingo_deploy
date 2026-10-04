import type { MetadataRoute } from "next";

const BASE = "https://planimetrika.online";

// Публичные страницы для поисковиков: лендинг, посадочные по аудиториям, тарифы.
export default function sitemap(): MetadataRoute.Sitemap {
  return ["", "/repetitoram", "/uchenikam", "/roditelyam", "/tariffs"].map((p) => ({
    url: `${BASE}${p}`,
    changeFrequency: "weekly",
    priority: p === "" ? 1 : 0.8,
  }));
}
