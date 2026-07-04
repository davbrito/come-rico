import {
  HubConnection,
  HubConnectionBuilder,
  HubConnectionState,
  LogLevel,
} from '@microsoft/signalr'
import type { SpinRouletteResult } from './api'

let connection: HubConnection | null = null

export const getRouletteConnection = (): HubConnection => {
  if (!connection) {
    // Same-origin connection: the auth cookie rides along automatically and the
    // backend joins the socket to the household group based on its claims.
    connection = new HubConnectionBuilder()
      .withUrl('/hubs/roulette')
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build()
  }
  return connection
}

export const startRouletteConnection = async (): Promise<void> => {
  const conn = getRouletteConnection()
  if (conn.state === HubConnectionState.Disconnected) {
    await conn.start()
  }
}

export const stopRouletteConnection = async (): Promise<void> => {
  const conn = getRouletteConnection()
  if (conn.state === HubConnectionState.Connected) {
    await conn.stop()
  }
}

export const onRouletteSpun = (callback: (result: SpinRouletteResult) => void): (() => void) => {
  const conn = getRouletteConnection()
  conn.on('RouletteSpun', callback)
  return () => conn.off('RouletteSpun', callback)
}
