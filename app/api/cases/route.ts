import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { randomUUID } from "node:crypto";
import { auth } from "@/auth";
import { authorizeLive } from "@/lib/abuse/gate";
import { readyUsageStore } from "@/lib/abuse/store";
import { runInvestigation } from "@/lib/agent/machine";
import { hostedSecrets, mentionsKey, parseByok, redactJson } from "@/lib/byok";
import { recordAudit, saveFinishedCase } from "@/lib/case/persist";
import { caseFailedFrame, sseFrame } from "@/lib/case/sse";
import { nextEventSeq } from "@/lib/client/pump";
import { nebiusUsdForRun, tavilyCreditsForRun } from "@/lib/captures/credits";
import { isSafeCaptureId } from "@/lib/captures/files";
import type { CaptureRecord } from "@/lib/captures/types";
import { validateIntake } from "@/lib/safety/redact";
import { liveGateFields, ownerSubjectToSpendStop } from "@/lib/safety/live-access";
import { evaluateSpend } from "@/lib/safety/spend";
import { liveKeysConfigured, quotaDefaults, runtimeEnv } from "@/lib/config";
import { rejectCrossSite } from "@/lib/http/origin";
import { throttleHourly } from "@/lib/http/throttle";
import { bodyTooLarge, readJsonBody } from "@/lib/http/body";
import { clientIp, cookieSecure, readHumanCookie, readUsageCookie, usageCookieValue } from "@/lib/http/cookies";
import { fixtureDeps, liveDeps, unknownDeps } from "@/lib/providers/runtime";
import { getReplay } from "@/lib/replay/cache";
import { matchFixture } from "@/fixtures/cases";
import type { AgentDeps } from "@/lib/agent/machine";
import type { AgentEvent, CaseReport } from "@/lib/types";

export const dynamic = "force-dynamic";
/** Hobby cap. The agent deadline is 50s so case.done still emits inside this limit. */
export const maxDuration = 60;
const CASE_REQUESTS_PER_HOUR = 120;

export async function POST(request: Request) {
  const refused = rejectCrossSite(request);
  if (refused) return refused;
  // Replays are public, so every request takes a network slot before any storage lookup.
  const throttled = await throttleHourly("cases", [`ip:${clientIp(request)}`], CASE_REQUESTS_PER_HOUR);
  if (throttled) return throttled;
  const body = (await readJsonBody(request)) as {
    input?: unknown;
    context?: unknown;
    live?: boolean;
    replayId?: string;
    researchKey?: unknown;
    modelKey?: unknown;
  } | null;
  if (!body) return bodyTooLarge();
  const byok = parseByok(body);
  const userKeys = byok.kind === "ready" ? [byok.researchKey, byok.modelKey] : [];
  const secrets = hostedSecrets(runtimeEnv(), userKeys);

  if (!body.live && body.replayId) {
    const replay = await getReplay(body.replayId);
    if (!replay) return NextResponse.json({ error: "Unknown replay." }, { status: 404 });
    return sse(replay.events);
  }

  if (body.live && byok.kind === "incomplete") {
    return NextResponse.json(
      { error: "Add both a research key and a model key." },
      { status: 400 },
    );
  }

  const intake = validateIntake(typeof body.input === "string" ? body.input : "", typeof body.context === "string" ? body.context : undefined);
  if (!intake.ok) return NextResponse.json({ error: intake.error }, { status: 400 });
  if (mentionsKey(`${intake.raw} ${intake.context ?? ""}`, userKeys)) {
    return NextResponse.json({ error: "Remove the key from what you are checking." }, { status: 400 });
  }

  if (!body.live) {
    const fixture = matchFixture(intake.raw);
    if (!fixture) return NextResponse.json({ error: "Pick a recorded case, or sign in to run a live check." }, { status: 400 });
    return sse((await getReplay(fixture.id))?.events ?? []);
  }

  const session = await auth();
  const jar = await cookies();
  const human = readHumanCookie(jar.get("ss_human")?.value, session?.user?.id);
  const deviceCookie = jar.get("ss_device")?.value;
  const deviceId = deviceCookie || randomUUID();
  const store = await readyUsageStore();
  const usingByok = byok.kind === "ready";
  const owner = liveGateFields(session?.user?.email, runtimeEnv(), session?.user?.role);
  const spend = ownerSubjectToSpendStop(owner.liveModeEnabled, owner.allowlisted) ? await evaluateSpend() : null;
  const decision = spend && !spend.open
    ? { ok: true as const, status: 200, mode: "replay" as const, reason: spend.reason ?? "spend_unreadable" }
    : await authorizeLive({
    userId: session?.user?.id,
    human,
    keysConfigured: usingByok || liveKeysConfigured(),
    byok: usingByok,
    ip: clientIp(request),
    deviceId,
    userAgent: request.headers.get("user-agent") ?? "",
    cookieUsed: session?.user?.id ? readUsageCookie(jar.get("ss_usage")?.value, session.user.id) : undefined,
    store,
    limits: quotaDefaults(),
    ...owner,
  });

  if (!decision.ok) {
    return NextResponse.json(
      { error: "unavailable" },
      { status: decision.status, headers: decision.retryAfter ? { "Retry-After": String(decision.retryAfter) } : undefined },
    );
  }

  const replayReason = decision.mode === "replay" ? decision.reason : undefined;
  let deps: AgentDeps;
  let mode: "live" | "replay" = decision.mode === "live" ? "live" : "replay";
  if (mode === "live" && usingByok) deps = liveDeps(process.env, { researchKey: byok.researchKey, modelKey: byok.modelKey });
  else if (mode === "live") deps = liveDeps();
  else {
    const fixture = matchFixture(intake.raw);
    deps = fixture ? fixtureDeps(fixture) : unknownDeps(intake.raw);
    mode = "replay";
  }

  const caseId = mode === "replay" ? matchFixture(intake.raw)?.id : undefined;
  const response = sseFromGenerator(
    runInvestigation({
      raw: intake.raw,
      context: intake.context,
      mode,
      replayReason,
      caseId,
      deps,
    }),
    store,
    secrets,
    {
      raw: intake.raw,
      context: intake.context ?? "",
      mode,
      capture: decision.mode === "live",
      ownerEmail: owner.email,
    },
  );
  if (!deviceCookie) {
    response.cookies.set("ss_device", deviceId, { httpOnly: true, sameSite: "lax", secure: cookieSecure(request), path: "/", maxAge: 60 * 60 * 24 * 365 });
  }
  if (session?.user?.id && decision.mode === "live" && decision.reason !== "byok" && decision.used !== undefined) {
    const signed = usageCookieValue(session.user.id, decision.used);
    if (signed) {
      response.cookies.set("ss_usage", signed, { httpOnly: true, sameSite: "lax", secure: cookieSecure(request), path: "/", maxAge: 60 * 60 * 24 * 365 });
    }
  }
  return response;
}

