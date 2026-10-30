import { builtTrademarkViolations, presentationSource, trademarkMatches } from "./trademark-scan.mjs";
import { execFile, spawn } from "node:child_process";
import { readFileSync, existsSync, readdirSync, mkdtempSync, openSync, closeSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve, join } from "node:path";

import { tmpdir } from "node:os";
import { promisify } from "node:util";
const execute = promisify(execFile);
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
process.chdir(root);
let failed = false;
function fail(message) { console.error(message); failed = true; }
// Inventories document names intentionally; application files have no whole-file exemptions.
const skip = new Set(["package-lock.json", "docs/trademark-mapping.md", "scripts/trademark-denylist.txt"]);
const terms = readFileSync("scripts/trademark-denylist.txt", "utf8").split(/\r?\n/).map((term) => term.trim()).filter((term) => term && !term.startsWith("#"));
function scan(file, content, built = false) {
  const matches = trademarkMatches(content, terms, { built });
  if (matches.length) fail(`${file}: forbidden trademarks: ${matches.join(", ")}`);
}
const tracked = (await execute("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], { encoding: "utf8" })).stdout.split("\0").filter(Boolean);
for (const file of tracked) {
  if (skip.has(file) || file.split("/").includes("node_modules") || !existsSync(file)) continue;
  const bytes = readFileSync(file);
  if (bytes.includes(0)) continue;
  let content;
  try { content = new TextDecoder("utf-8", { fatal: true }).decode(bytes); } catch { continue; }
  scan(file, presentationSource(file, content));
}
for (const { file, term } of builtTrademarkViolations(".next/static", terms)) fail(`${file}: forbidden trademark: ${term}`);
const replayDirectory = mkdtempSync(join(tmpdir(), "scam-scout-replays-"));
try {
  const output = join(replayDirectory, "responses.json");
  await execute(process.execPath, ["--import", "tsx", "scripts/public-replay-responses.ts", output]);
  const responses = JSON.parse(readFileSync(output, "utf8"));
  if (!responses.length) throw new Error("No public replay responses generated");
  for (const { id, json, sse } of responses) {
    scan(`replay JSON ${id}`, json);
    scan(`replay SSE ${id}`, sse);
  }
} catch {
  fail("Public replay response audit failed");
} finally { rmSync(replayDirectory, { recursive: true, force: true }); }
const allowed = new Set(["MIT", "Apache-2.0", "ISC", "BSD-2-Clause", "BSD-3-Clause", "Zlib", "0BSD", "BlueOak-1.0.0"]);
const exceptions = JSON.parse(readFileSync("scripts/license-exceptions.json", "utf8"));
try {
  const directory = mkdtempSync(join(tmpdir(), "scam-scout-licenses-"));
  let packages;
  try {
    const output = join(directory, "licenses.json");
    const fd = openSync(output, "w");
    try {
      await new Promise((accept, reject) => {
        const child = spawn("npx", ["license-checker-rseidelsohn", "--production", "--json", "--excludePrivatePackages"], {
          stdio: ["ignore", fd, "inherit"], env: { ...process.env, npm_config_offline: "true" },
        });
        child.once("error", reject);
        child.once("close", (code) => code === 0 ? accept() : reject(new Error(`license checker exited ${code}`)));
      });
    } finally { closeSync(fd); }
    packages = JSON.parse(readFileSync(output, "utf8"));
    if (!Object.keys(packages).length) throw new Error("license checker returned no packages");
  } finally { rmSync(directory, { recursive: true, force: true }); }
  for (const [id, info] of Object.entries(packages)) {
    const name = id.slice(0, id.lastIndexOf("@"));
    const licenses = Array.isArray(info.licenses) ? info.licenses : [info.licenses];
    for (const license of licenses) {
      if (allowed.has(license)) continue;
      if ((exceptions[name]?.license === license || exceptions[name]?.detectedLicense === license) && exceptions[name]?.reason) continue;
      fail(`License rejected: ${id}: ${license ?? "unknown"}`);
    }
  }
} catch (error) { fail(`License audit failed: ${error.message}`); }

function walk(directory) {
  if (!existsSync(directory)) return [];
  return readdirSync(directory, { withFileTypes: true }).flatMap((item) => item.isDirectory() ? walk(join(directory, item.name)) : [join(directory, item.name)]);
}
const notices = existsSync("THIRD_PARTY_NOTICES.md") ? readFileSync("THIRD_PARTY_NOTICES.md", "utf8") : "";
if (!notices) fail("THIRD_PARTY_NOTICES.md is required");
const sources = [...walk("app"), ...walk("assets-src")];
const required = new Set(["KayKit Character Pack: Adventures 1.0", "KayKit City Builder Bits 1.0", "caniuse-lite", "libvips"]);
for (const file of sources) {
  if (!/\.(?:tsx?|md|css)$/.test(file)) continue;
  const content = readFileSync(file, "utf8");
  for (const match of content.matchAll(/import\s*\{([^}]+)\}\s*from\s*["']next\/font\/(?:google|local)["']/g)) {
    for (const family of match[1].split(",")) required.add(family.trim().split(/\s+as\s+/)[0].replaceAll("_", " "));
  }
  for (const match of content.matchAll(/KayKit [^\n,;()]*?\d+\.\d+/g)) required.add(match[0]);
}
const knownModels = new Set([
  "public/models/city/bench.glb",
  "public/models/city/box_A.glb",
  "public/models/city/building_A.glb",
  "public/models/city/building_B.glb",
  "public/models/city/building_C.glb",
  "public/models/city/building_D.glb",
  "public/models/city/building_E.glb",
  "public/models/city/building_F.glb",
  "public/models/city/building_G.glb",
  "public/models/city/building_H.glb",
  "public/models/city/bush.glb",
  "public/models/city/car_sedan.glb",
  "public/models/city/car_taxi.glb",
  "public/models/city/dumpster.glb",
  "public/models/city/firehydrant.glb",
  "public/models/city/road_corner.glb",
  "public/models/city/road_junction.glb",
  "public/models/city/road_straight.glb",
  "public/models/city/road_straight_crossing.glb",
  "public/models/city/streetlight.glb",
  "public/models/city/trafficlight_A.glb",
  "public/models/city/watertower.glb",
  "public/models/scout-cartographer.glb",
  "public/models/scout-inspector.glb",
  "public/models/scout-lens.glb",
  "public/models/scout-reader.glb",
  "public/models/scout-seeker.glb"
]);
// Inventory local fonts and assets too: a newly added file must be acknowledged.
for (const file of [...walk("public"), ...walk("assets-src"), ...walk("app")]) {
  if (/\.(?:woff2?|ttf|otf|png|jpe?g|webp|svg|gif|glb|gltf)$/i.test(file)) {
    if (knownModels.has(file)) continue;
    if (!notices.includes(file)) fail(`Asset attribution missing: ${file}`);
  }
}
for (const source of required) if (!notices.includes(source)) fail(`Notice missing: ${source}`);
if (failed) process.exitCode = 1;
else console.log("Release gate passed: trademarks, production licenses, and asset notices.");
