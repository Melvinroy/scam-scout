import { readFile } from "node:fs/promises";
import path from "node:path";
import { capturesDir, writeCaptureFixture } from "../lib/captures/files";
import type { CaptureRecord } from "../lib/captures/types";

async function main() {
  const file = process.argv[2];
  if (!file) {
    console.error("Usage: npm run captures:promote -- path/to/capture.json");
    process.exit(1);
  }

  const raw = JSON.parse(await readFile(path.resolve(file), "utf8")) as Partial<CaptureRecord>;
  if (!raw || typeof raw.id !== "string" || !raw.report || !Array.isArray(raw.events)) {
    console.error("That file is not a capture.");
    process.exit(1);
  }

  const written = await writeCaptureFixture(raw as CaptureRecord, capturesDir());
  console.log(`Wrote ${written.file}`);
  console.log(`Preview id ${written.id}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Could not promote that capture.");
  process.exit(1);
});
