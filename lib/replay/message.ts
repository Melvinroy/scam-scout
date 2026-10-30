/** Public wording stays neutral: no caps, limits, access rules or providers. */
const REPLAY: Record<string, string> = {
  daily_cap: "Live checks are temporarily unavailable. Showing a recorded case.",
  providers_unconfigured: "Live checks are temporarily unavailable. Showing a recorded case.",
  recorded_fixture: "Recorded case.",
  live_invite_only: "Live checks are temporarily unavailable.",
  owner_daily_cap: "Live checks are temporarily unavailable. Showing a recorded case.",
  global_daily_cap: "Live checks are temporarily unavailable. Showing a recorded case.",
  spend_limit: "Live checks are temporarily unavailable. Showing a recorded case.",
  daily_credit: "Live checks are temporarily unavailable. Showing a recorded case.",
  spend_unreadable: "Live checks are temporarily unavailable. Showing a recorded case.",
};

/** Only approved copy may cross the public boundary. */
export function replayMessage(reason: unknown, message?: unknown): string | undefined {
  if (typeof reason === "string" && Object.hasOwn(REPLAY, reason)) return REPLAY[reason];
  return typeof message === "string" && Object.values(REPLAY).includes(message) ? message : undefined;
}
