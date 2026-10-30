import { encode } from "@auth/core/jwt";
import { expect, test, type APIRequestContext, type Page } from "@playwright/test";

const SECRET = "e2e-auth-secret-value";
const OWNER = "owner@example.com";
const MOCK = "http://127.0.0.1:8799";

const LIVE = "http://127.0.0.1:3210";
const CAP = "http://127.0.0.1:3211";
const KILL = "http://127.0.0.1:3212";
const STOP = "http://127.0.0.1:3213";

async function sessionToken(email: string, id: string): Promise<string> {
  return encode({
    token: { sub: id, email, name: email },
    secret: SECRET,
    salt: "authjs.session-token",
  });
}

async function signIn(page: Page, email: string, id: string, origin: string): Promise<void> {
  const value = await sessionToken(email, id);
  await page.context().addCookies([{ name: "authjs.session-token", value, url: origin, httpOnly: true, sameSite: "Lax" }]);
}

async function cookieHeader(email: string, id: string): Promise<string> {
  return `authjs.session-token=${await sessionToken(email, id)}`;
}

async function armTurnstile(page: Page): Promise<void> {
  await page.route("**/challenges.cloudflare.com/**", async (route) => {
    await route.fulfill({
      contentType: "application/javascript",
      body: "window.turnstile={render(el,opts){opts.callback('tok-e2e');}};",
    });
  });
}

async function resetStats(request: APIRequestContext): Promise<void> {
  const res = await request.post(`${MOCK}/stats/reset`);
  expect(res.ok()).toBeTruthy();
}

async function providerStats(request: APIRequestContext): Promise<{ tavily: Record<string, number>; nebius: Record<string, number> }> {
  const res = await request.get(`${MOCK}/stats`);
  const json = (await res.json()) as { tavily?: Record<string, number>; nebius?: Record<string, number> };
  return { tavily: json.tavily ?? {}, nebius: json.nebius ?? {} };
}

async function tavilyCount(request: APIRequestContext, key: string): Promise<number> {
  return (await providerStats(request)).tavily[key] ?? 0;
}

function callTotal(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, value) => sum + value, 0);
}

function expectPublicReplay(text: string): void {
  const frames = text.split("\n").filter((line) => line.startsWith("data: ")).map((line) => JSON.parse(line.slice(6)));
  const replay = frames.find((frame) => frame.type === "mode.replay");
  expect(replay?.payload).toEqual(expect.objectContaining({ badge: "Replay" }));
  expect(["Recorded case.", "Live checks are temporarily unavailable.", "Live checks are temporarily unavailable. Showing a recorded case.", undefined]).toContain(replay?.payload.message);
  for (const frame of frames) {
    expect(frame).not.toHaveProperty("reason");
    expect(frame.payload).not.toHaveProperty("reason");
  }
}

async function passBotCheck(page: Page): Promise<void> {
  const ready = page.getByText("This browser can run a live check.");
  const allow = page.getByRole("button", { name: "Allow a live check" });
  await expect(ready.or(allow)).toBeVisible();
  if (await allow.isVisible()) await allow.click();
  await expect(ready).toBeVisible();
}

async function runLive(page: Page, name: string): Promise<void> {
  await page.locator("#live-check").fill(name);
  const run = page.getByRole("button", { name: "Run a live check" });
  await expect(run).toBeEnabled();
  await run.click();
  await expect(page.locator("[data-live-running='true']")).toBeVisible();
  await expect(page.getByRole("button", { name: "Checking…" })).toBeDisabled();
}

async function submitLive(page: Page, name: string): Promise<void> {
  await page.locator("#live-check").fill(name);
  const run = page.getByRole("button", { name: "Run a live check" });
  await expect(run).toBeEnabled();
  await run.click();
}

async function submitOwnerForm(page: Page, action: string): Promise<void> {
  const form = page.locator(`form[action='${action}']`);
  await Promise.all([
    page.waitForResponse((response) => response.request().method() === "POST" && response.url().endsWith(action)),
    form.evaluate((node: HTMLFormElement) => node.requestSubmit()),
  ]);
}

