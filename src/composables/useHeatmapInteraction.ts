import { ref, type Ref } from 'vue'
import type { HeatmapCell } from '@/domain/heatmap'

// イベントは領域に委譲する。選択時に全セルの属性/イベントを再生成しない。
export function useHeatmapInteraction(
  cells: Ref<readonly HeatmapCell[]>,
  select: (cell: HeatmapCell) => void,
  layout: 'weeks' | 'month',
) {
  const root = ref<HTMLElement | null>(null)

  function targetCell(event: Event): Element | null {
    return event.target instanceof Element ? event.target.closest('[data-cell-index]') : null
  }

  function show(event: Event) {
    const target = targetCell(event)
    const cell = cells.value[Number(target?.getAttribute('data-cell-index') ?? -1)]
    if (!target || !cell) return
    if (event.type !== 'mouseover') {
      root.value?.querySelector('[tabindex="0"][data-cell-index]')?.setAttribute('tabindex', '-1')
      target.setAttribute('tabindex', '0')
    }
    select(cell)
  }

  function keydown(event: KeyboardEvent) {
    const target = targetCell(event)
    if (!target) return
    const current = Number(target.getAttribute('data-cell-index'))
    const horizontal = layout === 'weeks' ? 7 : 1
    const vertical = layout === 'weeks' ? 1 : 7
    const steps: Record<string, number> = {
      ArrowLeft: -horizontal,
      ArrowRight: horizontal,
      ArrowUp: -vertical,
      ArrowDown: vertical,
      Home: -current,
      End: cells.value.length - 1 - current,
    }
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault()
      show(event)
      return
    }
    const delta = steps[event.key]
    if (delta === undefined) return
    event.preventDefault()
    const next = Math.max(0, Math.min(cells.value.length - 1, current + delta))
    const element = root.value?.querySelector<HTMLElement | SVGElement>(
      `[data-cell-index="${next}"]`,
    )
    element?.focus()
  }

  return { root, show, keydown }
}
