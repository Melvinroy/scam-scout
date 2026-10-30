import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { CaptureRecord } from "@/lib/captures/types";
import type { AgentEvent, CaseReport, VerdictLevel } from "@/lib/types";

export function capturesDir(root = process.cwd()): string {
  return path.join(root, "fixtures", "captures");
}

export function isSafeCaptureId(id: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9_-]{0,80}$/.test(id);
}

export interface CapturePreview {
  id: string;
  label: string;
  blurb: string;
  expected: { verdict: VerdictLevel; typology: string | null };
  input: string;
  context: string;
  events: AgentEvent[];
  report: CaseReport;
}

/** Stored events and the case file. No second model run. */
export function previewFromCapture(capture: CaptureRecord): CapturePreview | null {
  if (!capture.promoted || !capture.report?.verdict || !Array.isArray(capture.events)) return null;
  const canonical = capture.report.input?.canonical;
  const label = canonical?.domain || canonical?.phone || canonical?.names?.[0] || capture.input || capture.id;
  return {
    id: capture.id,
    label,
    blurb: "Recorded preview.",
    expected: {
      verdict: capture.report.verdict.level,
      typology: capture.report.verdict.primary_typology,
    },
    input: capture.input,
    context: capture.context ?? "",
    events: capture.events,
    report: capture.report,
  };
}

export function loadFixtureCapture(id: string, dir = capturesDir()): CaptureRecord | null {
  if (!isSafeCaptureId(id)) return null;
  try {
    const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8")) as { ids?: unknown };
    const ids = Array.isArray(index.ids) ? index.ids : [];
    if (!ids.includes(id)) return null;
    const parsed = JSON.parse(readFileSync(path.join(dir, `${id}.json`), "utf8")) as CaptureRecord;
    if (!parsed || parsed.id !== id || parsed.promoted !== true || !parsed.report || !Array.isArray(parsed.events)) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function listFixtureCapturePresets(dir = capturesDir()): CapturePreview[] {
  try {
    const index = JSON.parse(readFileSync(path.join(dir, "index.json"), "utf8")) as { ids?: unknown };
    const ids = Array.isArray(index.ids) ? index.ids.filter((id): id is string => typeof id === "string") : [];
    return ids.flatMap((id) => {
      const capture = loadFixtureCapture(id, dir);
      const preview = capture ? previewFromCapture(capture) : null;
      return preview ? [preview] : [];
    });
  } catch {
    return [];
  }
}

export async function writeCaptureFixture(capture: CaptureRecord, dir: string): Promise<{ id: string; file: string }> {
  if (!isSafeCaptureId(capture.id)) throw new Error("Unsafe capture id.");
  if (!capture.report || !Array.isArray(capture.events)) throw new Error("Capture is incomplete.");
  const next: CaptureRecord = {
    ...capture,
    mode: "live",
    promoted: true,
    previewId: capture.previewId || capture.id,
  };
  await mkdir(dir, { recursive: true });
  const file = path.join(dir, `${next.id}.json`);
  await writeFile(file, `${JSON.stringify(next, null, 2)}\n`);
  const indexPath = path.join(dir, "index.json");
  let ids: string[] = [];
  try {
    const parsed = JSON.parse(await readFile(indexPath, "utf8")) as { ids?: unknown };
    if (Array.isArray(parsed.ids)) ids = parsed.ids.filter((id): id is string => typeof id === "string" && isSafeCaptureId(id));
  } catch {
    ids = [];
  }
  ids = [next.id, ...ids.filter((id) => id !== next.id)];
  await writeFile(indexPath, `${JSON.stringify({ ids }, null, 2)}\n`);
  return { id: next.id, file };
}
