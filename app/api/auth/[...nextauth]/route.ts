import { NextRequest } from "next/server";
import { handlers } from "@/auth";
import { isSameOrigin } from "@/lib/http/origin";
import { throttleIp } from "@/lib/http/throttle";

const AUTH_POSTS_PER_HOUR = 30;
const MAX_AUTH_BODY_BYTES = 4096;

export async function GET(request: NextRequest) {
  const throttled = await throttleIp(request, "auth-get");
  if (throttled) return throttled;
  return publicAuthResponse(request, await handlers.GET(request));
}

async function publicAuthResponse(request: Request, response: Response): Promise<Response> {
  const endpoint = new URL(request.url).pathname.replace(/\/$/, "").split("/")[3];
  const headers = new Headers(response.headers);
  headers.delete("content-length");
  headers.set("Cache-Control", "private, no-store");
  const location = headers.get("location");
  if (location) headers.set("location", publicAuthUrl(location, request.url));
  if (!response.headers.get("content-type")?.includes("application/json")) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  const data = await response.json();
  let body: unknown = {};
  if (endpoint === "session" && response.ok) {
    const user = data?.user;
    body = data == null ? null : {
      ...(typeof data.expires === "string" ? { expires: data.expires } : {}),
      ...(user ? { user: { name: user.name, email: user.email, image: user.image } } : {}),
    };
  } else if (endpoint === "csrf" && typeof data?.csrfToken === "string") {
    body = { csrfToken: data.csrfToken };
  } else if (endpoint === "providers" && data && typeof data === "object") {
    body = Object.fromEntries(Object.entries(data).map(([id, value]) => {
      const provider = value as Record<string, unknown>;
      return [id, Object.fromEntries(["id", "name", "type", "signinUrl", "callbackUrl"]
        .filter((key) => typeof provider?.[key] === "string").map((key) => [key, provider[key]]))];
    }));
  } else if (["signin", "signout", "callback"].includes(endpoint) && typeof data?.url === "string") {
    body = { url: publicAuthUrl(data.url, request.url) };
  } else if (!response.ok || data?.error) {
    body = { error: "unavailable" };
  }
  return Response.json(body, { status: response.status, headers });
}

// Keep the error key: next-auth/react uses it to detect redirect:false failures.
function publicAuthUrl(value: string, base: string): string {
  const url = new URL(value, base);
  if (!url.searchParams.has("error")) return value;
  url.searchParams.delete("code");
  url.searchParams.set("error", "unavailable");
  return url.href;
}

/** Same origin, an hourly slot per network address, and a body read with a hard ceiling before Auth.js runs. */
export async function POST(request: NextRequest) {
  if (!isSameOrigin(request)) return Response.json({ error: "Request refused." }, { status: 403 });
  const throttled = await throttleIp(request, "auth", AUTH_POSTS_PER_HOUR);
  if (throttled) return throttled;
  const body = await readCapped(request, MAX_AUTH_BODY_BYTES);
  if (body == null) return Response.json({ error: "Request too large." }, { status: 413 });
  return publicAuthResponse(request, await handlers.POST(new NextRequest(request.url, { method: "POST", headers: request.headers, body })));
}

/** Reads at most `limit` bytes whatever Content-Length says. Returns null and cancels the stream past it. */
async function readCapped(request: Request, limit: number): Promise<Uint8Array<ArrayBuffer> | null> {
  if (!request.body) return new Uint8Array(new ArrayBuffer(0));
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      return null;
    }
    chunks.push(value);
  }
  const out = new Uint8Array(new ArrayBuffer(size));
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}
