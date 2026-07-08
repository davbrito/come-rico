import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Db } from "../src/db/client";
import { households } from "../src/db/schema";
import { tenantDb, type TenantDb } from "../src/db/tenant";
import { uuidv7 } from "../src/db/uuid";

// The acceptance gate for the rewrite: with EF Core's global query filters
// gone, these assertions prove the TenantDb handle confines every read and
// write to one household on a real SQL engine (embedded PGlite).

const HOUSEHOLD_A = "aaaaaaaa-aaaa-7aaa-8aaa-aaaaaaaaaaaa";
const HOUSEHOLD_B = "bbbbbbbb-bbbb-7bbb-8bbb-bbbbbbbbbbbb";

let db: Db;
let close: () => Promise<void>;
let a: TenantDb;
let b: TenantDb;

beforeAll(async () => {
  ({ db, close } = await createTestDbForSuite());
  for (const [id, name] of [
    [HOUSEHOLD_A, "Casa A"],
    [HOUSEHOLD_B, "Casa B"],
  ] as const) {
    await db.insert(households).values({ id, name, inviteCode: name.replace(/\s/g, ""), createdAt: new Date() });
  }
  a = tenantDb(db, HOUSEHOLD_A);
  b = tenantDb(db, HOUSEHOLD_B);
});

afterAll(async () => {
  await close();
});

async function createTestDbForSuite() {
  const { createTestDb } = await import("./helpers/pglite-db");
  return createTestDb();
}

function newDish(name: string) {
  return { id: uuidv7(), name, description: null, imageKey: null, isActive: true, createdAt: new Date() };
}

describe("tenant isolation (two households)", () => {
  it("stamps the household id on insert (callers can't set it)", async () => {
    const dish = await a.dishes.insertOne(newDish("Arroz"));
    expect(dish.householdId).toBe(HOUSEHOLD_A);
  });

  it("does not read another household's rows", async () => {
    await a.dishes.insertOne(newDish("Frijoles"));
    const seenByB = await b.dishes.findMany();
    expect(seenByB).toHaveLength(0);

    const seenByA = await a.dishes.findMany();
    expect(seenByA.length).toBeGreaterThan(0);
    expect(seenByA.every((d) => d.householdId === HOUSEHOLD_A)).toBe(true);
  });

  it("cannot findFirst another household's row by id", async () => {
    const dish = await a.dishes.insertOne(newDish("Sopa"));
    expect(await b.dishes.findFirst(eq(b.dishes.table.id, dish.id))).toBeUndefined();
    expect(await a.dishes.findFirst(eq(a.dishes.table.id, dish.id))).toBeDefined();
  });

  it("cannot update another household's row", async () => {
    const dish = await a.dishes.insertOne(newDish("Pan"));
    const updated = await b.dishes.update({ name: "Hackeado" }, eq(b.dishes.table.id, dish.id));
    expect(updated).toHaveLength(0);

    const reloaded = await a.dishes.findFirst(eq(a.dishes.table.id, dish.id));
    expect(reloaded?.name).toBe("Pan");
  });

  it("cannot delete another household's row", async () => {
    const dish = await a.dishes.insertOne(newDish("Torta"));
    const deleted = await b.dishes.delete(eq(b.dishes.table.id, dish.id));
    expect(deleted).toHaveLength(0);
    expect(await a.dishes.findFirst(eq(a.dishes.table.id, dish.id))).toBeDefined();
  });

  it("isolates other tenant-scoped tables too (tags, shopping items)", async () => {
    await a.tags.insertOne({ id: uuidv7(), name: "vegano", createdAt: new Date() });
    await a.shoppingItems.insertOne({ id: uuidv7(), name: "Leche", createdAt: new Date() });

    expect(await b.tags.findMany()).toHaveLength(0);
    expect(await b.shoppingItems.findMany()).toHaveLength(0);
    expect((await a.tags.findMany()).length).toBeGreaterThan(0);
    expect((await a.shoppingItems.findMany()).length).toBeGreaterThan(0);
  });
});
