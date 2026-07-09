import { createRoute } from "@hono/zod-openapi";
import { and, eq, gte, isNotNull } from "drizzle-orm";
import type { Context } from "hono";
import { householdId, requireHousehold } from "../auth/session";
import type { AppEnv } from "../context";
import { tenantDb, type TenantDb } from "../db/tenant";
import { uuidv7 } from "../db/uuid";
import type { RouletteStatusValue } from "../domain/enums";
import { BusinessError } from "../http/errors";
import { broadcastRouletteSpun } from "../realtime/broadcast";
import { createApp, errors, jsonResponse } from "../openapi/factory";
import {
  RouletteHistoryList,
  RouletteHistoryQuery,
  SpinRouletteResult as SpinRouletteResultSchema,
  type RouletteSession,
} from "../openapi/schemas";

// Internal result carries a Date; the HTTP route and the WebSocket broadcast
// both serialize it to an ISO string on the wire.
export interface SpinRouletteResult {
  sessionId: string;
  householdId: string;
  winnerDishId: string;
  winnerDishName: string;
  spunAt: Date;
}

const RECENT_WINNER_DAYS = 3;

const tenantFor = (c: Context<AppEnv>): TenantDb => tenantDb(c.get("db"), householdId(c));

export async function spin(tenant: TenantDb): Promise<SpinRouletteResult> {
  const active = await tenant.dishes.findMany(eq(tenant.dishes.table.isActive, true));
  if (active.length === 0) throw new BusinessError("No hay platillos activos para girar la ruleta.");

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

export const rouletteRoutes = createApp();
rouletteRoutes.use("/api/roulette/*", requireHousehold);

rouletteRoutes.openapi(
  createRoute({
    method: "post",
    path: "/api/roulette/spin",
    tags: ["Roulette"],
    operationId: "SpinRoulette",
    summary: "Gira la ruleta y retorna el platillo ganador",
    responses: {
      200: jsonResponse(SpinRouletteResultSchema, "Resultado del giro"),
      400: errors.badRequest,
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const result = await spin(tenant);
    await broadcastRouletteSpun(c.env, result.householdId, result);
    return c.json({ ...result, spunAt: result.spunAt.toISOString() }, 200);
  },
);

rouletteRoutes.openapi(
  createRoute({
    method: "get",
    path: "/api/roulette/history",
    tags: ["Roulette"],
    operationId: "GetRouletteHistory",
    summary: "Obtiene el historial de giros de la ruleta",
    request: { query: RouletteHistoryQuery },
    responses: {
      200: jsonResponse(RouletteHistoryList, "Historial"),
      401: errors.unauthorized,
      403: errors.forbidden,
    },
  }),
  async (c) => {
    const tenant = tenantFor(c);
    const q = c.req.valid("query");
    const page = Math.max(1, q.page ?? 1);
    const pageSize = q.pageSize && q.pageSize > 0 ? q.pageSize : 20;
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

    const dtos: RouletteSession[] = rows.map((r) => ({
      id: r.id,
      householdId: r.householdId,
      status: r.status,
      winnerDishId: r.winnerDishId,
      winnerDishName: r.winnerDish?.name ?? null,
      createdAt: r.createdAt.toISOString(),
      spunAt: r.spunAt ? r.spunAt.toISOString() : null,
    }));
    return c.json(dtos, 200);
  },
);
