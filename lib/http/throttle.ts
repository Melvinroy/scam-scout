import { clientIp } from "@/lib/http/cookies";
import { readyUsageStore } from "@/lib/abuse/store";

const HOUR = 3_600_000;

/**
 * Hourly request slots for each subject (an account id, a network address). Returns a 429 once any
 * subject has used its slots this hour, before the route does storage or third-party work.
 */
export async function throttleHourly(scope: string, subjects: string[], perHour: number): Promise<Response | null> {
  const window = new Date().toISOString().slice(0, 13);
  try {
    const store = await readyUsageStore();
    for (const subject of subjects) {
      if (!(await store.reserveCount(`${scope}:${subject}:${window}`, HOUR, perHour)).ok) {
        return Response.json({ ok: false, error: "Live checks are temporarily unavailable. Try again later." }, { status: 429, headers: { "retry-after": "3600" } });
      }
    }
  } catch {
    // Unreadable counters refuse the request rather than letting it through unthrottled.
    return Response.json({ ok: false, error: "This is temporarily unavailable. Try again later." }, { status: 503, headers: { "retry-after": "60" } });
  }
  return null;
}

/** Read-only public traffic: generous enough for shared networks and prefetches, still a hard ceiling. */
export const PUBLIC_READS_PER_HOUR = 1_000;
export const PUBLIC_PAGES_PER_HOUR = 3_000;

export function throttleIp(request: Request, scope: string, perHour = PUBLIC_READS_PER_HOUR): Promise<Response | null> {
  return throttleHourly(scope, [`ip:${clientIp(request)}`], perHour);
}