function sse(events: AgentEvent[]) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    start(controller) {
      for (const event of events) controller.enqueue(encoder.encode(sseFrame(event, [])));
      controller.close();
    },
  });
  return new NextResponse(stream, { headers: sseHeaders() });
}

function sseFromGenerator(
  generator: AsyncGenerator<AgentEvent, unknown, void>,
  store: Awaited<ReturnType<typeof readyUsageStore>>,
  secrets: string[],
  audit: { raw: string; context: string; mode: string; capture: boolean; ownerEmail?: string },
) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const events: AgentEvent[] = [];
      try {
        let step = await generator.next();
        while (!step.done) {
          events.push(step.value);
          controller.enqueue(encoder.encode(sseFrame(step.value, secrets)));
          step = await generator.next();
        }
        if (step.value && typeof step.value === "object" && "case_id" in step.value) {
          const report = step.value as CaseReport;
          await saveFinishedCase(store, report, secrets, audit);
          if (audit.capture && audit.ownerEmail && report.mode === "live") {
            await emitCapture(controller, encoder, store, secrets, events, report, audit);
          }
        }
        controller.close();
      } catch (error) {
        await recordAudit(store, secrets, {
          ts: new Date().toISOString(),
          caseId: "error",
          mode: audit.mode,
          verdict: "failed",
          subject: audit.raw,
        });
        controller.enqueue(
          encoder.encode(
            caseFailedFrame(error, nextEventSeq(events.length), secrets),
          ),
        );
        controller.close();
      }
    },
  });
  return new NextResponse(stream, { headers: sseHeaders() });
}

async function emitCapture(
  controller: ReadableStreamDefaultController<Uint8Array>,
  encoder: TextEncoder,
  store: Awaited<ReturnType<typeof readyUsageStore>>,
  secrets: string[],
  events: AgentEvent[],
  report: CaseReport,
  audit: { raw: string; context: string; ownerEmail?: string },
) {
  const id = isSafeCaptureId(report.case_id) ? report.case_id : `cs_${Date.now().toString(36)}`;
  const capture: CaptureRecord = {
    id,
    createdAt: new Date().toISOString(),
    ownerEmail: (audit.ownerEmail ?? "").toLowerCase(),
    input: audit.raw,
    context: audit.context,
    mode: "live",
    report: { ...report, case_id: id },
    events,
    tavilyCredits: tavilyCreditsForRun(events, report),
    nebiusUsd: nebiusUsdForRun(report),
    promoted: false,
  };
  const cleaned = redactJson(capture, secrets);
  try {
    await store.saveCapture(cleaned);
  } catch {
    // The download event still carries the capture when the store is down.
  }
  const saved: AgentEvent = {
    case_id: id,
    seq: events.length + 1,
    ts: cleaned.createdAt,
    type: "capture.saved",
    payload: { capture: JSON.parse(JSON.stringify(cleaned)) as Record<string, unknown> },
  };
  controller.enqueue(encoder.encode(sseFrame(saved, secrets)));
}

function sseHeaders(): HeadersInit {
  return {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-cache, no-transform",
    Connection: "keep-alive",
  };
}
