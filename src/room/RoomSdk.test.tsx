// @vitest-environment jsdom
import {type SanityInstance, SanityInstanceProvider, createSanityInstance, useSanityInstance} from '@sanity/sdk-react'
import {Activity, act} from 'react'
import {createRoot, type Root} from 'react-dom/client'
import {afterEach, beforeEach, describe, expect, it, vi} from 'vitest'
import {RoomSdkProvider} from './RoomSdk'

vi.mock('sanity', () => ({
  useWorkspace: () => ({
    name: 'default',
    projectId: 'abc12345',
    dataset: 'production',
    authenticated: true,
    auth: {},
  }),
}))

Object.assign(globalThis, {IS_REACT_ACT_ENVIRONMENT: true})

let seen: SanityInstance | undefined
function Probe() {
  seen = useSanityInstance()
  return null
}

/** Lets the MutationObserver that watches a hidden room report. */
const settle = () => act(() => new Promise<void>((resolve) => setTimeout(resolve, 0)))

describe('RoomSdkProvider', () => {
  let container: HTMLElement
  let root: Root

  beforeEach(() => {
    seen = undefined
    container = document.body.appendChild(document.createElement('div'))
    root = createRoot(container)
  })
  afterEach(() => {
    act(() => root.unmount())
    container.remove()
  })

  const room = (mode: 'visible' | 'hidden' = 'visible') => (
    <Activity mode={mode}>
      <RoomSdkProvider>
        <Probe />
      </RoomSdkProvider>
    </Activity>
  )

  it('makes an instance for the Workspace and disposes it when the room leaves', async () => {
    await act(() => root.render(room()))
    const instance = seen!
    expect(instance.config).toMatchObject({projectId: 'abc12345', dataset: 'production'})
    expect(instance.isDisposed()).toBe(false)

    await act(() => root.render(null))
    expect(instance.isDisposed()).toBe(true)
  })

  it('keeps the instance while an Activity hides the room', async () => {
    await act(() => root.render(room()))
    const instance = seen!

    await act(() => root.render(room('hidden')))
    await settle()
    expect(instance.isDisposed()).toBe(false)

    await act(() => root.render(room()))
    expect(seen).toBe(instance)
    expect(instance.isDisposed()).toBe(false)
  })

  it('disposes the instance when a hidden room is removed', async () => {
    await act(() => root.render(room()))
    const instance = seen!

    await act(() => root.render(room('hidden')))
    await act(() => root.render(null))
    await settle()
    expect(instance.isDisposed()).toBe(true)
  })

  it('reuses the Studio’s instance and leaves it alone', async () => {
    const studio = createSanityInstance({projectId: 'abc12345', dataset: 'production'})
    await act(() =>
      root.render(
        <SanityInstanceProvider instance={studio} fallback={null}>
          <RoomSdkProvider>
            <Probe />
          </RoomSdkProvider>
        </SanityInstanceProvider>,
      ),
    )
    expect(seen).toBe(studio)

    await act(() => root.render(null))
    expect(studio.isDisposed()).toBe(false)
    studio.dispose()
  })
})
