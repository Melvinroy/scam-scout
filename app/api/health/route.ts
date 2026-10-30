import { throttleIp } from "@/lib/http/throttle";
import { APP_VERSION } from "@/lib/config";

export const dynamic = "force-dynamic";

/** Liveness only. Limits, usage and model names stay off public responses. */
export async function GET(request: Request) {
  const throttled = await throttleIp(request, "health");
  if (throttled) return throttled;
  return Response.json({ ok: true, version: APP_VERSION });
}
