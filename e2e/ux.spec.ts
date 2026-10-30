import AxeBuilder from "@axe-core/playwright";
import { encode } from "@auth/core/jwt";
import { expect, test, type Page } from "@playwright/test";

// The kill-switch server: live checks off, so pages stay on recorded cases and nothing calls a provider.
const SITE = "http://127.0.0.1:3212";
const PAGES = ["/", "/demo", "/sign-in", "/case/quantum-yield", "/no-such-page"];
const VIEWPORTS = { desktop: { width: 1280, height: 900 }, mobile: { width: 390, height: 844 } };

test.describe.configure({ mode: "serial" });
test.use({ contextOptions: { reducedMotion: "reduce" } });

async function signInWithUsername(page: Page, password: string): Promise<void> {
  await page.goto(`${SITE}/sign-in?callbackUrl=%2Fdemo`);
  await page.getByLabel("Username").fill("e2e-judge");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
}

async function seriousA11yIssues(page: Page): Promise<string[]> {
  const result = await new AxeBuilder({ page }).analyze();
  return result.violations
    .filter((item) => item.impact === "serious" || item.impact === "critical")
    .map((item) => `${item.id}: ${item.nodes.map((node) => node.target.join(" ")).join(", ")}`);
}

test("every page has no serious or critical accessibility issues, signed out and signed in", async ({ page }) => {
  for (const path of PAGES) {
    await page.goto(`${SITE}${path}`);
    await expect(page.locator("header.site-header[data-session='out']")).toBeVisible();
    expect(await seriousA11yIssues(page), path).toEqual([]);
  }
  await signInWithUsername(page, "e2e-judge-password");
  await expect(page.locator("header.site-header[data-session='in']")).toBeVisible();
  for (const path of PAGES) {
    await page.goto(`${SITE}${path}`);
    await expect(page.locator("header.site-header[data-session='in']")).toBeVisible();
    expect(await seriousA11yIssues(page), `${path} signed in`).toEqual([]);
  }
});

test("a wrong login shows one neutral error and keeps the visitor signed out", async ({ page }) => {
  await signInWithUsername(page, "not-the-password");
  await expect(page.locator("form").getByRole("alert")).toHaveText("That username or password did not work. Check them and try again.");
  await expect(page.getByLabel("Password")).toHaveAttribute("aria-invalid", "true");
  await expect(page).toHaveURL(/\/sign-in/);
  await expect(page.locator("header.site-header[data-session='out']")).toBeVisible();
});

test("the sign-in fields have a visible border, background and focus ring", async ({ page }) => {
  await page.goto(`${SITE}/sign-in`);
  const field = page.getByLabel("Username");
  const look = await field.evaluate((el) => { const s = getComputedStyle(el); return { border: s.borderTopWidth, style: s.borderTopStyle, bg: s.backgroundColor }; });
  expect(look).toEqual({ border: "1px", style: "solid", bg: "rgb(255, 255, 255)" });
  await field.focus();
  expect(await field.evaluate((el) => getComputedStyle(el).outlineStyle)).toBe("solid");
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toHaveClass(/btn-primary/);
  await page.goto(`${SITE}/demo`);
  for (const label of ["Website, phone or payee", "What you were told (optional)"]) {
    const box = page.getByLabel(label);
    await expect(box).toBeVisible();
    expect(await box.evaluate((el) => getComputedStyle(el).borderTopStyle), label).toBe("solid");
  }
});

