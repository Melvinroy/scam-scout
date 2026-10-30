import { NextResponse } from "next/server";
import { readyUsageStore } from "@/lib/abuse/store";
import { isSafeCaptureId } from "@/lib/captures/files";
import { allowlistedEmail } from "@/lib/captures/owner";
import { redirectSeeOther } from "@/lib/http/cookies";
import { isSameOrigin } from "@/lib/http/origin";
import { throttleHourly, throttleIp } from "@/lib/http/throttle";

export const dynamic = "force-dynamic";
const ADMIN_ACTIONS_PER_HOUR = 60;

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const ipThrottled = await throttleIp(request, "admin", 120);
  if (ipThrottled) return ipThrottled;
  const email = await allowlistedEmail();
  if (!email) return NextResponse.json({ error: "Not found." }, { status: 404 });
  if (!isSameOrigin(request)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
  const throttled = await throttleHourly("admin", [`user:${email}`], ADMIN_ACTIONS_PER_HOUR);
  if (throttled) return throttled;
  const { id } = await context.params;
  if (!isSafeCaptureId(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const updated = await (await readyUsageStore()).markPromoted(id, id);
  if (!updated) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return redirectSeeOther("/admin/captures");
}
