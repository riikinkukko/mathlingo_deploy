/**
 * Чертёж задачи для мобильного приложения: тот же компонент, что на сайте
 * (components/diagrams/DiagramRenderer), отрисованный на сервере в строку SVG.
 * Приложение показывает её через react-native-svg (SvgXml) — чертежи не
 * дублируются в двух кодовых базах, а в офлайне работают из кэша.
 */
import { createElement } from "react";
import { renderSvgToString } from "./svg-serialize";
import DiagramRenderer from "@/components/diagrams/DiagramRenderer";
import type { DiagramSpec } from "@/lib/types";

const cache = new Map<string, string>();

export function diagramSvg(spec: DiagramSpec | undefined | null): string | null {
  if (!spec) return null;
  const key = JSON.stringify(spec);
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  let svg = "";
  try {
    svg = renderSvgToString(createElement(DiagramRenderer, { spec }));
    // Классы Tailwind внутри SVG приложению не нужны; шрифт — системный.
    svg = inlineStyles(svg.replace(/\sclass="[^"]*"/g, ""));
  } catch (e) {
    console.error("[mobile] не удалось отрисовать чертёж", spec.kind, e);
  }
  if (cache.size > 3000) cache.clear();
  cache.set(key, svg);
  return svg || null;
}

/** style="font-size:14px;fill:#123" → font-size="14" fill="#123": react-native-svg
 * надёжнее понимает атрибуты представления, чем inline-CSS. */
function inlineStyles(svg: string): string {
  return svg.replace(/\sstyle="([^"]*)"/g, (_m, css: string) => {
    const attrs = css
      .split(";")
      .map((d) => d.trim())
      .filter(Boolean)
      .map((d) => {
        const i = d.indexOf(":");
        if (i < 0) return "";
        const prop = d.slice(0, i).trim();
        let val = d.slice(i + 1).trim();
        if (prop === "font-family") return "";
        if (/^-?[\d.]+px$/.test(val)) val = val.slice(0, -2);
        return ` ${prop}="${val.replace(/"/g, "'")}"`;
      })
      .join("");
    return attrs;
  });
}
