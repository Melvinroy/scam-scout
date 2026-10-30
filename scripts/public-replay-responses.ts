import { writeFileSync } from "node:fs";
import { pathToFileURL } from "node:url";
import { getReplay, presetMeta } from "../lib/replay/cache";
import { publicPayload } from "../lib/replay/public";
import { sseFrame } from "../lib/case/sse";

/** Generate the same projection used by replay JSON and streamed cases, offline. */
export async function publicReplayResponses() {
  return Promise.all(presetMeta().map(async ({ id }) => {
    const pack = await getReplay(id);
    if (!pack) throw new Error(`Missing replay: ${id}`);
    return { id, json: JSON.stringify(publicPayload(pack)), sse: pack.events.map((event) => sseFrame(event, [])).join("") };
  }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  publicReplayResponses().then((responses) => writeFileSync(process.argv[2], JSON.stringify(responses))).catch(() => {
    console.error("Public replay generation failed");
    process.exitCode = 1;
  });
}
