import { DurableObject } from "cloudflare:workers";
import type { RouletteEvent } from "./broadcast";

// One instance per household (addressed via `idFromName(householdId)`), holding
// the live WebSocket connections for that household's roulette room. The DO
// holds NO authoritative state — Postgres remains the source of truth, so an
// eviction loses nothing.
//
// The WebSocket upgrade handling is added in a later step; `broadcast` already
// fans out to whatever sockets are connected (none until upgrades are wired,
// so it's a safe no-op meanwhile).
export class RouletteRoom extends DurableObject<Env> {
  /** RPC: send an event to every connected member of this household room. */
  async broadcast(event: RouletteEvent): Promise<void> {
    const data = JSON.stringify(event);
    for (const ws of this.ctx.getWebSockets()) {
      try {
        ws.send(data);
      } catch {
        // Socket already closing; hibernation cleanup will drop it.
      }
    }
  }

  async fetch(_request: Request): Promise<Response> {
    return new Response("not implemented", { status: 501 });
  }
}