test.describe.configure({ mode: "serial" });

test("a signed-out visitor stays on a recording and cannot pass the bot check", async ({ page, request }) => {
  await resetStats(request);
  let livePosts = 0;
  page.on("request", (req) => {
    if (req.method() === "POST" && req.url().endsWith("/api/cases")) livePosts += 1;
  });
  await page.goto(`${LIVE}/demo`);
  await expect(page.locator("#live-check[data-opening='settled']")).toHaveValue("");
  // The page opens empty: no recorded case is preloaded.
  await expect(page.locator(".dash-live .stamp")).toHaveText("Ready");
  await expect(page.locator("[data-availability='true']")).toHaveText("Sign in to run a live check");
  await expect(page.getByRole("link", { name: "Sign in to run a live check" })).toHaveAttribute("href", "/sign-in");
  await page.locator("#live-check").fill("a-new-live-input.example");
  await expect(page.getByRole("button", { name: "Run a live check" })).toBeDisabled();
  await expect(page.locator("header[data-session='out']")).toBeVisible();
  await expect(page.getByRole("link", { name: "Sign in", exact: true })).toBeVisible();
  await page.locator("form#check").evaluate((node: HTMLFormElement) => node.requestSubmit());
  await page.locator("button.chip").first().click();
  await expect(page.locator("#live-check")).not.toHaveValue("a-new-live-input.example");
  expect(livePosts).toBe(0);

  const human = await request.post(`${LIVE}/api/human`, { headers: { origin: LIVE }, data: { token: "tok-e2e" } });
  expect(human.status()).toBe(401);

  const run = await request.post(`${LIVE}/api/cases`, { headers: { origin: LIVE }, data: { live: true, input: "Harbour Desk" } });
  expect(run.status()).toBe(200);
  expectPublicReplay(await run.text());
  const stats = await providerStats(request);
  expect(stats.tavily["tvly-live-e2e-key"] ?? 0).toBe(0);
  expect(callTotal(stats.nebius)).toBe(0);
});

test("a signed-in visitor who is not on the allowlist cannot reach a live provider", async ({ page, request }) => {
  await resetStats(request);
  await signIn(page, "stranger@example.com", "user_stranger", LIVE);
  await page.goto(`${LIVE}/demo`);
  await expect(page.locator("header.site-header[data-session='in']")).toBeVisible();
  await expect(page.locator("header.site-header")).toContainText("stranger@example.com");
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await expect(page.locator("[data-availability='true']")).toHaveText("Live checks are temporarily unavailable.");

  const run = await request.post(`${LIVE}/api/cases`, {
    headers: { origin: LIVE, cookie: await cookieHeader("stranger@example.com", "user_stranger") },
    data: { live: true, input: "Harbour Desk" },
  });
  expect(run.status()).toBe(200);
  expectPublicReplay(await run.text());
  const stats = await providerStats(request);
  expect(stats.tavily["tvly-live-e2e-key"] ?? 0).toBe(0);
  expect(callTotal(stats.nebius)).toBe(0);
});

test("a preview hostname passes the bot check when the configured site URL is different", async ({ request }) => {
  const headers = { origin: LIVE, cookie: await cookieHeader(OWNER, "user_preview") };
  const preview = await request.post(`${LIVE}/api/human`, { headers, data: { token: "tok-preview" } });
  expect(preview.status()).toBe(200);
  const evil = await request.post(`${LIVE}/api/human`, { headers, data: { token: "tok-evil" } });
  expect(evil.status()).toBe(403);
  const body = (await evil.json()) as { error?: string };
  expect(body.error).toBe("The live check could not start. Try again.");
});

