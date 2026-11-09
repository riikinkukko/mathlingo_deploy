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
    svg = splitHalos(inlineStyles(svg.replace(/\sclass="[^"]*"/g, ""))).replace(/^<svg /, '<svg font-family="sans-serif" ');
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
        // «inherit» в приложении не к чему наследовать — без семейства
        // браузерная версия брала шрифт с засечками.
        if (prop === "font-family") return ` font-family="sans-serif"`;
        if (/^-?[\d.]+px$/.test(val)) val = val.slice(0, -2);
        return ` ${prop}="${val.replace(/"/g, "'")}"`;
      })
      .join("");
    return attrs;
  });
}

/**
 * Подписи на чертежах обведены белым «ореолом» (paint-order="stroke"), чтобы
 * читались поверх линий. react-native-svg paint-order не знает и рисует
 * белую обводку ПОВЕРХ цвета — буквы получались белыми и почти не читались.
 * Поэтому каждую такую подпись раскладываем на две: сначала белая обводка,
 * поверх — та же подпись без обводки.
 */
export function splitHalos(svg: string): string {
  return svg.replace(/<text([^>]*)\spaint-order="stroke"([^>]*)>([\s\S]*?)<\/text>/g, (_m, a: string, b: string, body: string) => {
    const attrs = a + b;
    const strokeColor = /\sstroke="([^"]*)"/.exec(attrs)?.[1] ?? "#fff";
    const plain = attrs.replace(/\sstroke(-[a-z]+)?="[^"]*"/g, "");
    const halo = plain.replace(/\sfill="[^"]*"/, "") + ` fill="${strokeColor}"` + attrs.match(/\sstroke(-[a-z]+)?="[^"]*"/g)!.join("");
    return `<text${halo}>${body}</text><text${plain}>${body}</text>`;
  });
}
