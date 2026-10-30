import type { AgentEvent } from "@/lib/types";

export function createEventPump(onEvent: (event: AgentEvent) => void) {
  const queue: AgentEvent[] = [];
  let timer: ReturnType<typeof setTimeout> | null = null;
  let replay = false;
  let stopped = false;

  const kick = () => {
    if (stopped || timer || queue.length === 0) return;
    const event = queue.shift();
    if (!event) return;
    onEvent(event);
    if (!queue.length) return;
    const wait = queue.length > 8 ? 160 : queue.length > 4 ? 340 : 700;
    timer = setTimeout(() => {
      timer = null;
      kick();
    }, wait);
  };

  return {
    push(event: AgentEvent) {
      if (stopped) return;
      if (event.type === "mode.replay") replay = true;
      if (!replay) {
        onEvent(event);
        return;
      }
      queue.push(event);
      kick();
    },
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      queue.length = 0;
    },
  };
}

/** The next event must sort after every frame already sent, including a failure frame. */
export function nextEventSeq(emitted: number): number {
  const count = Number.isFinite(emitted) && emitted > 0 ? Math.floor(emitted) : 0;
  return count + 1;
}

export async function readSse(response: Response, onEvent: (event: AgentEvent) => void): Promise<void> {
  if (!response.body) return;
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) {
      buffer += decoder.decode();
      deliverFrames(buffer, onEvent, true);
      break;
    }
    buffer += decoder.decode(value, { stream: true });
    buffer = deliverFrames(buffer, onEvent, false);
  }
}

function deliverFrames(buffer: string, onEvent: (event: AgentEvent) => void, flushTail: boolean): string {
  const chunks = buffer.split("\n\n");
  const tail = chunks.pop() ?? "";
  for (const chunk of chunks) deliverFrame(chunk, onEvent);
  if (flushTail && tail.trim()) deliverFrame(tail, onEvent);
  return flushTail ? "" : tail;
}

function deliverFrame(chunk: string, onEvent: (event: AgentEvent) => void): void {
  const line = chunk.split("\n").find((item) => item.startsWith("data:"));
  if (!line) return;
  const data = line.slice(5).trim();
  if (!data || data === "[DONE]") return;
  onEvent(JSON.parse(data) as AgentEvent);
}
