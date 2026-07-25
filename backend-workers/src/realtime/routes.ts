import { Hono } from "hono";
import type { AppEnv } from "../context";

// Real-time roulette WebSocket. The Worker authenticates the upgrade from the
// session cookie and resolves the household id itself (never from the client),
// then forwards the socket to that household's RouletteRoom Durable Object —
// the same "join the household group from the validated claim" rule the SignalR
// hub enforced.
export const hubRoutes = new Hono<AppEnv>();

hubRoutes.get("/hubs/roulette", (c) => {
  if (c.req.header("upgrade") !== "websocket") {
    return c.text("Se esperaba una conexión WebSocket.", 426);
  }
  const user = c.get("user");
  if (!user) return c.json({ message: "No autenticado." }, 401);
  if (!user.householdId) return c.json({ message: "No perteneces a ningún hogar." }, 403);

  const stub = c.env.ROULETTE_ROOM.get(c.env.ROULETTE_ROOM.idFromName(user.householdId));
  return stub.fetch(c.req.raw);
});
