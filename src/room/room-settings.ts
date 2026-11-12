import {useCallback, useSyncExternalStore} from 'react'

export interface RoomSettings {
  textSize: 'small' | 'medium' | 'large'
  typewriter: boolean
  focusDimming: boolean
}

export const DEFAULT_ROOM_SETTINGS: RoomSettings = {
  textSize: 'medium',
  typewriter: false,
  focusDimming: false,
}

/** One key for every Studio: storage is already per origin. */
const STORAGE_KEY = 'sanity-plugin-writing-room:settings'
const TEXT_SIZES = new Set(['small', 'medium', 'large'])

export function parseRoomSettings(raw: string | null): RoomSettings {
  try {
    const stored = raw ? (JSON.parse(raw) as Record<string, unknown>) : {}
    return {
      textSize: TEXT_SIZES.has(stored.textSize as string)
        ? (stored.textSize as RoomSettings['textSize'])
        : DEFAULT_ROOM_SETTINGS.textSize,
      typewriter:
        typeof stored.typewriter === 'boolean' ? stored.typewriter : DEFAULT_ROOM_SETTINGS.typewriter,
      focusDimming:
        typeof stored.focusDimming === 'boolean'
          ? stored.focusDimming
          : DEFAULT_ROOM_SETTINGS.focusDimming,
    }
  } catch {
    return DEFAULT_ROOM_SETTINGS
  }
}

let cached: {raw: string | null; settings: RoomSettings} | null = null
let sessionOnly: string | null = null
const listeners = new Set<() => void>()

function read(): RoomSettings {
  let raw: string | null
  try {
    raw = window.localStorage.getItem(STORAGE_KEY) ?? sessionOnly
  } catch {
    raw = sessionOnly
  }
  if (!cached || cached.raw !== raw) cached = {raw, settings: parseRoomSettings(raw)}
  return cached.settings
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

export function useRoomSettings(): [RoomSettings, (change: Partial<RoomSettings>) => void] {
  const settings = useSyncExternalStore(subscribe, read, () => DEFAULT_ROOM_SETTINGS)
  const update = useCallback((change: Partial<RoomSettings>) => {
    const next = {...read(), ...change}
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next))
    } catch {
      // Storage unavailable: keep it for this session only.
      sessionOnly = JSON.stringify(next)
    }
    listeners.forEach((listener) => listener())
  }, [])
  return [settings, update]
}
