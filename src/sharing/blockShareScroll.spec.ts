import { effectScope } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import { blockShareScroll } from './blockShareScroll'

afterEach(() => {
  document.documentElement.removeAttribute('style')
  vi.restoreAllMocks()
})

it('座標・スクロールバー幅を読み取って固定し、元の位置と重要度つきスタイルを復元する', () => {
  const root = document.documentElement
  root.style.setProperty('height', '80%', 'important')
  root.style.setProperty('padding-inline-end', '6px')
  root.style.setProperty('scroll-behavior', 'smooth')
  root.style.setProperty('color', 'green')
  vi.spyOn(window, 'scrollX', 'get').mockReturnValue(12)
  vi.spyOn(window, 'scrollY', 'get').mockReturnValue(245)
  vi.spyOn(root, 'clientWidth', 'get').mockReturnValue(window.innerWidth - 15)
  const scope = effectScope()
  scope.run(blockShareScroll)
  expect(root.style.position).toBe('fixed')
  expect(root.style.left).toBe('-12px')
  expect(root.style.top).toBe('-245px')
  expect(root.style.paddingInlineEnd).toBe('21px')
  expect(root.style.overflowY).toBe('hidden')
  expect(root.style.getPropertyValue('--v-body-scroll-y')).toBe('')
  scope.stop()
  expect(window.scrollTo).toHaveBeenLastCalledWith(12, 245)
  expect(root.style.position).toBe('')
  expect(root.style.height).toBe('80%')
  expect(root.style.getPropertyPriority('height')).toBe('important')
  expect(root.style.paddingInlineEnd).toBe('6px')
  expect(root.style.scrollBehavior).toBe('smooth')
  expect(root.style.color).toBe('green')
})

it('スクロールバーのない画面でもスタイルを残さず繰り返し開閉できる', () => {
  const root = document.documentElement
  vi.spyOn(root, 'clientWidth', 'get').mockReturnValue(window.innerWidth)
  for (let iteration = 0; iteration < 3; iteration++) {
    const scope = effectScope()
    scope.run(blockShareScroll)
    expect(root.style.paddingInlineEnd).toBe('0px')
    scope.stop()
    expect(root.style.cssText).toBe('')
  }
})
