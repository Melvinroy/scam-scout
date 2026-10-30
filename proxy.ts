import { PUBLIC_PAGES_PER_HOUR, throttleIp } from "@/lib/http/throttle";
import { NextResponse, type NextRequest } from "next/server";
import { contentSecurityPolicy, securityHeaders } from "@/lib/safety/headers";

export async function proxy(request: NextRequest) {
  const throttled = await throttleIp(request, "public-page", PUBLIC_PAGES_PER_HOUR);
  if (throttled) return throttled;
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const dev = process.env.NODE_ENV !== "production";
  const forwarded = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim().toLowerCase();
  const https = forwarded ? forwarded === "https" : request.nextUrl.protocol === "https:";
  const csp = contentSecurityPolicy(nonce, dev, https);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set("x-nonce", nonce);
  requestHeaders.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set("Content-Security-Policy", csp);
  for (const header of securityHeaders()) response.headers.set(header.key, header.value);
  return response;
}

export const config = {
  matcher: [
    "/case/:path*",
    {
      source: "/((?!_next/static|favicon.ico|models/|draco/).*)",
    },
  ],
};
