import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import type { Db } from "../db/client";
import { account, session, user, verification } from "../db/schema";

export type Auth = ReturnType<typeof createAuth>;

// Better Auth instance, built per request over the request-scoped Drizzle
// client (Hyperdrive connection). Replaces ASP.NET Core Identity:
//
// - Email/password with an 8-char minimum, matching the old Identity options.
// - Cookie sessions (BFF): the browser only ever holds an HttpOnly cookie; no
//   token reaches JS. Cookie prefix `comerico` → `comerico.session_token`.
// - `householdId` / `role` are additional fields on the user, read per-request
//   into the session — so household changes are visible immediately, without
//   the RefreshSignInAsync re-issue dance the .NET backend needed.
export function createAuth(db: Db, env: Env) {
  // Cast: wrangler types the var as its literal config value ("development").
  const isProd = (env.ENVIRONMENT as string) === "production";
  return betterAuth({
    baseURL: env.AUTH_BASE_URL,
    basePath: "/api/auth",
    secret: env.BETTER_AUTH_SECRET,
    database: drizzleAdapter(db, {
      provider: "pg",
      schema: { user, session, account, verification },
    }),
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 8,
      autoSignIn: true,
    },
    user: {
      // Managed by the app (household create/join, promotion), never by the
      // client, so `input: false`.
      additionalFields: {
        householdId: { type: "string", required: false, input: false },
        role: { type: "string", required: false, defaultValue: "Member", input: false },
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 14, // 14 days (matches the old cookie lifetime)
      updateAge: 60 * 60 * 24, // sliding: refresh once a day
    },
    advanced: {
      cookiePrefix: "comerico",
      useSecureCookies: isProd,
    },
    trustedOrigins: env.AUTH_BASE_URL ? [env.AUTH_BASE_URL] : [],
  });
}