test("sign in, see who is signed in, play a recorded case, then sign out", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await signInWithUsername(page, "e2e-judge-password");
  await expect(page).toHaveURL(/\/demo$/);
  const header = page.locator("header.site-header[data-session='in']");
  await expect(header).toContainText("Signed in as Guest");
  await expect(header).not.toContainText("Account");
  await page.getByRole("button", { name: /Bright Parcel Deals/ }).click();
  await expect(page.locator(".dash-live")).toHaveAttribute("aria-label", /parcel/i);
  await expect(page.locator(".dash-live .stamp")).toHaveText(/risk/, { timeout: 30_000 });
  await header.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${SITE}/`);
  await expect(page.locator("header.site-header[data-session='out']")).toBeVisible();
  const session = await (await page.request.get(`${SITE}/api/session`)).json();
  expect(session.user).toBeNull();
});

test("a failed sign out says so and leaves the visitor signed in", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await signInWithUsername(page, "e2e-judge-password");
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator("header.site-header[data-session='in']")).toBeVisible();
  await page.route("**/api/auth/signout", (route) => route.abort());
  await page.locator("header.site-header").getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator("header.site-header").getByRole("alert")).toHaveText("Sign out did not finish. Try again.");
  await expect(page.locator("header.site-header")).toContainText("Signed in as Guest");
});

test("sign out is not reported as done when the session check is refused", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await signInWithUsername(page, "e2e-judge-password");
  await expect(page).toHaveURL(/\/demo$/);
  // Wait for the header's own lookup, so the refusal below only hits the sign-out check.
  await expect(page.locator("header.site-header[data-session='in']")).toBeVisible();
  await page.route("**/api/auth/signout", (route) => route.fulfill({ status: 429, contentType: "application/json", body: "{}" }));
  await page.route("**/api/session", (route) => route.fulfill({ status: 429, contentType: "application/json", body: "{\"error\":\"Too busy\"}" }));
  await page.locator("header.site-header").getByRole("button", { name: "Sign out" }).click();
  await expect(page.locator("header.site-header").getByRole("alert")).toHaveText("Sign out did not finish. Try again.");
  await expect(page).toHaveURL(/\/demo$/);
});

test("a recorded case that cannot load says so", async ({ page }) => {
  await page.route("**/api/replays/**", (route) => route.abort());
  await page.goto(`${SITE}/demo?case=quantum-yield`);
  await expect(page.getByText("That recorded case could not be loaded.")).toBeVisible();
  await page.unroute("**/api/replays/**");
  await page.route("**/api/replays/**", (route) => route.fulfill({ status: 200, contentType: "application/json", body: "not json" }));
  await page.getByRole("button", { name: /Bright Parcel Deals/ }).click();
  await expect(page.getByText("That recorded case could not be loaded.")).toBeVisible();
});

test("a refused session lookup keeps the signed-in header", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await signInWithUsername(page, "e2e-judge-password");
  await expect(page.locator("header.site-header")).toContainText("Signed in as Guest");
  await page.route("**/api/session", (route) => route.fulfill({ status: 429, contentType: "application/json", body: "{\"error\":\"Too busy\"}" }));
  await page.locator("header.site-header").getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/#how-it-works|\/$/);
  await expect(page.locator("header.site-header[data-session='in']")).toContainText("Signed in as Guest");
});

test("a refused live check shows plain words, not a status code", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Pat" } } }));
  await page.route("**/api/cases", (route) => route.fulfill({ status: 403, json: { error: "unavailable" } }));
  await page.goto(`${SITE}/demo`);
  await page.getByLabel("Website, phone or payee").fill("example.com");
  await page.getByRole("button", { name: "Run a live check" }).click();
  await expect(page.getByText("The live check could not start. Try again.")).toBeVisible();
  await expect(page.getByText("unavailable", { exact: true })).toHaveCount(0);
});

test("a slow live check from before leaving /demo does not fill the result later", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Pat" } } }));
  await page.route("**/api/cases", async (route) => {
    await new Promise((done) => setTimeout(done, 2_000));
    const late = { case_id: "late", seq: 1, ts: "", type: "case.started", payload: { input: "late.example", mode: "live" } };
    await route.fulfill({ status: 200, contentType: "text/event-stream", body: `data: ${JSON.stringify(late)}\n\n` }).catch(() => {});
  });
  await page.goto(`${SITE}/demo`);
  await page.getByLabel("Website, phone or payee").fill("late.example");
  await page.getByRole("button", { name: "Run a live check" }).click();
  await page.locator("header.site-header").getByRole("link", { name: "How it works" }).click();
  await page.locator("header.site-header").getByRole("link", { name: "Check now" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await page.waitForTimeout(3_000);
  await expect(page.locator(".dash-live .dash-subject")).not.toHaveText("late.example");
  await expect(page.locator(".dash-live .stamp")).toHaveText("Ready");
});

test("a failed second recording does not leave the first one showing", async ({ page }) => {
  await page.goto(`${SITE}/demo?case=quantum-yield`);
  await expect(page.locator(".dash-live .stamp")).toHaveText(/risk/, { timeout: 30_000 });
  await page.route("**/api/replays/**", async (route) => {
    await new Promise((done) => setTimeout(done, 1_000));
    await route.abort();
  });
  await page.getByRole("button", { name: /Bright Parcel Deals/ }).click();
  await expect(page.locator(".dash-live .stamp")).toHaveText("Ready");
  await expect(page.getByText("That recorded case could not be loaded.")).toBeVisible();
  await expect(page.locator(".dash-live")).not.toContainText("quantumyield.example");
});

for (const body of ["", `data: ${JSON.stringify({ case_id: "cut", seq: 1, ts: "", type: "case.started", payload: { input: "cut.example", mode: "live" } })}\n\n`]) {
  test(`a live check that ends early says so (${body ? "after case.started" : "empty stream"})`, async ({ page }) => {
    await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Pat" } } }));
    await page.route("**/api/cases", (route) => route.fulfill({ status: 200, contentType: "text/event-stream", body }));
    await page.goto(`${SITE}/demo`);
    await page.getByLabel("Website, phone or payee").fill("cut.example");
    await page.getByRole("button", { name: "Run a live check" }).click();
    await expect(page.getByText("The check stopped before a case file was ready. Recorded examples still play.")).toBeVisible();
    await expect(page.locator(".dash-live .stamp")).toHaveText("Ready");
    await expect(page.getByRole("button", { name: "Run a live check" })).toBeEnabled();
  });
}

test("a failed opening recording after another case shows nothing stale", async ({ page }) => {
  await page.goto(`${SITE}/demo?case=quantum-yield`);
  await expect(page.locator(".dash-live .stamp")).toHaveText(/risk/, { timeout: 30_000 });
  await page.route("**/api/replays/**", (route) => route.abort());
  await page.getByRole("link", { name: "Scam Scout" }).first().click();
  await expect(page).toHaveURL(`${SITE}/`);
  // Client-side navigation keeps the shared store, as a visitor clicking through would.
  await page.evaluate(() => (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push("/demo?case=bright-parcel"));
  await expect(page).toHaveURL(/case=bright-parcel/);
  await expect(page.getByText("That recorded case could not be loaded.")).toBeVisible();
  await expect(page.locator(".dash-live")).not.toContainText("quantumyield.example");
});

test("moving between two /demo queries shows the new one", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Pat" } } }));
  await page.goto(`${SITE}/demo?q=first.example`);
  await expect(page.locator("#live-check")).toHaveValue("first.example");
  await page.evaluate(() => (window as unknown as { next: { router: { push: (href: string) => void } } }).next.router.push("/demo?q=second.example"));
  await expect(page.locator("#live-check")).toHaveValue("second.example");
});

test("sign out still works when storage is blocked", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await signInWithUsername(page, "e2e-judge-password");
  await expect(page).toHaveURL(/\/demo$/);
  await page.evaluate(() => { Storage.prototype.removeItem = () => { throw new DOMException("blocked", "SecurityError"); }; });
  await page.locator("header.site-header").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${SITE}/`);
  await expect(page.locator("header.site-header[data-session='out']")).toBeVisible();
});

