import { relations } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  numeric,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";
import {
  HOUSEHOLD_ROLES,
  MEAL_TYPES,
  MEASUREMENT_UNITS,
  ROULETTE_STATUSES,
  STORED_FILE_STATUSES,
} from "../domain/enums";

// ---------------------------------------------------------------------------
// Enums (values defined in src/domain/enums.ts — the single source of truth).
// ---------------------------------------------------------------------------

export const householdRole = pgEnum("household_role", HOUSEHOLD_ROLES);
export const mealType = pgEnum("meal_type", MEAL_TYPES);
export const measurementUnit = pgEnum("measurement_unit", MEASUREMENT_UNITS);
export const rouletteStatus = pgEnum("roulette_status", ROULETTE_STATUSES);
export const storedFileStatus = pgEnum("stored_file_status", STORED_FILE_STATUSES);

// ---------------------------------------------------------------------------
// Better Auth tables
//
// Shapes follow Better Auth's default Drizzle schema (table/column names it
// expects). `households`-related columns (`household_id`, `role`) are the
// project's additional fields on the user, read per-request into the session
// context — replacing the ASP.NET Identity claims (`household_id`,
// `household_role`, `display_name`). Better Auth's `name` serves as the
// display name.
// ---------------------------------------------------------------------------

export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  // Project additions:
  householdId: uuid("household_id").references(() => households.id, { onDelete: "set null" }),
  role: householdRole("role").notNull().default("Member"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at").notNull(),
  token: text("token").notNull().unique(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at"),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at"),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at").notNull(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ---------------------------------------------------------------------------
// Domain tables
//
// uuid PKs are generated app-side (uuid v7, preserving the time-ordered keys
// the .NET backend produced via `Guid.CreateVersion7`) — no DB default.
// Timestamps are `timestamptz` (the app writes UTC), matching Npgsql's mapping.
// Household-scoped tables carry `household_id`; the tenant-scoped DB handle
// (see src/db/tenant.ts) enforces isolation, replacing EF global query filters.
// ---------------------------------------------------------------------------

const tz = { withTimezone: true } as const;

export const households = pgTable("households", {
  id: uuid("id").primaryKey(),
  name: varchar("name", { length: 200 }).notNull(),
  inviteCode: varchar("invite_code", { length: 20 }).notNull().unique(),
  createdAt: timestamp("created_at", tz).notNull(),
});

export const dishes = pgTable(
  "dishes",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    description: varchar("description", { length: 1000 }),
    imageKey: varchar("image_key", { length: 2048 }),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at", tz).notNull(),
  },
  (t) => [index("ix_dishes_household").on(t.householdId)],
);

export const ingredients = pgTable(
  "ingredients",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id").notNull(),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }).notNull(),
    unit: measurementUnit("unit").notNull(),
  },
  (t) => [index("ix_ingredients_dish").on(t.dishId)],
);

export const tags = pgTable(
  "tags",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 50 }).notNull(),
    createdAt: timestamp("created_at", tz).notNull(),
  },
  // Tag names are unique per household (case handling lives in the feature
  // layer, matching the original behavior).
  (t) => [uniqueIndex("ux_tags_household_name").on(t.householdId, t.name)],
);

// Implicit many-to-many join (the .NET model's "DishTags" table).
export const dishTags = pgTable(
  "dish_tags",
  {
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    tagId: uuid("tag_id")
      .notNull()
      .references(() => tags.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.dishId, t.tagId] })],
);

export const rouletteSessions = pgTable(
  "roulette_sessions",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    status: rouletteStatus("status").notNull().default("Pending"),
    // Restrict delete (a dish that won a session can't be hard-deleted); the
    // domain soft-deactivates dishes anyway.
    winnerDishId: uuid("winner_dish_id").references(() => dishes.id, { onDelete: "restrict" }),
    createdAt: timestamp("created_at", tz).notNull(),
    spunAt: timestamp("spun_at", tz),
  },
  (t) => [index("ix_roulette_household").on(t.householdId)],
);

export const mealPlans = pgTable(
  "meal_plans",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    dishId: uuid("dish_id")
      .notNull()
      .references(() => dishes.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    mealType: mealType("meal_type").notNull(),
    createdAt: timestamp("created_at", tz).notNull(),
  },
  (t) => [index("ix_meal_plans_household_date").on(t.householdId, t.date)],
);

