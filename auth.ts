import NextAuth from "next-auth";
import { allowSignIn } from "@/lib/auth/google";
import Credentials from "next-auth/providers/credentials";
import Google from "next-auth/providers/google";
import { readyUsageStore } from "@/lib/abuse/store";
import { verifyJudge } from "@/lib/auth/judge";
import { clientIp } from "@/lib/http/cookies";
import { requireAuthSecret } from "@/lib/safety/auth-secret";

const googleId = process.env.AUTH_GOOGLE_ID || process.env.GOOGLE_CLIENT_ID || "";
const googleSecret = process.env.AUTH_GOOGLE_SECRET || process.env.GOOGLE_CLIENT_SECRET || "";

export const googleAuthConfigured = Boolean(googleId && googleSecret);

export const { handlers, auth, signIn, signOut } = NextAuth({
  secret: requireAuthSecret(),
  trustHost: true,
  session: { strategy: "jwt" },
  pages: { signIn: "/sign-in" },
  providers: [
    Google({
      clientId: googleId || "not-configured",
      clientSecret: googleSecret || "not-configured",
    }),
    Credentials({
      id: "account",
      name: "Account",
      credentials: { username: {}, password: {} },
      authorize: async (credentials, request) => verifyJudge(credentials, clientIp(request), await readyUsageStore()),
    }),
  ],
  callbacks: {
    signIn({ account, profile }) {
      return allowSignIn(account, profile);
    },
    jwt({ token, user, profile }) {
      if (user && "role" in user && typeof user.role === "string") token.role = user.role;
      if (user?.email) token.email = user.email;
      if (profile && typeof profile === "object" && "email" in profile && typeof profile.email === "string") {
        token.email = profile.email;
      }
      return token;
    },
    session({ session, token }) {
      if (session.user) {
        session.user.id = token.sub ?? "";
        if (typeof token.email === "string") session.user.email = token.email;
        if (typeof token.role === "string") session.user.role = token.role;
      }
      return session;
    },
  },
});
