/**
 * Offline stand-in for Upstash, Tavily, Nebius, and Turnstile.
 * One process, separate Redis maps per URL path.
 */
import http from "node:http";

const stats = { tavily: {}, nebius: {} };
const stores = new Map();

function redisFor(pathname) {
  if (!stores.has(pathname)) stores.set(pathname, { strings: new Map(), lists: new Map() });
  return stores.get(pathname);
}

function num(value, fallback = 0) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function readJson(raw, fallback) {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function exec(store, args) {
  const command = String(args[0] ?? "").toUpperCase();
  const key = args[1] == null ? "" : String(args[1]);
  if (command === "GET") return store.strings.has(key) ? store.strings.get(key) : null;
  if (command === "SET") {
    store.strings.set(key, String(args[2] ?? ""));
    return "OK";
  }
  if (command === "DEL") {
    const removed = store.strings.delete(key) ? 1 : 0;
    return removed;
  }
  if (command === "INCR" || command === "DECR") {
    const delta = command === "INCR" ? 1 : -1;
    const next = num(store.strings.get(key)) + delta;
    store.strings.set(key, String(next));
    return next;
  }
  if (command === "INCRBY" || command === "DECRBY") {
    const delta = num(args[2]) * (command === "DECRBY" ? -1 : 1);
    const next = num(store.strings.get(key)) + delta;
    store.strings.set(key, String(next));
    return next;
  }
  if (command === "INCRBYFLOAT") {
    const next = num(store.strings.get(key)) + num(args[2]);
    store.strings.set(key, String(next));
    return String(next);
  }
  if (command === "PEXPIRE") return 1;
  if (command === "LPUSH") {
    const list = store.lists.get(key) ?? [];
    list.unshift(String(args[2] ?? ""));
    store.lists.set(key, list);
    return list.length;
  }
  if (command === "LREM") {
    const list = store.lists.get(key) ?? [];
    const value = String(args[3] ?? "");
    const next = list.filter((item) => item !== value);
    store.lists.set(key, next);
    return list.length - next.length;
  }
  if (command === "LRANGE") {
    const list = store.lists.get(key) ?? [];
    const start = num(args[2]);
    const end = num(args[3]);
    const stop = end < 0 ? list.length + end : end;
    return list.slice(start, stop + 1);
  }
  if (command === "EVAL") return evalScript(store, args);
  throw new Error(`redis ${command}`);
}

function evalScript(store, args) {
  const script = String(args[1] ?? "");
  const keys = num(args[2]);
  const keyAt = (index) => String(args[3 + index]);
  const argAt = (index) => args[3 + keys + index];
  if (script.includes("redis.call('EXISTS', KEYS[1]) == 1 then return 0")) {
    // One-time fold of older monthly spend keys into the lifetime keys.
    if (store.strings.has(keyAt(0))) return 0;
    const n = num(argAt(0));
    let usd = 0;
    let credits = 0;
    for (let i = 1; i <= n; i += 1) {
      usd += num(store.strings.get(keyAt(2 + i)));
      credits += num(store.strings.get(keyAt(2 + n + i)));
    }
    if (usd > 0) store.strings.set(keyAt(1), String(num(store.strings.get(keyAt(1))) + usd));
    if (credits > 0) store.strings.set(keyAt(2), String(num(store.strings.get(keyAt(2))) + credits));
    store.strings.set(keyAt(0), "1");
    return 1;
  }
  if (script.includes("(usd + addUsd) >= maxUsd")) {
    const usd = num(store.strings.get(keyAt(0)));
    const month = num(store.strings.get(keyAt(1)));
    const day = keys >= 3 ? num(store.strings.get(keyAt(2))) : month;
    const addUsd = num(argAt(0));
    const addCredits = num(argAt(1));
    const maxUsd = num(argAt(2));
    const maxMonth = num(argAt(3));
    const maxDay = keys >= 3 ? num(argAt(4)) : maxMonth;
    if (addUsd < 0 || addCredits < 0 || usd < 0 || month < 0 || day < 0) return -1;
    if (usd + addUsd >= maxUsd || month + addCredits >= maxMonth) return 0;
    if (day + addCredits >= maxDay) return 2;
    if (addUsd > 0) store.strings.set(keyAt(0), String(usd + addUsd));
    if (addCredits > 0) {
      store.strings.set(keyAt(1), String(month + addCredits));
      if (keys >= 3) store.strings.set(keyAt(2), String(day + addCredits));
    }
    return 1;
  }
  if (script.includes("PEXPIRE")) {
    const limit = num(argAt(0));
    const current = num(store.strings.get(keyAt(0)));
    if (current >= limit) return [0, current];
    const next = current + 1;
    store.strings.set(keyAt(0), String(next));
    return [1, next];
  }
  if (script.includes("INCRBY") && script.includes("amount")) {
    const amount = num(argAt(0));
    const cap = num(argAt(1));
    const current = num(store.strings.get(keyAt(0)));
    if (current + amount > cap) return [0, current];
    const next = current + amount;
    store.strings.set(keyAt(0), String(next));
    return [1, next];
  }
  if (script.includes("used = used + 1") || script.includes("used >= allowance")) {
    const parsed = readJson(store.strings.get(keyAt(0)), { used: 0, bonus: 0, codes: [] });
    let used = num(parsed.used);
    const bonus = num(parsed.bonus);
    const codes = Array.isArray(parsed.codes) ? parsed.codes : [];
    const floor = num(argAt(1));
    if (used < floor) used = floor;
    const ok = used < num(argAt(0)) + bonus;
    if (ok) used += 1;
    store.strings.set(keyAt(0), JSON.stringify({ used, bonus, codes }));
    return JSON.stringify({ ok, used, bonus, codes });
  }
  if (script.includes("used - 1") || script.includes("used = used - 1")) {
    const parsed = readJson(store.strings.get(keyAt(0)), { used: 0, bonus: 0, codes: [] });
    let used = num(parsed.used);
    if (used > 0) used -= 1;
    parsed.used = used;
    const encoded = JSON.stringify(parsed);
    store.strings.set(keyAt(0), encoded);
    return encoded;
  }
  throw new Error("redis eval");
}

function subjectOf(query) {
  const quoted = String(query).match(/"([^"]+)"/);
  if (quoted?.[1]) return quoted[1];
  return String(query)
    .replace(/ investor alert list$/i, "")
    .replace(/ news advisory$/i, "")
    .replace(/ review complaint$/i, "")
    .replace(/ scam$/i, "")
    .trim();
}

