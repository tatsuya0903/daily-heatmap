import { onScopeDispose } from 'vue'

const properties = [
  'position',
  'top',
  'left',
  'width',
  'height',
  'overflow-y',
  'padding-inline-end',
  'scroll-behavior',
] as const

/** VDialogのscroll-strategy。固定座標を子孫へ継承させず、背景スクロールを止める。 */
export function blockShareScroll() {
  const root = document.documentElement
  const style = root.style
  // DOMの読み取りをすべて書き込み前に済ませる。
  const x = window.scrollX
  const y = window.scrollY
  const scrollbarWidth = Math.max(0, window.innerWidth - root.clientWidth)
  const padding = Number.parseFloat(getComputedStyle(root).paddingInlineEnd) || 0
  const previous = properties.map((property) => ({
    property,
    value: style.getPropertyValue(property),
    priority: style.getPropertyPriority(property),
  }))
  const next = {
    position: 'fixed',
    top: `${-y}px`,
    left: `${-x}px`,
    width: '100%',
    height: '100%',
    'overflow-y': 'hidden',
    'padding-inline-end': `${padding + scrollbarWidth}px`,
  }
  for (const [property, value] of Object.entries(next)) style.setProperty(property, value)

  onScopeDispose(() => {
    const restore = (entry: (typeof previous)[number]) => {
      if (entry.value) style.setProperty(entry.property, entry.value, entry.priority)
      else style.removeProperty(entry.property)
    }
    for (const entry of previous) {
      if (entry.property !== 'scroll-behavior') restore(entry)
    }
    // smoothが設定されていても、閉鎖時は元の位置へ即座に戻す。
    style.setProperty('scroll-behavior', 'auto', 'important')
    window.scrollTo(x, y)
    restore(previous.find((entry) => entry.property === 'scroll-behavior')!)
  })
}
