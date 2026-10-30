import { runtimeEnv } from "@/lib/config";

/** No baked-in secret. The process fails when this is missing. */
export function requireAuthSecret(env: NodeJS.ProcessEnv = runtimeEnv()): string {
  const secret = env["AUTH_SECRET"]?.trim();
  if (!secret) throw new Error("AUTH_SECRET is required.");
  return secret;
}
