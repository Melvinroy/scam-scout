export interface ClientSession {
  user: { name?: string | null; email?: string | null; image?: string | null } | null;
  googleAuthConfigured?: boolean;
}

export async function fetchClientSession(): Promise<ClientSession> {
  for (let attempt = 0; ; attempt += 1) {
    try {
      // One deadline covers the request and reading its body, so a stalled lookup reaches the retry path.
      const signal = AbortSignal.timeout(8_000);
      const response = await fetch("/api/session", { signal });
      if (!response.ok) throw new Error("Session unavailable");
      return await response.json() as ClientSession;
    } catch (error) {
      if (attempt === 1) throw error;
    }
  }
}