export const shoppingItems = pgTable(
  "shopping_items",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 200 }).notNull(),
    amount: numeric("amount", { precision: 10, scale: 2 }),
    unit: measurementUnit("unit"),
    isPurchased: boolean("is_purchased").notNull().default(false),
    isAutoGenerated: boolean("is_auto_generated").notNull().default(false),
    // Monday of the week an auto item was consolidated for; null for manual
    // items (regeneration replaces only auto items for a given week).
    generatedForWeekStart: date("generated_for_week_start", { mode: "string" }),
    createdAt: timestamp("created_at", tz).notNull(),
  },
  (t) => [index("ix_shopping_household_week").on(t.householdId, t.generatedForWeekStart)],
);

export const storedFiles = pgTable(
  "stored_files",
  {
    id: uuid("id").primaryKey(),
    householdId: uuid("household_id")
      .notNull()
      .references(() => households.id, { onDelete: "cascade" }),
    key: varchar("key", { length: 512 }).notNull(),
    contentType: varchar("content_type", { length: 100 }).notNull(),
    status: storedFileStatus("status").notNull().default("Pending"),
    createdAt: timestamp("created_at", tz).notNull(),
  },
  (t) => [
    index("ix_stored_files_household_key").on(t.householdId, t.key),
    // Drives the GC sweep (status + age).
    index("ix_stored_files_status_created").on(t.status, t.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// Relations (for Drizzle's relational query API)
// ---------------------------------------------------------------------------

export const householdsRelations = relations(households, ({ many }) => ({
  members: many(user),
  dishes: many(dishes),
  tags: many(tags),
  mealPlans: many(mealPlans),
  shoppingItems: many(shoppingItems),
  rouletteSessions: many(rouletteSessions),
}));

export const userRelations = relations(user, ({ one }) => ({
  household: one(households, { fields: [user.householdId], references: [households.id] }),
}));

export const dishesRelations = relations(dishes, ({ one, many }) => ({
  household: one(households, { fields: [dishes.householdId], references: [households.id] }),
  ingredients: many(ingredients),
  dishTags: many(dishTags),
}));

export const ingredientsRelations = relations(ingredients, ({ one }) => ({
  dish: one(dishes, { fields: [ingredients.dishId], references: [dishes.id] }),
}));

export const tagsRelations = relations(tags, ({ one, many }) => ({
  household: one(households, { fields: [tags.householdId], references: [households.id] }),
  dishTags: many(dishTags),
}));

export const dishTagsRelations = relations(dishTags, ({ one }) => ({
  dish: one(dishes, { fields: [dishTags.dishId], references: [dishes.id] }),
  tag: one(tags, { fields: [dishTags.tagId], references: [tags.id] }),
}));

export const mealPlansRelations = relations(mealPlans, ({ one }) => ({
  household: one(households, { fields: [mealPlans.householdId], references: [households.id] }),
  dish: one(dishes, { fields: [mealPlans.dishId], references: [dishes.id] }),
}));

export const rouletteSessionsRelations = relations(rouletteSessions, ({ one }) => ({
  household: one(households, { fields: [rouletteSessions.householdId], references: [households.id] }),
  winnerDish: one(dishes, { fields: [rouletteSessions.winnerDishId], references: [dishes.id] }),
}));

// ---------------------------------------------------------------------------
// Inferred row types
// ---------------------------------------------------------------------------

export type Household = typeof households.$inferSelect;
export type Dish = typeof dishes.$inferSelect;
export type Ingredient = typeof ingredients.$inferSelect;
export type Tag = typeof tags.$inferSelect;
export type MealPlan = typeof mealPlans.$inferSelect;
export type ShoppingItem = typeof shoppingItems.$inferSelect;
export type RouletteSession = typeof rouletteSessions.$inferSelect;
export type StoredFile = typeof storedFiles.$inferSelect;
export type User = typeof user.$inferSelect;

export type MealTypeValue = (typeof mealType.enumValues)[number];
export type MeasurementUnitValue = (typeof measurementUnit.enumValues)[number];
export type RouletteStatusValue = (typeof rouletteStatus.enumValues)[number];
export type StoredFileStatusValue = (typeof storedFileStatus.enumValues)[number];
export type HouseholdRoleValue = (typeof householdRole.enumValues)[number];
