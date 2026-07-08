import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Db } from "../../src/db/client";
import * as schema from "../../src/db/schema";

const MIGRATIONS_DIR = join(process.cwd(), "drizzle");

// Spin up an in-memory PGlite Postgres with the schema applied by running the
// generated drizzle migrations. Returns a drizzle client typed as the app's Db
// (PGlite and postgres-js share the query-builder surface the app uses).
export async function createTestDb(): Promise<{ db: Db; close: () => Promise<void> }> {
  const client = new PGlite();
  await client.waitReady;

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort();
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    for (const statement of sql.split("--> statement-breakpoint")) {
      const trimmed = statement.trim();
      if (trimmed) await client.exec(trimmed);
    }
  }

  const db = drizzle(client, { schema, casing: "snake_case" }) as unknown as Db;
  return { db, close: () => client.close() };
}
