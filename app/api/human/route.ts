import { throttleIp } from "@/lib/http/throttle";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { throttleHourly } from "@/lib/http/throttle";
import { rejectCrossSite } from "@/lib/http/origin";
import { bodyTooLarge, readJsonBody } from "@/lib/http/body";
import { clientIp, cookieSecure, humanCookieValue } from "@/lib/http/cookies";
import { TURNSTILE_CLIENT_MESSAGE, verifyTurnstile } from "@/lib/safety/turnstile";

export const dynamic = "force-dynamic";

/** Bot-check attempts per hour, per account and per network address. */
const HUMAN_TRIES_PER_HOUR = 10;

export async function POST(request: Request) {
  const refused = rejectCrossSite(request);
  if (refused) return refused;
  const ipThrottled = await throttleIp(request, "human-ip", 10);
  if (ipThrottled) return ipThrottled;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ ok: false, error: "Sign in first." }, { status: 401 });
  const throttled = await throttleHourly("human", [`user:${userId}`], HUMAN_TRIES_PER_HOUR);
  if (throttled) return throttled;
  const body = (await readJsonBody(request)) as { token?: string } | null;
  if (!body) return bodyTooLarge();
  const result = await verifyTurnstile({
    token: body.token,
    secret: process.env.TURNSTILE_SECRET_KEY,
    remoteIp: clientIp(request),
  });
  if (!result.ok) {
    return NextResponse.json({ ok: false, error: TURNSTILE_CLIENT_MESSAGE }, { status: 403 });
  }
  const value = humanCookieValue(userId);
  if (!value) {
    return NextResponse.json({ ok: false, error: "Live checks are temporarily unavailable. Choose a recorded example." }, { status: 500 });
  }
  const response = NextResponse.json({ ok: true });
  response.cookies.set("ss_human", value, {
    httpOnly: true,
    sameSite: "lax",
    secure: cookieSecure(request),
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
