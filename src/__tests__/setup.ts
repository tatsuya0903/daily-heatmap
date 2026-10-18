import { afterEach, vi } from 'vitest'
import { enableAutoUnmount } from '@vue/test-utils'

enableAutoUnmount(afterEach)

vi.stubGlobal(
  'ResizeObserver',
  class {
    observe = vi.fn<ResizeObserver['observe']>()
    unobserve = vi.fn<ResizeObserver['unobserve']>()
    disconnect = vi.fn<ResizeObserver['disconnect']>()
  },
)

vi.stubGlobal('matchMedia', (query: string): MediaQueryList => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn<MediaQueryList['addListener']>(),
  removeListener: vi.fn<MediaQueryList['removeListener']>(),
  addEventListener: vi.fn<MediaQueryList['addEventListener']>(),
  removeEventListener: vi.fn<MediaQueryList['removeEventListener']>(),
  dispatchEvent: vi.fn<MediaQueryList['dispatchEvent']>(() => true),
}))

vi.stubGlobal('scrollTo', vi.fn<typeof window.scrollTo>())
