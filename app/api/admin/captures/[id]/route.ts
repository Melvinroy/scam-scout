import { NextResponse } from "next/server";
import { readyUsageStore } from "@/lib/abuse/store";
import { isSafeCaptureId } from "@/lib/captures/files";
import { allowlistedEmail } from "@/lib/captures/owner";

import { throttleIp } from "@/lib/http/throttle";

export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const ipThrottled = await throttleIp(request, "admin", 120);
  if (ipThrottled) return ipThrottled;
  const email = await allowlistedEmail();
  if (!email) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const { id } = await context.params;
  if (!isSafeCaptureId(id)) return NextResponse.json({ error: "Not found." }, { status: 404 });
  const capture = await (await readyUsageStore()).getCapture(id);
  if (!capture) return NextResponse.json({ error: "Not found." }, { status: 404 });
  return new NextResponse(JSON.stringify(capture, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${capture.id}.json"`,
      "Cache-Control": "no-store",
    },
  });
}
