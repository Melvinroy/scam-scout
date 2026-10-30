/** Google sign-ins need a verified email, since owner access is keyed on the email. Other providers pass. */
export function allowSignIn(account: { provider?: string } | null | undefined, profile: { email_verified?: unknown } | null | undefined): boolean {
  if (account?.provider !== "google") return true;
  return profile?.email_verified === true;
}
