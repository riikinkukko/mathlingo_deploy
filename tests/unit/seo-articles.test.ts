import { test } from "node:test";
import assert from "node:assert/strict";
import { ARTICLES, articleUrl } from "../../lib/seo/articles";
import sitemap from "../../app/sitemap";

test("статьи: уникальные адреса, рабочие ссылки «читайте также», описания для поиска", () => {
  const urls = ARTICLES.map(articleUrl);
  assert.equal(new Set(urls).size, urls.length);
  const slugs = new Set(ARTICLES.map((a) => a.slug));
  for (const a of ARTICLES) {
    assert.match(a.slug, /^[a-z0-9-]+$/, a.slug);
    for (const r of a.related ?? []) assert.ok(slugs.has(r), `${a.slug} → ${r}`);
    for (const n of a.egeNumbers ?? []) assert.ok(n >= 1 && n <= 20, `${a.slug}: №${n}`);
    assert.ok(a.description.length >= 80 && a.description.length <= 200, `${a.slug}: описание ${a.description.length} символов`);
    assert.ok(a.blocks.length >= 4, a.slug);
  }
  // Не пересекаемся с посадочными страницами
  assert.ok(!urls.includes("/repetitoram") && !urls.includes("/roditelyam"));
});

test("sitemap: все статьи и страница /stati", () => {
  const all = sitemap().map((x) => x.url);
  assert.ok(all.includes("https://planimetrika.online/stati"));
  for (const a of ARTICLES) assert.ok(all.includes(`https://planimetrika.online${articleUrl(a)}`), articleUrl(a));
});
