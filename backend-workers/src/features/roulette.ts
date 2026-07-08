import { and, eq, gte, isNotNull } from "drizzle-orm";
import { Hono, type Context } from "hono";
import { householdId, requireHousehold } from "../auth/session";
import type { AppEnv } from "../context";
import { tenantDb, type TenantDb } from "../db/tenant";
import { uuidv7 } from "../db/uuid";
import type { RouletteStatusValue } from "../domain/enums";
import { broadcastRouletteSpun } from "../realtime/broadcast";
import { BusinessError } from "../http/errors";

export interface SpinRouletteResult {
  sessionId: string;
  householdId: string;
  winnerDishId: string;
  winnerDishName: string;
  spunAt: Date;
}

interface RouletteSessionDto {
  id: string;
  householdId: string;
  status: RouletteStatusValue;
  winnerDishId: string | null;
  winnerDishName: string | null;
  createdAt: Date;
  spunAt: Date | null;
}

const RECENT_WINNER_DAYS = 3;

const tenantFor = (c: Context<AppEnv>): TenantDb => tenantDb(c.get("db"), householdId(c));

export async function spin(tenant: TenantDb): Promise<SpinRouletteResult> {
  const active = await tenant.dishes.findMany(eq(tenant.dishes.table.isActive, true));
  if (active.length === 0) {
    throw new BusinessError("No hay platillos activos para girar la ruleta.");
  }

  // Exclude dishes that won in the last 3 days, unless that leaves nothing.
  const cutoff = new Date(Date.now() - RECENT_WINNER_DAYS * 24 * 60 * 60 * 1000);
  const recent = await tenant.rouletteSessions.findMany(
    and(
      eq(tenant.rouletteSessions.table.status, "Completed"),
      gte(tenant.rouletteSessions.table.spunAt, cutoff),
      isNotNull(tenant.rouletteSessions.table.winnerDishId),
    ),
  );
  const recentWinnerIds = new Set(recent.map((s) => s.winnerDishId).filter((id): id is string => id !== null));

  let candidates = active.filter((d) => !recentWinnerIds.has(d.id));
  if (candidates.length === 0) candidates = active;

  const winner = candidates[Math.floor(Math.random() * candidates.length)]!;
  const now = new Date();
  const session = await tenant.rouletteSessions.insertOne({
    id: uuidv7(),
    status: "Completed",
    winnerDishId: winner.id,
    createdAt: now,
    spunAt: now,
  });

  return {
    sessionId: session.id,
    householdId: tenant.households,
    winnerDishId: winner.id,
    winnerDishName: winner.name,
    spunAt: session.spunAt!,
  };
}

export const rouletteRoutes = new Hono<AppEnv>();
rouletteRoutes.use("/api/roulette/*", requireHousehold);

rouletteRoutes.post("/api/roulette/spin", async (c) => {
  const tenant = tenantFor(c);
  const result = await spin(tenant);
  // Notify connected household members in real time (Durable Object).
  await broadcastRouletteSpun(c.env, result.householdId, result);
  return c.json(result);
});

rouletteRoutes.get("/api/roulette/history", async (c) => {
  const tenant = tenantFor(c);
  const page = Math.max(1, Number(c.req.query("page")) || 1);
  const rawSize = Number(c.req.query("pageSize"));
  const pageSize = rawSize > 0 ? rawSize : 20;
  const offset = (page - 1) * pageSize;

  const rows = (await tenant.join((db, hid) =>
    db.query.rouletteSessions.findMany({
      where: (r, { eq: e }) => e(r.householdId, hid),
      with: { winnerDish: true },
      orderBy: (r, { desc }) => desc(r.createdAt),
      limit: pageSize,
      offset,
    }),
  )) as {
    id: string;
    householdId: string;
    status: RouletteStatusValue;
    winnerDishId: string | null;
    createdAt: Date;
    spunAt: Date | null;
    winnerDish: { name: string } | null;
  }[];

  const dtos: RouletteSessionDto[] = rows.map((r) => ({
    id: r.id,
    householdId: r.householdId,
    status: r.status,
    winnerDishId: r.winnerDishId,
    winnerDishName: r.winnerDish?.name ?? null,
    createdAt: r.createdAt,
    spunAt: r.spunAt,
  }));
  return c.json(dtos);
});
