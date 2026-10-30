import { throttleIp } from "@/lib/http/throttle";
import { rejectCrossSite } from "@/lib/http/origin";
import { auth } from "@/auth";
import { redeemCode, parseInviteCodes } from "@/lib/abuse/gate";
import { readyUsageStore } from "@/lib/abuse/store";
import { quotaDefaults } from "@/lib/config";
import { bodyTooLarge, readJsonBody } from "@/lib/http/body";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  const refused = rejectCrossSite(request);
  if (refused) return refused;
  const ipThrottled = await throttleIp(request, "invites-ip", 30);
  if (ipThrottled) return ipThrottled;
  const session = await auth();
  if (!session?.user?.id) {
    return Response.json({ ok: false, error: "Sign in first." }, { status: 401 });
  }
  const body = (await readJsonBody(request)) as { code?: unknown } | null;
  if (!body) return bodyTooLarge();
  if (typeof body.code !== "string" || !body.code.trim()) return Response.json({ ok: false, error: "Enter an access code." }, { status: 400 });
  const result = await redeemCode(
    await readyUsageStore(),
    session.user.id,
    body.code,
    parseInviteCodes(process.env.INVITE_CODES),
    quotaDefaults().accountAllowance,
  );
  return Response.json({ ok: result.ok, ...(!result.ok ? { error: "That code could not be applied." } : {}) }, { status: result.ok ? 200 : 400 });
}
