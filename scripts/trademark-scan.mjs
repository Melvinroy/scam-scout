import ts from "typescript";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createRequire } from "node:module";

const { HTML_LIMITED_BOT_UA_RE } = createRequire(import.meta.url)("next/dist/shared/lib/router/utils/html-bots");
export const BUILT_COMPATIBILITY_TOKENS = ["Apple Color Emoji", "-apple-system", "-apple-pay-button"];

// Only data initializers used by internal detection may contain these names.
const INTERNAL_CONSTANTS = {
  "lib/agent/regulator-data.ts": ["OFFICIAL"],
  "lib/agent/surface.ts": ["REGULATOR_HOSTS", "GOV_NOTICE_HOSTS"],
  "lib/agent/detect.ts": ["REGULATOR_NAME", "MESSENGER"],
  "lib/agent/lookalike.ts": ["BRAND_DOMAINS"],
  "lib/agent/policy.ts": ["FINGERPRINT"],
  "scripts/trademark-scan.mjs": ["BUILT_COMPATIBILITY_TOKENS"],
};

export function decodeEscapes(text) {
  // Repeat for nested JSON/JS escapes; handle regexp punctuation as well.
  let previous;
  do {
    previous = text;
    text = text.replace(/\\\\/g, "\\").replace(/\\u\{([\da-f]{1,6})\}|\\u([\da-f]{4})|\\x([\da-f]{2})/gi, (match, point, unicode, hex) => {
      const value = Number.parseInt(point ?? unicode ?? hex, 16);
      return value <= 0x10ffff ? String.fromCodePoint(value) : match;
    }).replace(/\\([\\./-])/g, "$1");
  } while (text !== previous);
  return text;
}

function dataOnly(node) {
  if (ts.isStringLiteral(node) || ts.isNumericLiteral(node) || ts.isRegularExpressionLiteral(node)) return true;
  if (ts.isArrayLiteralExpression(node)) return node.elements.every(dataOnly);
  if (ts.isObjectLiteralExpression(node)) return node.properties.every((property) => ts.isPropertyAssignment(property) && !ts.isComputedPropertyName(property.name) && dataOnly(property.initializer));
  return false;
}

export function presentationSource(file, content) {
  const allowed = INTERNAL_CONSTANTS[file] ?? [];
  if (!allowed.length) return content;
  const source = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const ranges = [];
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement) || !(statement.declarationList.flags & ts.NodeFlags.Const)) continue;
    for (const declaration of statement.declarationList.declarations) {
      if (ts.isIdentifier(declaration.name) && allowed.includes(declaration.name.text) && declaration.initializer && dataOnly(declaration.initializer)) {
        ranges.push([declaration.initializer.getStart(source), declaration.initializer.end]);
      }
    }
  }
  for (const [start, end] of ranges.reverse()) content = content.slice(0, start) + content.slice(start, end).replace(/[^\n]/g, " ") + content.slice(end);
  return content;
}

export function trademarkMatches(content, terms, { built = false } = {}) {
  let text = decodeEscapes(content);
  // Security severity identifiers do not refer to an authority.
  text = text.replace(/\bSEC-(?:CRITICAL|HIGH|MEDIUM|LOW)\b/g, "security-severity");
  if (built) {
    // Exact installed framework regexp and CSS compatibility tokens only.
    text = text.replaceAll(HTML_LIMITED_BOT_UA_RE.toString(), "framework-bot-pattern");
    for (const token of BUILT_COMPATIBILITY_TOKENS) text = text.replaceAll(token, "browser-compatibility-token");
  }
  const escape = (term) => term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const deny = new RegExp(`\\b(?:${terms.map(escape).join("|")})\\b`, "gi");
  return [...new Set([...text.matchAll(deny)].map((match) => match[0]))];
}

export function builtTrademarkViolations(directory, terms) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const file = join(directory, entry.name);
    if (entry.isDirectory()) return builtTrademarkViolations(file, terms);
    if (!/\.(?:js|css|json|html|map|txt)$/.test(file)) return [];
    return trademarkMatches(readFileSync(file, "utf8"), terms, { built: true }).map((term) => ({ file, term }));
  });
}
