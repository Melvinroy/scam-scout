import { afterEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { DemoConsole } from "@/components/demo/DemoConsole";
import { fetchClientSession } from "@/lib/client/session";

afterEach(() => vi.unstubAllGlobals());

it("disables live submission until the client knows the visitor is signed in", () => {
  const html = renderToStaticMarkup(createElement(DemoConsole, {
    presets: [], initialId: "one", openingReplay: false,
    availabilityMessage: "Live checks are temporarily unavailable.",
  }));
  expect(html).toMatch(/<button[^>]*type="submit"[^>]*disabled/);
  expect(html).not.toContain("Live checks are temporarily unavailable.");
});

it.each(["network", "http", "json"])("retries a transient %s session failure and retains Google configuration", async (failure) => {
  const fetch = vi.fn();
  if (failure === "network") fetch.mockRejectedValueOnce(new Error("offline"));
  if (failure === "http") fetch.mockResolvedValueOnce(new Response("unavailable", { status: 503 }));
  if (failure === "json") fetch.mockResolvedValueOnce(new Response("invalid"));
  fetch.mockResolvedValueOnce(Response.json({ user: null, googleAuthConfigured: true }));
  vi.stubGlobal("fetch", fetch);
  expect(await fetchClientSession()).toEqual({ user: null, googleAuthConfigured: true });
  expect(fetch).toHaveBeenCalledTimes(2);
});

it("does not retry a successful signed-out session", async () => {
  const fetch = vi.fn().mockResolvedValue(Response.json({ user: null, googleAuthConfigured: false }));
  vi.stubGlobal("fetch", fetch);
  expect((await fetchClientSession()).user).toBeNull();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it("stops after one retry when the session stays unavailable", async () => {
  const fetch = vi.fn().mockRejectedValue(new Error("offline"));
  vi.stubGlobal("fetch", fetch);
  await expect(fetchClientSession()).rejects.toThrow("offline");
  expect(fetch).toHaveBeenCalledTimes(2);
});
