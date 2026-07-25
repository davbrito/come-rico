import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { describe, expect, it } from "vitest";
import { schema, tenantDb } from "../src/db/tenant";

// Builds a Drizzle client that is never actually connected — `.toSQL()` renders
// the query without executing, so we can assert the tenant predicate is present.
const client = postgres("postgres://user:pass@localhost:5432/db", { max: 1 });
const db = drizzle(client, { schema, casing: "snake_case" });

const HID = "11111111-1111-7111-8111-111111111111";

describe("tenant scope", () => {
  const t = tenantDb(db, HID);

  it("injects household_id into a select", () => {
    const { sql, params } = db
      .select()
      .from(schema.dishes)
      .where(t.dishes.scope())
      .toSQL();
    expect(sql).toContain('"dishes"."household_id" =');
    expect(params).toContain(HID);
  });

  it("combines the tenant predicate with extra conditions via AND", () => {
    const { sql, params } = db
      .select()
      .from(schema.dishes)
      .where(t.dishes.scope(eq(schema.dishes.isActive, true)))
      .toSQL();
    expect(sql).toContain('"dishes"."household_id" =');
    expect(sql).toContain('"dishes"."is_active" =');
    expect(sql.toLowerCase()).toContain(" and ");
    expect(params).toContain(HID);
  });

  it("scopes update and delete to the household", () => {
    const upd = db.update(schema.tags).set({ name: "x" }).where(t.tags.scope()).toSQL();
    expect(upd.sql).toContain('"household_id" =');
    expect(upd.params).toContain(HID);

    const del = db.delete(schema.mealPlans).where(t.mealPlans.scope()).toSQL();
    expect(del.sql).toContain('"household_id" =');
    expect(del.params).toContain(HID);
  });

  it("exposes the household id it was constructed with", () => {
    expect(t.households).toBe(HID);
  });
});
