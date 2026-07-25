import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { Db } from "../src/db/client";
import { households } from "../src/db/schema";
import { tenantDb, type TenantDb } from "../src/db/tenant";
import { uuidv7 } from "../src/db/uuid";
import { spin } from "../src/features/roulette";
import { createTestDb } from "./helpers/pglite-db";

// DB-backed test of the roulette domain rule: exclude dishes that won in the
// last 3 days, unless that would leave nothing to pick.

const HID = "cccccccc-cccc-7ccc-8ccc-cccccccccccc";

let db: Db;
let close: () => Promise<void>;
let t: TenantDb;

beforeEach(async () => {
  ({ db, close } = await createTestDb());
  await db.insert(households).values({ id: HID, name: "Casa", inviteCode: "CASA", createdAt: new Date() });
  t = tenantDb(db, HID);
});

afterEach(async () => {
  await close();
});

function dish(name: string) {
  return { id: uuidv7(), name, description: null, imageKey: null, isActive: true, createdAt: new Date() };
}

describe("roulette 3-day rule", () => {
  it("throws when there are no active dishes", async () => {
    await expect(spin(t)).rejects.toThrow("No hay platillos activos");
  });

  it("excludes a dish that won within the last 3 days", async () => {
    const recent = await t.dishes.insertOne(dish("Reciente"));
    const other = await t.dishes.insertOne(dish("Otro"));
    // Record a win for `recent` one day ago.
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    await t.rouletteSessions.insertOne({
      id: uuidv7(),
      status: "Completed",
      winnerDishId: recent.id,
      createdAt: yesterday,
      spunAt: yesterday,
    });

    // With `recent` excluded, `other` is the only candidate, so the pick is
    // deterministic. (A second spin would make `other` a recent winner too, so
    // we assert on the first spin only.)
    const result = await spin(t);
    expect(result.winnerDishId).toBe(other.id);
  });

  it("falls back to a recent winner when it is the only active dish", async () => {
    const only = await t.dishes.insertOne(dish("Único"));
    const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000);
    await t.rouletteSessions.insertOne({
      id: uuidv7(),
      status: "Completed",
      winnerDishId: only.id,
      createdAt: twoDaysAgo,
      spunAt: twoDaysAgo,
    });

    const result = await spin(t);
    expect(result.winnerDishId).toBe(only.id);
  });

  it("allows a winner from more than 3 days ago", async () => {
    const old = await t.dishes.insertOne(dish("Viejo"));
    const fourDaysAgo = new Date(Date.now() - 4 * 24 * 60 * 60 * 1000);
    await t.rouletteSessions.insertOne({
      id: uuidv7(),
      status: "Completed",
      winnerDishId: old.id,
      createdAt: fourDaysAgo,
      spunAt: fourDaysAgo,
    });

    const result = await spin(t);
    expect(result.winnerDishId).toBe(old.id);
  });
});