test("a live check still starts when browser storage is blocked", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Pat" } } }));
  let posts = 0;
  await page.route("**/api/cases", (route) => { posts += 1; return route.fulfill({ status: 403, json: { error: "unavailable" } }); });
  await page.addInitScript(() => {
    const blocked = () => { throw new DOMException("blocked", "SecurityError"); };
    Storage.prototype.getItem = blocked;
    Storage.prototype.setItem = blocked;
  });
  await page.goto(`${SITE}/demo`);
  await page.getByLabel("Website, phone or payee").fill("example.com");
  await page.getByRole("button", { name: "Run a live check" }).click();
  await expect(page.getByText("The live check could not start. Try again.")).toBeVisible();
  expect(posts).toBe(1);
  await page.getByText("Use your own keys").click();
  await page.getByPlaceholder("Paste a research key").fill("tvly-kept");
  await page.getByPlaceholder("Paste a model key").fill("nv-kept");
  await page.getByRole("button", { name: "Use these keys" }).click();
  await expect(page.getByPlaceholder("Paste a research key")).toHaveValue("tvly-kept");
});

test("a failed first session lookup offers a retry instead of a false signed-out state", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  let refuse = true;
  await page.route("**/api/session", (route) => (refuse ? route.fulfill({ status: 429, json: { error: "Too busy" } }) : route.fulfill({ json: { user: { name: "Pat" } } })));
  await page.goto(`${SITE}/sign-in`);
  const header = page.locator("header.site-header[data-session='unknown']");
  await expect(header).toBeVisible();
  await expect(header.getByRole("link", { name: "Sign in" })).toHaveCount(0);
  refuse = false;
  await header.getByRole("button", { name: "Check sign-in status again" }).click();
  await expect(page.locator("header.site-header[data-session='in']")).toContainText("Signed in as Pat");
});

