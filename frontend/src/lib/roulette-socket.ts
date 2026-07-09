import type { SpinRouletteResult } from "#/api";

// Plain-WebSocket replacement for the former SignalR client. Same-origin
// connection: the auth cookie rides along automatically and the backend joins
// the socket to the household room from its session (never a client-passed id).
// Exposes the same start/stop/onRouletteSpun API the roulette route already
// uses, so the swap is a one-line import change there.

type SpunListener = (result: SpinRouletteResult) => void;

const listeners = new Set<SpunListener>();
let socket: WebSocket | null = null;
let shouldConnect = false;
let reconnectDelay = 1000;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

const MAX_RECONNECT_DELAY = 30_000;

function socketUrl(): string {
  const protocol = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${protocol}//${window.location.host}/hubs/roulette`;
}

function connect(): void {
  if (socket && (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING)) {
    return;
  }
  socket = new WebSocket(socketUrl());

  socket.addEventListener("open", () => {
    reconnectDelay = 1000;
  });

  socket.addEventListener("message", (event) => {
    try {
      const parsed = JSON.parse(event.data as string) as { type: string; payload: unknown };
      if (parsed.type === "RouletteSpun") {
        const result = parsed.payload as SpinRouletteResult;
        listeners.forEach((listener) => listener(result));
      }
    } catch {
      // Ignore malformed frames.
    }
  });

  socket.addEventListener("close", () => {
    socket = null;
    if (shouldConnect) scheduleReconnect();
  });

  socket.addEventListener("error", () => {
    socket?.close();
  });
}

function scheduleReconnect(): void {
  if (reconnectTimer) return;
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    if (shouldConnect) connect();
  }, reconnectDelay);
  reconnectDelay = Math.min(reconnectDelay * 2, MAX_RECONNECT_DELAY);
}

export const startRouletteConnection = async (): Promise<void> => {
  shouldConnect = true;
  connect();
};

export const stopRouletteConnection = async (): Promise<void> => {
  shouldConnect = false;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  socket?.close();
  socket = null;
};

export const onRouletteSpun = (callback: SpunListener): (() => void) => {
  listeners.add(callback);
  return () => {
    listeners.delete(callback);
  };
};
