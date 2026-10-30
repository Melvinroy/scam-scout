/** Every POST here takes a few short fields; 16 KiB is far above any honest request. */
export const MAX_JSON_BODY_BYTES = 16 * 1024;

/**
 * Reads a JSON object without buffering more than the limit. Over the limit returns null
 * (the caller answers 413); malformed JSON returns {} so the usual field checks reply.
 */
export async function readJsonBody(request: Request, maxBytes = MAX_JSON_BODY_BYTES): Promise<Record<string, unknown> | null> {
  if (Number(request.headers.get("content-length") ?? 0) > maxBytes) return null;
  const reader = request.body?.getReader();
  if (!reader) return {};
  const chunks: Uint8Array[] = [];
  let size = 0;
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.byteLength;
    if (size > maxBytes) {
      await reader.cancel();
      return null;
    }
    chunks.push(chunk.value);
  }
  try {
    const parsed: unknown = JSON.parse(Buffer.concat(chunks).toString("utf8"));
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export function bodyTooLarge(): Response {
  return Response.json({ error: "Request body is too large." }, { status: 413 });
}
