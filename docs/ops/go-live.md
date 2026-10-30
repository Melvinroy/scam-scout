# Go live

Names only. Values stay in the Vercel project, never in the repo.

## Required on Vercel for a hosted live check

- `AUTH_SECRET`
- `AUTH_GOOGLE_ID`
- `AUTH_GOOGLE_SECRET`
- `AUTH_URL`
- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`
- `TURNSTILE_SECRET_KEY`
- `TAVILY_API_KEY`
- `NEBIUS_API_KEY`
- `LIVE_MODE_ENABLED`
- `LIVE_ALLOWLIST_EMAILS`

`GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET` are read if the `AUTH_GOOGLE_*` pair is empty.

`LIVE_MODE_ENABLED` stays off until the allowlist is set. Accepted on-values are `1`, `true`, `on`, and `yes`. Anything else, including empty, keeps live checks off.

`LIVE_ALLOWLIST_EMAILS` is the Google account email, or several separated by commas. The check runs on the server after sign-in. The list is not sent to the browser.

Without the Google pair, sign-in stays closed and recorded examples still play. Without the Turnstile secret in production, an allowlisted live check is denied at the bot step. Without both hosted keys, an allowlisted check plays a recording. Everyone else, signed in or not, gets a recorded preview and the note “Live checks are invite-only during preview.”

## Hard spend stop

- `SPEND_HARD_LIMIT_USD`
- `TAVILY_CREDIT_HARD_LIMIT`
- `TAVILY_DAILY_CREDIT_LIMIT`

`SPEND_HARD_LIMIT_USD` and `TAVILY_CREDIT_HARD_LIMIT` are required. Configure lifetime totals appropriate to your deployment; they never reset. There is no default in code: a blank, non-numeric or negative value refuses live checks. Zero is a real limit and pauses live checks immediately. Each research call holds its worst-case credit charge before it runs, so concurrent calls cannot settle past the cap. `TAVILY_DAILY_CREDIT_LIMIT` and `GLOBAL_LIVE_DAILY_CAP` are off unless set.

Before each Tavily or Nebius call the server reserves the estimate in one Upstash operation, then adjusts that reservation to the token count and the credit count that came back. The same credit change is applied to the lifetime total and the current UTC day. A model that is not in the price table uses the highest listed price. A credit count that is missing or not a number is charged at the lifetime credit limit, and the ledger is then treated as unreadable. Both `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` are required. There is no in-memory spend ledger. If either name is missing, or a read or write fails, live checks stop before a provider call and the owner sees “Live paused: the spend ledger could not be read.” When the lifetime USD total or the lifetime credit total reaches its limit, the owner sees “Live paused: spend limit reached”. When only the daily credit total reaches its limit, the owner sees “Daily search budget reached”. Either pause plays a recording and does not call a provider. `/admin/captures` shows the lifetime USD total, the credits used today, and the credits used in total. If that total cannot be read, the desk says “Running spend could not be read.” and shows the unreadable pause.

## Owner daily cap

- `OWNER_DAILY_LIVE_CAP`

Optional. Unset, blank, or not a positive count uses the default in code. That count is the only usage limit on an allowlisted owner. It replaces the account allowance, the network limit, the device limit, the hourly pace, and the shared pool. The spend ledger still applies. A bring-your-own-keys check from the owner counts against this limit. It does not skip the allowlist, the kill switch, or the spend ledger. Those calls reserve on the same Upstash ledger before the provider is contacted. Each finished run stores its own research and model cost on the capture. Delete a row from `/admin/captures` to drop a duplicate.

## Shared store

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

The spend ledger needs both names on every server, including a single one. Usage counters stay atomic on one process, and the signed usage cookie is the fallback for the account count. With both names set, those counters and finished owner runs are stored there. Captures have no expiry. Without the pair, each instance counts usage on its own, a capture is written on the server’s local file, and live checks stay paused because the spend ledger cannot be read.

## Steps

1. In Google Cloud, create an OAuth client of type Web application. Add the authorized redirect URI `https://<production-host>/api/auth/callback/google`. Add the same path on a preview host if sign-in should work there. Put the client id in `AUTH_GOOGLE_ID` and the client secret in `AUTH_GOOGLE_SECRET`.
2. In Cloudflare Turnstile, create a widget for the site. Put the site key in `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and the secret in `TURNSTILE_SECRET_KEY`. The widget hostname may be `NEXT_PUBLIC_SITE_URL`, `AUTH_URL`, `VERCEL_URL`, `VERCEL_BRANCH_URL`, or the host the browser used, so a preview deployment is accepted when those production URLs are unset. A rejected check is logged with Cloudflare’s error codes and the hostname. The token and the secret are not logged.
3. In the Tavily dashboard, create an API key and set `TAVILY_API_KEY`. In Nebius Token Factory, create an API key and set `NEBIUS_API_KEY`.
4. On the Vercel project, set every name in the required list, plus the Upstash pair. `AUTH_URL` and `NEXT_PUBLIC_SITE_URL` are that site. `LIVE_ALLOWLIST_EMAILS` is the Google account email that should run live checks. Leave `LIVE_MODE_ENABLED` off. Configure `SPEND_HARD_LIMIT_USD` and `TAVILY_CREDIT_HARD_LIMIT` for your deployment. Set `OWNER_DAILY_LIVE_CAP` and `TAVILY_DAILY_CREDIT_LIMIT` only to change the defaults in code. The Upstash pair is required for the spend ledger. The same pair also shares usage limits and captures when more than one server is running.
5. Turn `LIVE_MODE_ENABLED` on only after the allowlist is saved. Everyone else still sees recorded previews and the invite-only note.
6. After an owner run finishes, open `/admin/captures`. Download the JSON if it should live in the repo. Promote the row to play it on the case sheet. From a checkout, run `npm run captures:promote -- path/to/capture.json`. That writes `fixtures/captures/<id>.json` and adds the id to `fixtures/captures/index.json`. Later design changes replay that file. They do not need another live run.

## Optional, with defaults in code

- `NEBIUS_BASE_URL`
- `MODEL_ROUTER`
- `MODEL_EXTRACT`
- `MODEL_VISION`
- `MODEL_JUDGE`
- `ACCOUNT_QUOTA`
- `IP_DAILY_CAP`
- `DEVICE_DAILY_CAP`
- `RATE_LIMIT_PER_HOUR`
- `TAVILY_DAILY_CREDIT_LIMIT`
- `DAILY_CREDIT_CAP`
- `CREDITS_PER_LIVE_CASE`
- `INVITE_CODES`
- `USAGE_DATA_FILE`
- `MAX_STEPS`
- `MAX_TAVILY_CREDITS`
- `MAX_WALL_SECONDS`
- `REPORT_RETENTION_DAYS`
- `MAX_TOKENS`
- `MAX_SCREENSHOTS`
- `MAX_PAGES`
- `SCREENSHOT_WORKER_URL`
- `SCREENSHOT_SHARED_SECRET`
- `NEXT_PUBLIC_WORLD_MODE`
- `NEXT_PUBLIC_API_BASE`

Unset names use the defaults in code, except the two required spend caps. For an allowlisted email while live mode is on, `OWNER_DAILY_LIVE_CAP` replaces `ACCOUNT_QUOTA`, `IP_DAILY_CAP`, `DEVICE_DAILY_CAP`, `RATE_LIMIT_PER_HOUR`, and the shared pool. `SPEND_HARD_LIMIT_USD`, `TAVILY_CREDIT_HARD_LIMIT`, and `TAVILY_DAILY_CREDIT_LIMIT` still apply. Reports and the masked audit row are held for `REPORT_RETENTION_DAYS`. Captures are kept. The agent finishes inside the route limit.

## What is done

- Intake refuses account and card numbers, redacts emails, key-shaped tokens, and national-id shapes, and blocks private, metadata, and credentialled URLs before a fetch.
- A hosted live check is Google session, then the allowlist and the kill switch, then the bot-check cookie. An allowlisted owner then reserves only their own day. A hosted visitor reserves the account allowance, the shared pool, the network, the device, and the hour. The judge account and bring-your-own-key checks skip the allowance and pool but still reserve the network, the device, and the hour. A later refusal rolls the earlier holds back, including the owner’s day. `SPEND_HARD_LIMIT_USD`, `TAVILY_CREDIT_HARD_LIMIT`, and `TAVILY_DAILY_CREDIT_LIMIT` run for the owner before that reservation.
- Signed-out visitors and everyone off the allowlist receive a recorded preview. They are not asked to sign in before that preview plays.
- The shared pool, when it is full, plays a recording for a hosted visitor. An allowlisted owner does not use that pool. An account that has used its allowance is refused when it is not on the owner path. Recorded cases stay open.
- Research and the model run server-side. A visitor’s pair stays in `sessionStorage` (`ss_byok_research`, `ss_byok_model`), is sent only with that request, skips the hosted allowance and the shared pool, and is scrubbed from errors and from the stored capture. It does not skip the allowlist, the kill switch, the owner’s daily cap, or the hard spend stop. Those calls reserve on the same ledger.
- Hosted and bring-your-own research and model cost are reserved in one Upstash operation before the call. The reserve checks `SPEND_HARD_LIMIT_USD`, `TAVILY_CREDIT_HARD_LIMIT`, and `TAVILY_DAILY_CREDIT_LIMIT`. At the lifetime or monthly limit the next live check is a recording and the owner sees “Live paused: spend limit reached”. At the daily limit the owner sees “Daily search budget reached” and the check is a recording. No provider is called. If the ledger is missing or cannot be read, the recording reason is the unreadable ledger, not the spend limit.
- Flags stay only when their evidence is in the case. The memo is rewritten into advisory language. The live result renders on the same sheet as the recorded How it works case: gauge, cited signals, sources, memo. A promoted capture plays through that same sheet from the stored events.
- The audit row stores a redacted subject. A phone keeps its last two digits. Keys are not in the row. A finished owner run is stored as a capture: case file, sources, timings, and the model trace.
- A provider timeout or a thrown run ends as an error on that sheet. Recorded examples still play. Tests use mocked fetch only.

## What is still outside this repo

- The required values above are not stored here. Someone has to create the Google OAuth client, the Turnstile widget, and the Tavily and Nebius keys, then set the names on the Vercel project.
- Caps and captures across more than one server need the Upstash pair. The spend ledger needs that pair even on one server. Without it, each instance counts usage on its own, plus the signed account cookie, live checks stay paused, and a capture should be downloaded before that instance goes away.
- Snapshots stay off until `SCREENSHOT_WORKER_URL` and `SCREENSHOT_SHARED_SECRET` are set. The check still finishes.
- Use cases stays on the current pages. That redesign is paused.
