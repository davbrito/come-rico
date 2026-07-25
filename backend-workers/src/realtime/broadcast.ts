import type { SpinRouletteResult } from "../features/roulette";

// Server → client event envelope sent over the roulette WebSocket. `type`
// mirrors the SignalR method names the frontend listened for.
export type RouletteEvent =
  | { type: "RouletteSpun"; payload: SpinRouletteResult }
  | { type: "RouletteStarted"; payload: { householdId: string } };

// Fan out an event to every socket connected to a household's roulette room.
// Routing to the Durable Object is by household id (idFromName), so a spin only
// reaches that household — the client never supplies the id.
export async function broadcast(env: Env, householdId: string, event: RouletteEvent): Promise<void> {
  const stub = env.ROULETTE_ROOM.get(env.ROULETTE_ROOM.idFromName(householdId));
  await stub.broadcast(event);
}

export function broadcastRouletteSpun(env: Env, householdId: string, result: SpinRouletteResult): Promise<void> {
  return broadcast(env, householdId, { type: "RouletteSpun", payload: result });
}
