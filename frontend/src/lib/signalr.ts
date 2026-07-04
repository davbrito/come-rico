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
    connection = new HubConnectionBuilder()
      .withUrl('/hubs/roulette')
      .withAutomaticReconnect()
      .configureLogging(LogLevel.Information)
      .build()
  }
  return connection
}

export const startRouletteConnection = async (householdId: string): Promise<void> => {
  const conn = getRouletteConnection()
  if (conn.state === HubConnectionState.Disconnected) {
    await conn.start()
  }
  await conn.invoke('JoinHouseholdGroup', householdId)
}

export const stopRouletteConnection = async (householdId: string): Promise<void> => {
  const conn = getRouletteConnection()
  if (conn.state === HubConnectionState.Connected) {
    await conn.invoke('LeaveHouseholdGroup', householdId)
  }
}

export const onRouletteSpun = (callback: (result: SpinRouletteResult) => void): (() => void) => {
  const conn = getRouletteConnection()
  conn.on('RouletteSpun', callback)
  return () => conn.off('RouletteSpun', callback)
}