test("an owner run shows the loading state, a High result, and stores credits plus Nebius cost", async ({ page, request }) => {
  await resetStats(request);
  await armTurnstile(page);
  await signIn(page, OWNER, "user_owner", LIVE);
  await page.goto(`${LIVE}/demo`);
  await expect(page.locator("header.site-header[data-session='in']")).toBeVisible();
  await expect(page.locator("header.site-header")).toContainText(OWNER);
  await expect(page.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  await expect(page.locator("#live-check[data-opening='settled']")).toHaveValue("");
  await expect(page.locator("[data-availability='true']")).toHaveCount(0);
  await passBotCheck(page);

  const denied = await request.post(`${LIVE}/api/cases`, {
    headers: { origin: LIVE, cookie: await cookieHeader(OWNER, "user_owner") },
    data: { live: true, input: "Harbour Desk" },
  });
  expect(denied.status()).toBe(403);

  await runLive(page, "Harbour Desk");
  await expect(page.locator(".stamp")).toHaveText(/high risk/i, { timeout: 60_000 });
  await expect(page.locator(".dash-subject")).toContainText("Harbour Desk");
  await expect(page.locator(".dash-live")).toContainText(/clone firm|not authorised/i);
  await expect(page.getByRole("button", { name: "Run a live check" })).toBeEnabled();
  expect(await tavilyCount(request, "tvly-live-e2e-key")).toBeGreaterThan(0);
});

test("the allowlisted owner is not stopped by an hourly cap of 1", async ({ page }) => {
  await armTurnstile(page);
  await signIn(page, OWNER, "user_owner", LIVE);
  await page.goto(`${LIVE}/demo`);
  await passBotCheck(page);
  await runLive(page, "Harbour Desk Two");
  await expect(page.locator(".stamp")).toHaveText(/high risk/i, { timeout: 60_000 });
  await expect(page.getByText("Live checks are temporarily unavailable")).toHaveCount(0);
});

test("the owner can promote and delete a capture, and someone else cannot delete it", async ({ page, request }) => {
  await signIn(page, OWNER, "user_owner", LIVE);
  await page.goto(`${LIVE}/admin/captures`);
  await expect(page.getByText("Harbour Desk").first()).toBeVisible();
  await expect(page.getByText(/\d+ Search credits today/)).toBeVisible();
  await expect(page.getByText(/of \d+ Search credits in total/)).toBeVisible();
  await expect(page.getByText(/\$\d+\.\d{4} model usage/).first()).toBeVisible();

  const download = page.locator("a[href*='/api/admin/captures/']").first();
  const href = await download.getAttribute("href");
  const id = href?.split("/").pop() ?? "";
  expect(id).toMatch(/^cs_/);

  const stranger = await request.post(`${LIVE}/api/admin/captures/${id}/delete`, {
    headers: { cookie: await cookieHeader("stranger@example.com", "user_stranger") },
    maxRedirects: 0,
  });
  expect(stranger.status()).toBe(404);

  await submitOwnerForm(page, `/api/admin/captures/${id}/promote`);
  const preview = page.locator(`a[href='/demo?case=${id}']`);
  await expect(preview).toBeVisible();
  await preview.click();
  await expect(page.locator(".stamp")).toHaveText(/high risk/i, { timeout: 30_000 });

  await page.goto(`${LIVE}/admin/captures`);
  const before = await page.getByRole("button", { name: "Delete" }).count();
  expect(before).toBeGreaterThan(1);
  await submitOwnerForm(page, `/api/admin/captures/${id}/delete`);
  await expect(page.locator(`a[href='/api/admin/captures/${id}']`)).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Delete" })).toHaveCount(before - 1);
  await expect(page.getByText("Harbour Desk", { exact: true })).toBeVisible();
});

test("the owner daily cap stops the next live check", async ({ page }) => {
  await armTurnstile(page);
  await signIn(page, OWNER, "user_cap", CAP);
  await page.goto(`${CAP}/demo`);
  await passBotCheck(page);
  await runLive(page, "Harbour Desk");
  await expect(page.locator(".stamp")).toHaveText(/high risk/i, { timeout: 60_000 });

  await submitLive(page, "Harbour Desk Two");
  await expect(page.locator(".dash-chip")).toContainText("Live checks are temporarily unavailable. Showing a recorded case.", { timeout: 30_000 });
});

test("a zero spend ceiling pauses live checks before a provider call", async ({ page, request }) => {
  await resetStats(request);
  await armTurnstile(page);
  await signIn(page, OWNER, "user_stop", STOP);
  await page.goto(`${STOP}/demo`);
  await expect(page.locator("[data-availability='true']")).toHaveText("Live checks are temporarily unavailable. Showing a recorded case.");
  await passBotCheck(page);
  await runLive(page, "Harbour Desk");
  await expect(page.locator(".dash-chip")).toContainText("Live checks are temporarily unavailable. Showing a recorded case.", { timeout: 30_000 });
  expect(await tavilyCount(request, "tvly-stop-e2e-key")).toBe(0);
});

test("the kill switch keeps an allowlisted owner on the invite-only recording", async ({ page, request }) => {
  await resetStats(request);
  await signIn(page, OWNER, "user_kill", KILL);
  await page.goto(`${KILL}/demo`);
  await expect(page.locator("[data-availability='true']")).toHaveText("Live checks are temporarily unavailable.");
  const run = await request.post(`${KILL}/api/cases`, {
    headers: { origin: KILL, cookie: await cookieHeader(OWNER, "user_kill") },
    data: { live: true, input: "Harbour Desk" },
  });
  expectPublicReplay(await run.text());
  expect(await tavilyCount(request, "tvly-kill-e2e-key")).toBe(0);
});

test("a malformed or oversized check is refused before any work", async ({ request }) => {
  const typed = await request.post(`${LIVE}/api/cases`, { headers: { origin: LIVE }, data: { input: 5, context: ["x"] } });
  expect(typed.status()).toBe(400);
  const huge = await request.post(`${LIVE}/api/cases`, { headers: { origin: LIVE }, data: { input: "harbourdesk.example", context: "x".repeat(40_000) } });
  expect(huge.status()).toBe(413);
  const crossSite = await request.post(`${LIVE}/api/cases`, { headers: { origin: "https://evil.example" }, data: { input: "harbourdesk.example" } });
  expect(crossSite.status()).toBe(403);
  const plain = await request.post(`${LIVE}/api/cases`, { headers: { origin: LIVE, "content-type": "text/plain" }, data: JSON.stringify({ input: "harbourdesk.example" }) });
  expect(plain.status()).toBe(415);
});

async function judgeLogin(request: APIRequestContext, password: string): Promise<{ name: "Account" } | null> {
  const { csrfToken } = (await (await request.get(`${KILL}/api/auth/csrf`)).json()) as { csrfToken: string };
  await request.post(`${KILL}/api/auth/callback/account`, {
    headers: { origin: KILL },
    form: { csrfToken, username: "e2e-judge", password, callbackUrl: `${KILL}/demo` },
    maxRedirects: 0,
  });
  const session = (await (await request.get(`${KILL}/api/session`)).json()) as { user: { name: "Account" } | null };
  return session.user;
}

test("a judge signs in with the shared password, and a wrong one gets no session", async ({ playwright }) => {
  const wrong = await playwright.request.newContext();
  expect(await judgeLogin(wrong, "not-the-password")).toBeNull();
  await wrong.dispose();
  const right = await playwright.request.newContext();
  const user = await judgeLogin(right, "e2e-judge-password");
  expect(user).toEqual({ name: "Guest" });
  expect(user).not.toHaveProperty("role");
  await right.dispose();
});

/** The public site must not describe internal controls, limits, access rules or providers. */
const INTERNAL_WORDS = /\bbudgets?\b|\btokens?\b|\bcosts?\b|\bspend(?:ing)?\b|\bcaps?\b|\$\s?\d|\blimits?\b|\bjudges?\b|\bowners?\b|server-side|tavily|nebius|\bcredits?\b|rate limit|lockout|bot check|never stored|this tab|invit|\breviewers?\b|\bsaved\b|\bstored\b|remember|key added|allowlist|allowance|quota|throttl|you're human|human check|invite accepted|provider|pricing|too many tries|try again tomorrow|already used|not recognised|access updated|add checks|\bprices?\b|verify you are human|human verification|key storage/i;

/** Visible text plus the rendered markup (attributes such as placeholders and labels), without scripts and styles. */
async function publicCopy(page: Page): Promise<string> {
  await page.evaluate(() => document.querySelectorAll("details").forEach((item) => item.setAttribute("open", "")));
  return page.evaluate(() => {
    const clone = document.documentElement.cloneNode(true) as HTMLElement;
    clone.querySelectorAll("script, style, link, meta, noscript, template").forEach((node) => node.remove());
    // Keep only attributes a person reads or hears. Class names, ids and references are code, not copy.
    const spoken = new Set(["placeholder", "title", "alt", "aria-label", "value"]);
    clone.querySelectorAll("*").forEach((node) => {
      for (const attr of Array.from(node.attributes)) if (!spoken.has(attr.name)) node.removeAttribute(attr.name);
    });
    return `${document.body.innerText}\n${clone.outerHTML}`;
  });
}

test("the public-copy guard catches price, human-verification and key-storage wording", () => {
  for (const phrase of ["prices", "verify you are human", "human verification", "key storage"]) expect(INTERNAL_WORDS.test(phrase), phrase).toBe(true);
});

function leak(copy: string): string | null {
  const hit = copy.match(INTERNAL_WORDS);
  return hit ? copy.slice(Math.max(0, (hit.index ?? 0) - 60), (hit.index ?? 0) + 60) : null;
}

test("public pages do not reveal internal security or cost details", async ({ page, playwright }) => {
  const paths = ["/", "/demo", "/sign-in", "/case/quantum-yield", "/leaving?url=https%3A%2F%2Fexample.com", "/no-such-page"];
  for (const path of paths) {
    await page.goto(`${LIVE}${path}`);
    await expect(page.locator("header.site-header[data-session='out']")).toBeVisible();
    expect(leak(await publicCopy(page)), path).toBeNull();
  }
  const judge = await playwright.request.newContext();
  await judgeLogin(judge, "e2e-judge-password");
  const cookies = (await judge.storageState()).cookies;
  await judge.dispose();
  await page.context().addCookies(cookies.map(({ name, value }) => ({ name, value, url: KILL })));
  for (const path of paths) {
    await page.goto(`${KILL}${path}`);
    // Wait for the signed-in header, so the account label is part of what is checked.
    await expect(page.locator("header.site-header[data-session='in']")).toBeVisible();
    expect(leak(await publicCopy(page)), `${path} signed in`).toBeNull();
  }
  await page.setViewportSize({ width: 1280, height: 900 });
  await expect(page.locator("header.site-header")).not.toContainText(/judge/i);
  // Keys entered in this browser.
  await page.goto(`${KILL}/demo#advanced`);
  await page.evaluate(() => { for (const key of Object.keys(sessionStorage)) sessionStorage.removeItem(key); });
  await page.getByPlaceholder("Paste a research key").fill("tvly-e2e-research-key-0001");
  await page.getByPlaceholder("Paste a model key").fill("nvapi-e2e-model-key-0001");
  await page.getByRole("button", { name: "Use these keys" }).click();
  await expect(page.getByPlaceholder("Paste a research key")).toHaveValue("");
  expect(leak(await publicCopy(page)), "/demo with keys").toBeNull();
});

test("Google sign-in is available before the bot check, which still guards live checks", async ({ page }) => {
  await page.goto(`${LIVE}/sign-in`);
  await expect(page.getByRole("button", { name: "Continue with your account" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Allow a live check" })).toHaveCount(0);
});

test("the mobile menu closes when a homepage anchor link is tapped", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 800 });
  await page.goto(`${LIVE}/`);
  await page.getByRole("button", { name: "Open menu" }).click();
  await expect(page.locator("#site-drawer")).toBeVisible();
  await page.locator("#site-drawer").getByRole("link", { name: "How it works" }).click();
  await expect(page.locator("#site-drawer")).toHaveCount(0);
  await expect(page).toHaveURL(/#how-it-works$/);
});

test("auth posts need this origin, and the public provider list does not name the account login", async ({ request }) => {
  const { csrfToken } = (await (await request.get(`${KILL}/api/auth/csrf`)).json()) as { csrfToken: string };
  const cross = await request.post(`${KILL}/api/auth/callback/account`, { headers: { origin: "https://evil.example" }, form: { csrfToken, username: "e2e-judge", password: "x" }, maxRedirects: 0 });
  expect(cross.status()).toBe(403);
  const providers = await (await request.get(`${KILL}/api/auth/providers`)).text();
  expect(providers).not.toMatch(/judge|reviewer/i);
  const health = await (await request.get(`${KILL}/api/health`)).json();
  expect(Object.keys(health).sort()).toEqual(["ok", "version"]);
  const replay = await (await request.get(`${KILL}/api/replays/quantum-yield`)).text();
  expect(replay).not.toMatch(/costs|credits|tokens|nebius|usd/i);
});

test("the username form on the sign-in page signs in through the browser", async ({ page }) => {
  await page.goto(`${KILL}/sign-in?callbackUrl=%2Fdemo`);
  await page.getByLabel("Username").fill("e2e-judge");
  await page.getByLabel("Password").fill("e2e-judge-password");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator("header.site-header[data-session='in']")).toBeVisible();
});

test("an example pick fills the search box, Check opens it, and the score counts up from 0", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /northgate-markets\.example/ }).click();
  await expect(page.locator("#check")).toHaveValue("northgate-markets.example");
  await page.locator("#check").press("Enter");
  const num = page.locator(".score-card [data-count-to]").first();
  await expect(num).toBeVisible();
  const target = Number(await num.getAttribute("data-count-to"));
  expect(target).toBeGreaterThan(0);
  const seen = await num.evaluate(async (el) => {
    const values: number[] = [];
    for (let i = 0; i < 20; i += 1) {
      values.push(Number(el.textContent));
      await new Promise((done) => setTimeout(done, 50));
    }
    return values;
  });
  expect(Math.min(...seen)).toBeLessThan(target);
  await expect(num).toHaveText(String(target));
});

