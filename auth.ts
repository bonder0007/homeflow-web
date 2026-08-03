import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

function allowedEmails() {
  return new Set(
    (process.env.ALLOWED_EMAILS ?? "")
      .split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  trustHost: true,
  pages: {
    signIn: "/login",
    error: "/login",
  },
  callbacks: {
    async signIn({ user, profile }) {
      const email = String(profile?.email ?? user.email ?? "").toLowerCase();
      return Boolean(email) && allowedEmails().has(email);
    },
    async session({ session }) {
      if (session.user?.email) session.user.email = session.user.email.toLowerCase();
      return session;
    },
  },
});

export async function requireHomeflowUser() {
  const session = await auth();
  const email = session?.user?.email?.toLowerCase();
  if (!email || !allowedEmails().has(email)) return null;
  return { email, name: session?.user?.name ?? email };
}
