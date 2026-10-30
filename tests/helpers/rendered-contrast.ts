import { createRequire } from "node:module";
import postcss from "postcss";

interface Element {
  nodeType: number;
  tagName: string;
  rawText: string;
  attributes: Record<string, string>;
  childNodes: Element[];
  parentNode: Element | null;
  querySelectorAll(selector: string): Element[];
  setAttribute(name: string, value: string): void;
}
const { parse } = createRequire(import.meta.url)("next/dist/compiled/node-html-parser") as { parse(html: string): Element };

function rgba(value: string): number[] {
  if (value.includes("gradient(")) {
    // Conservative endpoint: apply the gradient's strongest tint across its base color.
    const base = value.match(/#[a-f\d]{3,6}\s*$/i)?.[0];
    const tint = value.match(/rgba?\([^)]+\)/)?.[0];
    if (!base || !tint) throw new Error(`Unsupported gradient: ${value}`);
    return over(rgba(tint), rgba(base));
  }
  if (value === "transparent") return [0, 0, 0, 0];
  if (value.startsWith("#")) {
    const hex = value.slice(1);
    const full = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
  }
  if (/^rgba?\(/.test(value)) return (value.match(/[\d.]+/g) ?? []).map(Number);
  throw new Error(`Unsupported contrast color: ${value}`);
}
const over = (fg: number[], bg: number[]) => fg.slice(0, 3).map((c, i) => c * (fg[3] ?? 1) + bg[i] * (1 - (fg[3] ?? 1)));
function luminance(color: number[]): number {
  return color.map((v) => { const s = v / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; })
    .reduce((sum, v, i) => sum + v * [0.2126, 0.7152, 0.0722][i], 0);
}

/** Resolve the color/background cascade on server-rendered markup, including inherited custom properties.
 * Browser layout is unnecessary for normal-size text contrast. Ignore interaction pseudo-classes;
 * data-on/data-open below exercise the components' persistent selected states.
 */
export function renderedContrast(css: string, html: string, selected: boolean) {
  const root = parse(`<html><body>${html}</body></html>`);
  for (const el of root.querySelectorAll("[data-on], [data-open]")) {
    for (const attr of ["data-on", "data-open"]) if (attr in el.attributes) el.setAttribute(attr, String(selected));
  }
  const declarations = new Map<Element, Record<string, { value: string; rank: number }>>();
  const theme: Record<string, string> = {};
  const ast = postcss.parse(css);
  ast.walkAtRules("theme", (rule) => { rule.walkDecls((d) => { theme[d.prop] = d.value; }); });
  let order = 0;
  ast.walkRules((rule) => {
    if (rule.parent?.type !== "root") return;
    for (const selector of rule.selectors) {
      if (/:/.test(selector)) continue;
      const rank = ((selector.match(/#[\w-]+/g) ?? []).length * 100 + (selector.match(/\.[\w-]+|\[[^\]]+\]/g) ?? []).length * 10) * 10000 + order++;
      for (const el of root.querySelectorAll(selector)) {
        const props = declarations.get(el) ?? {};
        rule.walkDecls((d) => { if (!props[d.prop] || props[d.prop].rank <= rank) props[d.prop] = { value: d.value, rank }; });
        declarations.set(el, props);
      }
    }
  });
  const failures: string[] = [];
  const checked: string[] = [];
  function visit(el: Element, inherited: Record<string, string>, background: number[], toneParent: boolean, hidden: boolean) {
    const props = Object.fromEntries(Object.entries(declarations.get(el) ?? {}).map(([key, d]) => [key, d.value]));
    for (const declaration of (el.attributes.style ?? "").split(";")) {
      const colon = declaration.indexOf(":");
      if (colon > 0) props[declaration.slice(0, colon).trim()] = declaration.slice(colon + 1).trim();
    }
    // Tailwind's text color utilities are generated from these same CSS theme values.
    for (const name of (el.attributes.class ?? "").split(/\s+/)) {
      if (name.startsWith("text-") && theme[`--color-${name.slice(5)}`]) props.color = `var(--color-${name.slice(5)})`;
    }
    const vars = { ...inherited, ...Object.fromEntries(Object.entries(props).filter(([key]) => key.startsWith("--"))) };
    const resolve = (value: string): string => value.replace(/var\((--[\w-]+)(?:,\s*([^()]+))?\)/g, (_, key, fallback) => resolve(vars[key] ?? fallback ?? ""));
    const color = resolve(props.color && props.color !== "inherit" ? props.color : inherited.color ?? "#1c1733");
    const bg = over(rgba(resolve(props["background-color"] ?? props.background ?? "transparent")), background);
    const tone = toneParent || "data-tone" in el.attributes || "--tone" in props || /\b(chip|stamp|dash-gauge-num)\b/.test(el.attributes.class ?? "");
    const invisible = hidden || el.tagName === "SVG" || props.display === "none";
    if (tone && !invisible && el.childNodes.some((n) => n.nodeType === 3 && n.rawText.trim())) {
      const a = luminance(over(rgba(color), bg)), b = luminance(bg);
      const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
      const label = el.attributes.class ?? el.rawText;
      checked.push(label);
      if (ratio < 4.5) failures.push(`${label}: ${ratio.toFixed(2)}:1 (${color})`);
    }
    for (const child of el.childNodes) if (child.nodeType === 1) visit(child, { ...vars, color }, bg, tone, invisible);
  }
  for (const el of root.childNodes) if (el.nodeType === 1) visit(el, theme, [255, 255, 255], false, false);
  return { failures, checked };
}
