import { openingReplayInput } from "@/lib/client/demo-guard";
import { auth } from "@/auth";
import { runtimeEnv } from "@/lib/config";
import { DemoConsole } from "@/components/demo/DemoConsole";
import { getReplay, hasReplay, presetMeta } from "@/lib/replay/cache";
import { isLiveOwner } from "@/lib/safety/live-access";
import { evaluateSpend, SPEND_PAUSE_COPY } from "@/lib/safety/spend";

export const dynamic = "force-dynamic";

export default async function DemoPage({ searchParams }: { searchParams: Promise<{ case?: string; q?: string }> }) {
  const params = await searchParams;
  const presets = presetMeta().map((preset) => ({
    id: preset.id,
    label: preset.label,
    blurb: preset.blurb,
    input: preset.input,
    expected: preset.expected,
  }));
  const requested = typeof params.case === "string" ? params.case : "";
  const known = presets.some((preset) => preset.id === requested) || (requested ? await hasReplay(requested) : false);
  // Without a requested case the page opens empty, so nothing looks like a check the visitor ran.
  const initialId = known ? requested : "";
  const initialQuery = typeof params.q === "string" ? params.q : "";
  const session = await auth();
  const liveOwner = isLiveOwner(session?.user?.email, runtimeEnv(), session?.user?.role);
  const spend = liveOwner ? await evaluateSpend() : null;
  const spendNote = spend && !spend.open ? SPEND_PAUSE_COPY : null;
  const presetInput = presets.find((preset) => preset.id === initialId)?.input;
  const recordedInput = known && !initialQuery && !liveOwner && !presetInput ? (await getReplay(initialId))?.input : undefined;
  const initialInput = initialQuery || (known ? openingReplayInput(liveOwner, recordedInput, presetInput) : "");
  return (
    <DemoConsole
      // A new case or query remounts the console, so its input and selection start fresh.
      key={JSON.stringify([initialId, params.q ?? null])}
      presets={presets}
      initialId={initialId}
      openingReplay={known && params.q === undefined}
      initialInput={initialInput}
      availabilityMessage={spendNote || (liveOwner ? null : "Live checks are temporarily unavailable.")}
    />
  );
}
