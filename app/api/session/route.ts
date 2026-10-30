import { throttleIp } from "@/lib/http/throttle";
import { auth } from "@/auth";
import { runtimeEnv } from "@/lib/config";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const throttled = await throttleIp(request, "session");
  if (throttled) return throttled;
  const session = await auth();
  const user = session?.user;
  return Response.json({
    user: user?.id ? { name: user.name, email: user.email, image: user.image } : null,
    turnstileSiteKey: runtimeEnv()["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] || null,
    googleAuthConfigured: Boolean(process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID),
  }, { headers: { "Cache-Control": "private, no-store" } });
}