test("a dropped access-code request says so", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Pat" } } }));
  await page.route("**/api/cases", (route) => route.fulfill({ status: 402, json: { error: "The check did not start." } }));
  await page.route("**/api/invites", (route) => route.abort());
  await page.goto(`${SITE}/demo`);
  await page.getByLabel("Website, phone or payee").fill("example.com");
  await page.getByRole("button", { name: "Run a live check" }).click();
  await page.getByPlaceholder("Access code").fill("code");
  await page.getByRole("button", { name: "Continue", exact: true }).click();
  await expect(page.getByText("That did not go through. Try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue", exact: true })).toBeEnabled();
});

test("a dropped bot-check request says so and resets the widget", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Pat" }, turnstileSiteKey: "e2e-site" } }));
  await page.route("**/challenges.cloudflare.com/**", (route) => route.fulfill({
    contentType: "application/javascript",
    body: "window.renders=(window.renders||0)+1;window.turnstile={render(el,o){o.callback('tok');}};",
  }));
  await page.route("**/api/human", (route) => route.abort());
  await page.goto(`${SITE}/demo`);
  await expect(page.getByText("The live check could not start. Try again.")).toBeVisible();
  await page.waitForTimeout(500);
  expect(await page.evaluate(() => (window as unknown as { renders: number }).renders)).toBe(1);
  await page.getByRole("button", { name: "Try the check again" }).click();
  await expect.poll(() => page.evaluate(() => (window as unknown as { renders: number }).renders)).toBe(2);
});

test("a failed session lookup on /demo can be retried, then a check starts", async ({ page }) => {
  let refuse = true;
  let posts = 0;
  await page.route("**/api/session", (route) => (refuse ? route.fulfill({ status: 429, json: { error: "Too busy" } }) : route.fulfill({ json: { user: { name: "Pat" } } })));
  await page.route("**/api/cases", (route) => { posts += 1; return route.fulfill({ status: 403, json: { error: "unavailable" } }); });
  await page.goto(`${SITE}/demo`);
  await expect(page.getByText("We could not check your sign-in.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run a live check" })).toBeDisabled();
  refuse = false;
  await page.getByRole("button", { name: "Try again" }).first().click();
  await page.getByLabel("Website, phone or payee").fill("example.com");
  await page.getByRole("button", { name: "Run a live check" }).click();
  await expect(page.getByText("The live check could not start. Try again.")).toBeVisible();
  expect(posts).toBe(1);
});

test("bot-check settings that fail to load can be retried", async ({ page }) => {
  let refuse = true;
  await page.route("**/api/session", (route) => (refuse ? route.fulfill({ status: 429, json: { error: "Too busy" } }) : route.fulfill({ json: { user: { name: "Pat" }, turnstileSiteKey: null } })));
  await page.goto(`${SITE}/demo`);
  await expect(page.getByText("The check could not be prepared.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Allow a live check" })).toHaveCount(0);
  refuse = false;
  await page.getByText("The check could not be prepared.").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Allow a live check" })).toBeVisible();
});

test("a bot-check script that fails to load offers a retry", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Pat" }, turnstileSiteKey: "e2e-site" } }));
  await page.route("**/challenges.cloudflare.com/**", (route) => route.abort());
  await page.goto(`${SITE}/demo`);
  await expect(page.getByText("The live check could not start. Try again.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Try the check again" })).toBeVisible();
});

test("Enter in the access-code field redeems the code, not the check", async ({ page }) => {
  await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Pat" } } }));
  let checks = 0;
  await page.route("**/api/cases", (route) => { checks += 1; return route.fulfill({ status: 402, json: { error: "The check did not start." } }); });
  await page.route("**/api/invites", (route) => route.fulfill({ json: { ok: true } }));
  await page.goto(`${SITE}/demo`);
  await page.getByLabel("Website, phone or payee").fill("example.com");
  await page.getByRole("button", { name: "Run a live check" }).click();
  await page.getByPlaceholder("Access code").fill("code");
  await page.getByPlaceholder("Access code").press("Enter");
  await expect(page.getByText("Done.", { exact: true })).toBeVisible();
  expect(checks).toBe(1);
});

test("a failed settings lookup on /sign-in can be retried to enable Google", async ({ page }) => {
  let refuse = true;
  await page.route("**/api/session", (route) => (refuse ? route.fulfill({ status: 429, json: { error: "Too busy" } }) : route.fulfill({ json: { user: null, googleAuthConfigured: true } })));
  await page.goto(`${SITE}/sign-in`);
  await expect(page.getByText("Account sign-in could not be checked.")).toBeVisible();
  refuse = false;
  await page.getByText("Account sign-in could not be checked.").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { name: "Continue with your account" })).toBeEnabled();
});