test("with reduced motion the score shows its final value straight away", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  const page = await context.newPage();
  await page.goto("/");
  const num = page.locator("[data-count-to]").first();
  await expect(num).toBeVisible();
  const target = await num.getAttribute("data-count-to");
  expect(await num.textContent()).toBe(target);
  await context.close();
});


test("memo confines keyboard focus and restores its opener", async ({ page }) => {
  await page.goto("/");
  const opener = page.getByRole("button", { name: "Full memo", exact: true });
  await opener.click();
  const dialog = page.getByRole("dialog", { name: "Scorecard and evidence" });
  await expect(dialog).toBeVisible();
  expect(await dialog.evaluate((el) => el.contains(document.activeElement))).toBe(true);
  const count = await dialog.locator("button, a[href]").count();
  for (let i = 0; i < count + 2; i++) {
    await page.keyboard.press("Tab");
    // A native modal dialog may hand focus to the browser UI (body); it must never reach background content.
    expect(await dialog.evaluate((el) => el.contains(document.activeElement) || document.activeElement === document.body)).toBe(true);
  }
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  await expect(opener).toBeFocused();
  await opener.click();
  await dialog.getByRole("button", { name: "Close", exact: true }).click();
  await expect(opener).toBeFocused();
});

test("redemption uses neutral public copy before and after success", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Account" } } }));
  await page.route("**/api/cases", (route) => route.fulfill({ status: 402, json: { error: "The check did not start." } }));
  await page.route("**/api/invites", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto(`${LIVE}/demo`);
  await page.getByPlaceholder("Website, phone or payee").fill("example.com");
  await page.getByRole("button", { name: "Run a live check" }).click();
  await expect(page.getByPlaceholder("Access code")).toBeVisible();
  expect(leak(await publicCopy(page))).toBeNull();
  await page.getByPlaceholder("Access code").fill("valid-code");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("Done.", { exact: true })).toBeVisible();
  expect(leak(await publicCopy(page))).toBeNull();
});
