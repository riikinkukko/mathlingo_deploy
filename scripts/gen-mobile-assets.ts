/**
 * Генерирует SVG-ресурсы мобильного приложения из компонентов сайта, чтобы
 * иконки и маскот Гео выглядели одинаково везде:
 *   npx tsx --tsconfig tsconfig.tsx-test.json scripts/gen-mobile-assets.ts
 * Результат — mobile/src/assets/svg.ts (не редактировать руками).
 */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { writeFileSync } from "fs";
import * as Icons from "../components/icons";
import Mascot, { type MascotMood } from "../components/Mascot";

const icons: Record<string, string> = {};
for (const [name, Comp] of Object.entries(Icons)) {
  if (typeof Comp !== "function" || !name.startsWith("Icon")) continue;
  icons[name.slice(4)] = renderToStaticMarkup(createElement(Comp as any, {})).replace(/\sclass="[^"]*"/g, "");
}

const moods: MascotMood[] = ["idle", "happy", "celebrating", "thinking", "sleepy", "worried", "surprised", "wink", "love", "hint"];
const mascot: Record<string, string> = {};
for (const mood of moods) {
  const html = renderToStaticMarkup(createElement(Mascot, { mood, float: false }));
  const m = /<svg[\s\S]*<\/svg>/.exec(html);
  if (!m) throw new Error("no svg for " + mood);
  // Анимации (CSS-классы и style с animation) приложению не нужны — статичная картинка.
  mascot[mood] = m[0]
    .replace(/\sclass="[^"]*"/g, "")
    .replace(/\sstyle="[^"]*animation[^"]*"/g, "")
    .replace(/\sstyle="[^"]*transform-origin[^"]*"/g, "");
}

const out = `// Сгенерировано scripts/gen-mobile-assets.ts из components/icons.tsx и
// components/Mascot.tsx сайта. Не редактировать руками.
export const ICONS = ${JSON.stringify(icons, null, 2)} as const;

export type IconName = keyof typeof ICONS;

export const MASCOT = ${JSON.stringify(mascot, null, 2)} as const;

export type MascotMood = keyof typeof MASCOT;
`;
writeFileSync("mobile/src/assets/svg.ts", out);
console.log("icons:", Object.keys(icons).length, "moods:", Object.keys(mascot).length);
