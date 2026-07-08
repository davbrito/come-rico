import { DurableObject } from "cloudflare:workers";

// One instance per household (addressed via `idFromName(householdId)`), holding
// the live WebSocket connections for that household's roulette room.
//
// This is a stub: the WebSocket upgrade handling and the broadcast() RPC are
// implemented in a later step. The DO holds NO authoritative state — Postgres
// remains the source of truth, so an eviction loses nothing.
export class RouletteRoom extends DurableObject<Env> {
  async fetch(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }
}
