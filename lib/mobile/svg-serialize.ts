/**
 * Мини-рендер React-элементов чертежа в строку SVG — без react-dom/server
 * (Next.js запрещает его в app/). Компоненты чертежей — чистые функции без
 * хуков (components/diagrams), поэтому достаточно вызвать их и обойти
 * получившееся дерево. Поддерживается то, что встречается в чертежах:
 * SVG-элементы, фрагменты, массивы, текст, атрибут style.
 */
import { Fragment, isValidElement, type ReactNode } from "react";

// Атрибуты SVG, которые в разметке остаются в camelCase.
const KEEP_CAMEL = new Set([
  "viewBox",
  "preserveAspectRatio",
  "gradientUnits",
  "gradientTransform",
  "patternUnits",
  "patternContentUnits",
  "patternTransform",
  "markerWidth",
  "markerHeight",
  "markerUnits",
  "refX",
  "refY",
  "pathLength",
  "textLength",
  "lengthAdjust",
  "startOffset",
  "spreadMethod",
  "clipPathUnits",
  "maskUnits",
  "maskContentUnits",
  "stdDeviation",
  "baseFrequency",
  "numOctaves",
  "kernelMatrix",
]);

const VOID_SAFE = new Set(["path", "line", "circle", "ellipse", "rect", "polygon", "polyline", "stop", "use"]);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
}

function attrName(k: string): string {
  if (k === "className") return "class";
  if (k === "htmlFor") return "for";
  if (k.startsWith("aria") || k.startsWith("data")) return k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
  if (KEEP_CAMEL.has(k)) return k;
  if (k === "xlinkHref") return "xlink:href";
  return k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
}

// Свойства, к числам которых React не добавляет «px» (как isUnitlessNumber в React).
const UNITLESS = new Set([
  "opacity", "font-weight", "line-height", "z-index", "order", "flex", "flex-grow", "flex-shrink", "zoom", "scale",
  "fill-opacity", "flood-opacity", "stop-opacity", "stroke-dasharray", "stroke-dashoffset", "stroke-miterlimit",
  "stroke-opacity", "stroke-width", "column-count", "orphans", "widows", "tab-size", "line-clamp", "aspect-ratio",
]);

function styleString(style: Record<string, unknown>): string {
  return Object.entries(style)
    .filter(([, v]) => v !== null && v !== undefined && v !== false)
    .map(([k, v]) => {
      const prop = k.replace(/[A-Z]/g, (c) => "-" + c.toLowerCase());
      const val = typeof v === "number" && v !== 0 && !UNITLESS.has(prop) ? `${v}px` : String(v);
      return `${prop}:${val}`;
    })
    .join(";");
}

export function renderSvgToString(node: ReactNode, depth = 0): string {
  if (depth > 200) return "";
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string") return esc(node);
  if (typeof node === "number" || typeof node === "bigint") return String(node);
  if (Array.isArray(node)) return node.map((n) => renderSvgToString(n, depth + 1)).join("");
  if (!isValidElement(node)) return "";
  const el = node as { type: unknown; props: Record<string, unknown> };
  const { children, ...props } = el.props ?? {};
  if (el.type === Fragment) return renderSvgToString(children as ReactNode, depth + 1);
  if (typeof el.type === "function") {
    const fn = el.type as (p: Record<string, unknown>) => ReactNode;
    return renderSvgToString(fn(el.props), depth + 1);
  }
  if (typeof el.type !== "string") return "";
  const tag = el.type;
  let attrs = "";
  for (const [k, v] of Object.entries(props)) {
    if (k === "key" || k === "ref" || k === "dangerouslySetInnerHTML" || k.startsWith("on")) continue;
    if (v === null || v === undefined || v === false) continue;
    if (k === "style" && typeof v === "object") {
      const s = styleString(v as Record<string, unknown>);
      if (s) attrs += ` style="${esc(s)}"`;
      continue;
    }
    attrs += v === true ? ` ${attrName(k)}=""` : ` ${attrName(k)}="${esc(String(v))}"`;
  }
  const inner = renderSvgToString(children as ReactNode, depth + 1);
  if (!inner && VOID_SAFE.has(tag)) return `<${tag}${attrs}/>`;
  return `<${tag}${attrs}>${inner}</${tag}>`;
}
