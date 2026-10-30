import { throttleIp } from "@/lib/http/throttle";
import { presetMeta } from "@/lib/replay/cache";

export async function GET(request: Request) {
  const throttled = await throttleIp(request, "replays");
  if (throttled) return throttled;
  return Response.json({ presets: presetMeta() });
}
