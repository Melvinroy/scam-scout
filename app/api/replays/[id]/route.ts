import { throttleHourly } from "@/lib/http/throttle";
import { clientIp } from "@/lib/http/cookies";
import { getReplay } from "@/lib/replay/cache";
import { publicPayload } from "@/lib/replay/public";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const throttled = await throttleHourly("replay", [`ip:${clientIp(request)}`], 120);
  if (throttled) return throttled;
  const { id } = await context.params;
  const replay = await getReplay(id);
  if (!replay) return Response.json({ error: "Unknown replay." }, { status: 404 });
  return Response.json(publicPayload(replay));
}
