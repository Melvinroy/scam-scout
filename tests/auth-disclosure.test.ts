import { expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/http/throttle", () => ({ throttleIp: async () => null }));
vi.mock("@/auth", async () => {
  const { Auth } = await import("@auth/core");
  const { default: Credentials } = await import("next-auth/providers/credentials");
  const config = { basePath: "/api/auth", secret: "auth-disclosure-regression-secret", trustHost: true,
    pages: { signIn: "/sign-in" }, logger: { error: () => {} },
    providers: [Credentials({ id: "account", authorize: () => null })],
  };
  return { handlers: { GET: (request: Request) => Auth(request, config), POST: (request: Request) => Auth(request, config) } };
});
import { GET, POST } from "@/app/api/auth/[...nextauth]/route";

it("neutralizes real Auth.js credential failures while retaining CSRF cookies and redirects", async () => {
  const csrf = await GET(new NextRequest("https://site.example/api/auth/csrf"));
  const { csrfToken } = await csrf.json();
  expect(csrfToken).toEqual(expect.any(String));
  const cookies = csrf.headers.getSetCookie().map((cookie) => cookie.split(";")[0]).join("; ");
  expect(cookies).toContain("csrf-token");
  const { handlers } = await import("@/auth");
  for (const json of [true, false]) {
    const request = new NextRequest("https://site.example/api/auth/callback/account", {
      method: "POST", headers: { origin: "https://site.example", cookie: cookies,
        "content-type": "application/x-www-form-urlencoded", ...(json ? { "X-Auth-Return-Redirect": "1" } : {}) },
      body: new URLSearchParams({ csrfToken, username: "invalid", password: "invalid", callbackUrl: "https://site.example/demo" }),
    });
    const original = await handlers.POST(new NextRequest(request.clone()));
    const response = await POST(request);
    expect(response.headers.getSetCookie()).toEqual(original.headers.getSetCookie());
    const url = new URL(json ? (await response.json()).url : response.headers.get("location")!);
    expect(url.pathname).toBe("/sign-in");
    expect(url.searchParams.get("error")).toBe("unavailable");
    expect(url.searchParams.has("code")).toBe(false);
    expect(response.status).toBe(json ? 200 : 302);
  }
});

it("projects endpoint schemas and preserves successful redirect URLs and cookies", async () => {
  const { handlers } = await import("@/auth");
  const spy = vi.spyOn(handlers, "GET");
  try {
    for (const [endpoint, input, expected] of [
      ["csrf", { csrfToken: "token", internal: "secret" }, { csrfToken: "token" }],
      ["providers", { account: { id: "account", name: "Account", type: "credentials", signinUrl: "https://site.example/api/auth/signin/account", internal: "secret" } },
        { account: { id: "account", name: "Account", type: "credentials", signinUrl: "https://site.example/api/auth/signin/account" } }],
      ["signin/google", { url: "https://accounts.google.com/authorize?state=opaque&code=oauth-code&code_challenge=challenge", internal: "secret" },
        { url: "https://accounts.google.com/authorize?state=opaque&code=oauth-code&code_challenge=challenge" }],
      ["unknown", { internal: "secret" }, {}],
    ] as const) {
      spy.mockResolvedValueOnce(Response.json(input, { headers: { "set-cookie": "auth=value; HttpOnly" } }));
      const response = await GET(new NextRequest(`https://site.example/api/auth/${endpoint}`));
      expect(await response.json()).toEqual(expected);
      expect(response.headers.getSetCookie()).toEqual(["auth=value; HttpOnly"]);
    }
  } finally {
    spy.mockRestore();
  }
});
