import {describe, expect, it} from 'vitest'
import {DEFAULT_ROOM_SETTINGS, parseRoomSettings} from './room-settings'

describe('parseRoomSettings', () => {
  it('falls back to the defaults when nothing is stored or storage is broken', () => {
    expect(parseRoomSettings(null)).toEqual(DEFAULT_ROOM_SETTINGS)
    expect(parseRoomSettings('{not json')).toEqual(DEFAULT_ROOM_SETTINGS)
  })

  it('keeps valid stored choices and ignores anything unexpected', () => {
    expect(parseRoomSettings(JSON.stringify({textSize: 'large', typewriter: true, focusDimming: 'yes', extra: 1}))).toEqual({
      ...DEFAULT_ROOM_SETTINGS,
      textSize: 'large',
      typewriter: true,
    })
  })
})
