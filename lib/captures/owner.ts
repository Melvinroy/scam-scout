import { auth } from "@/auth";
import { isAllowlistedEmail } from "@/lib/safety/live-access";

/** Captures desk. Allowlisted email, even while the live switch is off. */
export async function allowlistedEmail(): Promise<string | null> {
  const session = await auth();
  const email = session?.user?.email;
  if (!email || !isAllowlistedEmail(email)) return null;
  return email.trim().toLowerCase();
}
