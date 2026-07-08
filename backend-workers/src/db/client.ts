import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

export type Db = ReturnType<typeof createDb>;

// Builds a Drizzle client over the Hyperdrive-pooled Postgres connection.
//
// Workers are short-lived and may run many concurrent requests, so we keep the
// per-isolate pool small and disable prepared statements / type fetching —
// Hyperdrive does the real pooling upstream, and prepared statements don't
// survive its connection multiplexing.
export function createDb(hyperdrive: Hyperdrive) {
  const sql = postgres(hyperdrive.connectionString, {
    max: 5,
    fetch_types: false,
    prepare: false,
  });
  return drizzle(sql, { schema, casing: "snake_case" });
}

export { schema };
