/**
 * Starts the offline provider mock, then four production servers.
 * 3210 live (hourly cap 1, daily cap 10), 3211 daily cap 1,
 * 3212 kill switch off, 3213 spend ceiling 0.
 */
import { spawn } from "node:child_process";
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import bcrypt from "bcryptjs";

const root = process.env.E2E_APP_ROOT || process.cwd();
const mockPort = 8799;
const secret = "e2e-auth-secret-value";
const children = [];

function start(command, args, env) {
  const child = spawn(command, args, { cwd: root, env, stdio: "inherit" });
  children.push(child);
  child.on("exit", (code) => {
    if (code && code !== 0) {
      process.stderr.write(`${command} exited ${code}\n`);
      shutdown(code);
    }
  });
  return child;
}

function shutdown(code = 0) {
  for (const child of children) child.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGTERM", () => shutdown(0));
process.on("SIGINT", () => shutdown(0));

function waitFor(url) {
  return new Promise((resolve, reject) => {
    const started = Date.now();
    const tick = () => {
      const req = http.get(url, (res) => {
        res.resume();
        if (res.statusCode && res.statusCode < 500) resolve();
        else retry();
      });
      req.on("error", retry);
      function retry() {
        if (Date.now() - started > 120_000) reject(new Error(`timed out waiting for ${url}`));
        else setTimeout(tick, 400);
      }
    };
    tick();
  });
}

const mock = start(process.execPath, [path.join(root, "e2e/provider-mock.mjs")], { ...process.env, E2E_MOCK_PORT: String(mockPort) });
await new Promise((resolve, reject) => {
  mock.once("error", reject);
  waitFor(`http://127.0.0.1:${mockPort}/stats`).then(resolve, reject);
});

// Each run starts with empty counters, so login lockouts from an earlier local run do not carry over.
fs.rmSync("/tmp/scam-scout-e2e-usage.json", { force: true });

const shared = {
  ...process.env,
  NODE_ENV: "production",
  AUTH_SECRET: secret,
  AUTH_URL: "http://127.0.0.1:3210",
  NEXT_PUBLIC_SITE_URL: "http://127.0.0.1:3210",
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "e2e-turnstile-site",
  TURNSTILE_SECRET_KEY: "e2e-turnstile-secret",
  TURNSTILE_VERIFY_URL: `http://127.0.0.1:${mockPort}/turnstile`,
  TAVILY_BASE_URL: `http://127.0.0.1:${mockPort}/tavily`,
  NEBIUS_BASE_URL: `http://127.0.0.1:${mockPort}/v1`,
  NEBIUS_API_KEY: "nvapi-e2e-model-key",
  LIVE_ALLOWLIST_EMAILS: "owner@example.com",
  JUDGE_USERNAME: "e2e-judge",
  AUTH_GOOGLE_ID: "e2e-google-client",
  AUTH_GOOGLE_SECRET: "e2e-google-not-a-secret",
  TAVILY_CREDIT_HARD_LIMIT: "400",
  JUDGE_PASSWORD_HASH: bcrypt.hashSync("e2e-judge-password", 4),
  UPSTASH_REDIS_REST_TOKEN: "e2e-upstash-token",
  RDAP_BASE_URL: `http://127.0.0.1:${mockPort}/rdap`,
  USAGE_DATA_FILE: "/tmp/scam-scout-e2e-usage.json",
  VERCEL_URL: "deployment.vercel.app",
  VERCEL_BRANCH_URL: "preview.vercel.app",
};
delete shared.UPSTASH_REDIS_REST_URL;

const apps = [
  { port: 3210, LIVE_MODE_ENABLED: "on", OWNER_DAILY_LIVE_CAP: "10", RATE_LIMIT_PER_HOUR: "1", SPEND_HARD_LIMIT_USD: "5.00", TAVILY_API_KEY: "tvly-live-e2e-key", UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${mockPort}/redis-live` },
  { port: 3211, LIVE_MODE_ENABLED: "on", OWNER_DAILY_LIVE_CAP: "1", RATE_LIMIT_PER_HOUR: "5", SPEND_HARD_LIMIT_USD: "5.00", TAVILY_API_KEY: "tvly-cap-e2e-key", UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${mockPort}/redis-cap` },
  { port: 3212, LIVE_MODE_ENABLED: "", OWNER_DAILY_LIVE_CAP: "10", RATE_LIMIT_PER_HOUR: "5", SPEND_HARD_LIMIT_USD: "5.00", TAVILY_API_KEY: "tvly-kill-e2e-key" },
  { port: 3213, LIVE_MODE_ENABLED: "on", OWNER_DAILY_LIVE_CAP: "10", RATE_LIMIT_PER_HOUR: "5", SPEND_HARD_LIMIT_USD: "0", TAVILY_API_KEY: "tvly-stop-e2e-key", UPSTASH_REDIS_REST_URL: `http://127.0.0.1:${mockPort}/redis-stop` },
];

for (const app of apps) {
  const { port, ...env } = app;
  start(process.execPath, [path.join(root, "node_modules/next/dist/bin/next"), "start", "-H", "127.0.0.1", "-p", String(port)], { ...shared, ...env });
}

await Promise.all(apps.map((app) => waitFor(`http://127.0.0.1:${app.port}/api/health`)));
process.stdout.write("e2e servers ready\n");
await new Promise(() => {});
