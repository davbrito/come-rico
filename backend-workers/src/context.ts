import type { Auth } from "./auth/auth";
import type { Db } from "./db/client";
import type { HouseholdRoleValue } from "./db/schema";

/** The authenticated user, resolved per-request from the session cookie. */
export interface SessionUser {
  id: string;
  email: string;
  name: string;
  householdId: string | null;
  role: HouseholdRoleValue;
}

/** Hono generics shared across the app: bindings + per-request variables. */
export interface AppEnv {
  Bindings: Env;
  Variables: {
    db: Db;
    auth: Auth;
    user: SessionUser | null;
  };
}