test("coming back to /demo after a recorded case opens an empty result", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await page.goto(`${SITE}/demo?case=quantum-yield`);
  await expect(page.locator(".dash-live .stamp")).toHaveText(/risk/, { timeout: 30_000 });
  await page.getByRole("link", { name: "Scam Scout" }).first().click();
  await expect(page).toHaveURL(`${SITE}/`);
  await page.locator("header.site-header").getByRole("link", { name: "Check now" }).click();
  await expect(page).toHaveURL(/\/demo$/);
  await expect(page.locator("#live-check")).toHaveValue("");
  await expect(page.locator(".dash-live .stamp")).toHaveText("Ready");
  await page.goto(`${SITE}/demo?case=quantum-yield`);
  await expect(page.locator(".dash-live .stamp")).toHaveText(/risk/, { timeout: 30_000 });
  // Signed-in visitors go straight to /demo with their query.
  await page.route("**/api/session", (route) => route.fulfill({ json: { user: { name: "Pat" } } }));
  await page.getByRole("link", { name: "Scam Scout" }).first().click();
  await expect(page).toHaveURL(`${SITE}/`);
  await page.locator("input#check").fill("other.example");
  await page.locator("input#check").press("Enter");
  await expect(page).toHaveURL(/\/demo\?q=/);
  await expect(page.locator("#live-check")).toHaveValue("other.example");
  await expect(page.locator(".dash-live .stamp")).toHaveText("Ready");
});

test("sign out forgets keys entered in this tab", async ({ page }) => {
  await page.setViewportSize(VIEWPORTS.desktop);
  await signInWithUsername(page, "e2e-judge-password");
  await expect(page).toHaveURL(/\/demo$/);
  await page.evaluate(() => { sessionStorage.setItem("ss_byok_research", "tvly-x"); sessionStorage.setItem("ss_byok_model", "nv-x"); });
  await page.locator("header.site-header").getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${SITE}/`);
  expect(await page.evaluate(() => [sessionStorage.getItem("ss_byok_research"), sessionStorage.getItem("ss_byok_model")])).toEqual([null, null]);
});

test("the mobile menu shows the signed-in state and signs out", async ({ page }) => {
  await signInWithUsername(page, "e2e-judge-password");
  await expect(page).toHaveURL(/\/demo$/);
  await page.setViewportSize(VIEWPORTS.mobile);
  await page.getByRole("button", { name: "Open menu" }).click();
  const drawer = page.locator("#site-drawer");
  await expect(drawer).toContainText("Signed in as Guest");
  await drawer.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(`${SITE}/`);
  await expect(page.locator("header.site-header[data-session='out']")).toBeVisible();
});

test("a visitor who may run live checks sees that live checks are on", async ({ page }) => {
  const LIVE = "http://127.0.0.1:3210";
  const value = await encode({ token: { sub: "user_live_note", email: "owner@example.com", name: "Pat" }, secret: "e2e-auth-secret-value", salt: "authjs.session-token" });
  await page.context().addCookies([{ name: "authjs.session-token", value, url: LIVE, httpOnly: true, sameSite: "Lax" }]);
  await page.goto(`${LIVE}/demo`);
  await expect(page.locator("[data-live-note='true']")).toHaveText("Live checks are on.");
  await expect(page.locator("header.site-header[data-session='in']")).toContainText("Signed in as Pat");
});

for (const [name, viewport] of Object.entries(VIEWPORTS)) {
  test(`visual snapshots on ${name}`, async ({ page }) => {
    await page.setViewportSize(viewport);
    // A quiet stand-in for the third-party widget keeps snapshots independent of the network.
    await page.route("**/challenges.cloudflare.com/**", (route) => route.fulfill({ contentType: "application/javascript", body: "window.turnstile={render(){}};" }));
    const shot = { fullPage: false, maxDiffPixelRatio: 0.03, animations: "disabled" as const, mask: [page.locator("canvas")] };
    for (const [label, path] of [["home", "/"], ["demo", "/demo"], ["sign-in", "/sign-in"]]) {
      await page.goto(`${SITE}${path}`);
      await expect(page.locator("header.site-header[data-session='out']")).toBeVisible();
      await page.waitForLoadState("networkidle");
      await expect(page).toHaveScreenshot(`${label}-${name}.png`, shot);
    }
    await signInWithUsername(page, "e2e-judge-password");
    await expect(page.locator("header.site-header[data-session='in']")).toBeVisible();
    if (name === "mobile") await page.getByRole("button", { name: "Open menu" }).click();
    await expect(page.locator("header.site-header")).toHaveScreenshot(`signed-in-header-${name}.png`, shot);
  });
}