function regulatorQuery(body) {
  const query = String(body.query ?? "");
  const domains = Array.isArray(body.include_domains) ? body.include_domains : [];
  return domains.length > 0 || /investor alert|news\/warnings|warning list|i-scan|red list/i.test(query);
}

function tavilyBody(pathname, body) {
  if (pathname.endsWith("/search")) {
    const query = String(body.query ?? "");
    const regulator = regulatorQuery(body);
    const name = subjectOf(query) || "Harbour Desk";
    const credits = body.search_depth === "advanced" ? 2 : 1;
    return {
      request_id: "req_e2e",
      usage: { credits },
      results: regulator
        ? [{
            url: "https://www.fco.example/news/warnings/harbour-desk-clone",
            title: name,
            content: `${name} is not authorised. We call this a clone firm.`,
          }]
        : [],
    };
  }
  return { results: [], urls: [], usage: { credits: 1 } };
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on("data", (chunk) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

function send(res, status, body, type = "application/json") {
  const payload = typeof body === "string" ? body : JSON.stringify(body);
  res.writeHead(status, { "content-type": type });
  res.end(payload);
}

function bearer(req) {
  const header = req.headers.authorization ?? "";
  return header.startsWith("Bearer ") ? header.slice(7) : "";
}

function bump(bucket, key) {
  bucket[key] = (bucket[key] ?? 0) + 1;
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    if (req.method === "GET" && url.pathname === "/stats") {
      send(res, 200, stats);
      return;
    }
    if (req.method === "POST" && url.pathname === "/stats/reset") {
      stats.tavily = {};
      stats.nebius = {};
      send(res, 200, { ok: true });
      return;
    }
    const raw = await readBody(req);
    if (url.pathname.startsWith("/redis-")) {
      const args = JSON.parse(raw || "[]");
      send(res, 200, { result: exec(redisFor(url.pathname), args) });
      return;
    }
    if (url.pathname.startsWith("/tavily/")) {
      const key = bearer(req) || "unknown";
      bump(stats.tavily, key);
      if (key.includes("live") || key.includes("cap")) await new Promise((resolve) => setTimeout(resolve, 900));
      const body = JSON.parse(raw || "{}");
      send(res, 200, tavilyBody(url.pathname, body));
      return;
    }
    if (url.pathname === "/v1/chat/completions") {
      bump(stats.nebius, bearer(req) || "unknown");
      const content = JSON.stringify({
        names: ["Harbour Desk"],
        hypotheses: ["clone"],
        priors: { investment_scam: 0.7, fake_shop: 0.1, impersonation: 0.1, app_mule: 0.1 },
        questions: [],
        action: "stop",
        reason: "The regulator page is cited.",
        disputed: [],
        note: "Warning list.",
        markdown: "The cited page shows scam risk indicators. Decision support only — not a determination of fraud.",
      });
      send(res, 200, {
        choices: [{ message: { content } }],
        // Real counts never exceed the reserved bound (prompt bytes plus max_tokens), so the mock stays under it.
        usage: { prompt_tokens: 200, completion_tokens: 100 },
      });
      return;
    }
    if (url.pathname === "/turnstile") {
      const form = new URLSearchParams(raw);
      const token = form.get("response") ?? "";
      const ok = Boolean(form.get("secret") && token);
      const hostname = token === "tok-preview" ? "preview.vercel.app" : token === "tok-evil" ? "evil.example" : "127.0.0.1";
      send(res, 200, ok
        ? { success: true, hostname }
        : { success: false, hostname, "error-codes": ["invalid-input-response"] });
      return;
    }
    if (url.pathname.startsWith("/rdap/domain/")) {
      send(res, 200, { events: [{ eventAction: "registration", eventDate: "2024-01-02T00:00:00Z" }], registrar: "Example" });
      return;
    }
    send(res, 404, { error: `no mock for ${url.pathname}` });
  } catch (error) {
    send(res, 500, { error: error instanceof Error ? error.message : "mock_failed" });
  }
});

const port = Number(process.env.E2E_MOCK_PORT || 8799);
server.listen(port, "127.0.0.1", () => {
  process.stdout.write(`mock listening ${port}\n`);
});
