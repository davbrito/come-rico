import { and, eq, getTableColumns, type SQL } from "drizzle-orm";
import type { PgColumn, PgTable, PgUpdateSetSource } from "drizzle-orm/pg-core";
import type { Db } from "./client";
import * as schema from "./schema";

// ---------------------------------------------------------------------------
// Tenant-scoped database handle.
//
// This is the safety centerpiece of the rewrite. The .NET backend got
// automatic household isolation from EF Core global query filters; there is no
// equivalent in Drizzle, so isolation is enforced here instead: feature code
// receives ONLY a `TenantDb`, whose per-table repositories always inject
// `household_id = <current household>` on select/update/delete and stamp it on
// insert. The raw client is reserved for auth, household membership, and the
// cron sweep (the legitimate cross-tenant paths), and an ESLint rule blocks
// importing it from features/**.
//
// The two-household contract test suite (see the test step) is the acceptance
// gate that proves no cross-tenant read/write escapes this handle.
// ---------------------------------------------------------------------------

// A table is household-scoped iff it has a `householdId` column.
type ScopedTable = PgTable & { householdId: PgColumn };

type Row<T extends ScopedTable> = T["$inferSelect"];
type Insert<T extends ScopedTable> = T["$inferInsert"];
// Callers never supply householdId — the handle stamps it.
type InsertInput<T extends ScopedTable> = Omit<Insert<T>, "householdId">;

/** Per-table repository whose every operation is confined to one household. */
export class ScopedRepository<T extends ScopedTable> {
  constructor(
    private readonly db: Db,
    readonly table: T,
    private readonly householdId: string,
  ) {}

  /** `household_id = <current>` AND any extra conditions. Always includes the tenant predicate. */
  scope(...extra: (SQL | undefined)[]): SQL {
    return and(eq(this.table.householdId, this.householdId), ...extra)!;
  }

  findMany(...where: (SQL | undefined)[]): Promise<Row<T>[]> {
    return this.db.select().from(this.table as PgTable).where(this.scope(...where)) as Promise<Row<T>[]>;
  }

  async findFirst(...where: (SQL | undefined)[]): Promise<Row<T> | undefined> {
    const rows = await this.db
      .select()
      .from(this.table as PgTable)
      .where(this.scope(...where))
      .limit(1);
    return rows[0] as Row<T> | undefined;
  }

  async insertOne(values: InsertInput<T>): Promise<Row<T>> {
    const [row] = await this.db
      .insert(this.table)
      .values({ ...values, householdId: this.householdId } as Insert<T>)
      .returning();
    return row as Row<T>;
  }

  insertMany(values: InsertInput<T>[]): Promise<Row<T>[]> {
    if (values.length === 0) return Promise.resolve([]);
    const stamped = values.map((v) => ({ ...v, householdId: this.householdId })) as Insert<T>[];
    return this.db.insert(this.table).values(stamped).returning() as Promise<Row<T>[]>;
  }

  update(set: PgUpdateSetSource<T>, ...where: (SQL | undefined)[]): Promise<Row<T>[]> {
    // Never allow reassigning householdId out of the tenant.
    const { householdId: _drop, ...safe } = set as Record<string, unknown>;
    return this.db
      .update(this.table)
      .set(safe as PgUpdateSetSource<T>)
      .where(this.scope(...where))
      .returning() as Promise<Row<T>[]>;
  }

  delete(...where: (SQL | undefined)[]): Promise<Row<T>[]> {
    return this.db.delete(this.table).where(this.scope(...where)).returning() as Promise<Row<T>[]>;
  }
}

export class TenantDb {
  readonly households: string;

  readonly dishes: ScopedRepository<typeof schema.dishes>;
  readonly ingredients: ScopedRepository<typeof schema.ingredients>;
  readonly tags: ScopedRepository<typeof schema.tags>;
  readonly mealPlans: ScopedRepository<typeof schema.mealPlans>;
  readonly shoppingItems: ScopedRepository<typeof schema.shoppingItems>;
  readonly rouletteSessions: ScopedRepository<typeof schema.rouletteSessions>;
  readonly storedFiles: ScopedRepository<typeof schema.storedFiles>;

  constructor(
    private readonly db: Db,
    householdId: string,
  ) {
    this.households = householdId;
    this.dishes = new ScopedRepository(db, schema.dishes, householdId);
    this.ingredients = new ScopedRepository(db, schema.ingredients, householdId);
    this.tags = new ScopedRepository(db, schema.tags, householdId);
    this.mealPlans = new ScopedRepository(db, schema.mealPlans, householdId);
    this.shoppingItems = new ScopedRepository(db, schema.shoppingItems, householdId);
    this.rouletteSessions = new ScopedRepository(db, schema.rouletteSessions, householdId);
    this.storedFiles = new ScopedRepository(db, schema.storedFiles, householdId);
  }

  /**
   * Controlled escape hatch for multi-table reads (e.g. shopping-list
   * consolidation joining meal_plans → dishes → ingredients). The callback
   * receives the raw client and this household's id so it can still constrain
   * every joined table by household. This is the one reviewed exception to the
   * "features never touch the raw client" rule — keep such queries here or in
   * a clearly-reviewed feature, and always filter by `householdId`.
   */
  join<R>(fn: (db: Db, householdId: string) => Promise<R>): Promise<R> {
    return fn(this.db, this.households);
  }
}

export function tenantDb(db: Db, householdId: string): TenantDb {
  return new TenantDb(db, householdId);
}

// Re-exported so the (rare) join queries can reference table columns without
// importing the schema module directly.
export { schema, getTableColumns };
