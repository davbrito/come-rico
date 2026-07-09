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

  // Accept a WebSocket upgrade forwarded by the Worker (which already
  // authenticated the caller and resolved this household). Uses the Hibernation
  // API so idle rooms cost nothing while keeping the socket registered for
  // broadcasts.
  async fetch(request: Request): Promise<Response> {
    if (request.headers.get("upgrade") !== "websocket") {
      return new Response("expected websocket", { status: 426 });
    }
    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];
    this.ctx.acceptWebSocket(server);
    return new Response(null, { status: 101, webSocket: client });
  }

  // The roulette stream is server → client only; ignore anything a client
  // sends. Defining the handler keeps hibernation delivery wired.
  webSocketMessage(): void {}

  webSocketClose(ws: WebSocket, code: number): void {
    // 1000–4999 are valid close codes to echo back; anything else → 1011.
    try {
      ws.close(code >= 1000 && code < 5000 ? code : 1011, "closing");
    } catch {
      // already closed
    }
  }
}
