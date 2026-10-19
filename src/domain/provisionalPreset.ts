import type { ExactSeries } from './series'
import type { ClassifiedDay } from './heatmap'

// SPEC 4.4の固定プリセットID 1。正式な初期設定（分位点）はIssue #5で実装。
export const PROVISIONAL_BOUNDARIES = [50, 100, 300, 500, 700, 1000] as const
export const LEVEL_COLORS = [
  '#ebedf0',
  '#e6f5e8',
  '#c6e8cc',
  '#9bd5a7',
  '#6cbf82',
  '#40a362',
  '#227a46',
  '#10572e',
] as const

export const PROVISIONAL_LEGEND = LEVEL_COLORS.map((color, level) => {
  const lower = level === 1 ? 1 : PROVISIONAL_BOUNDARIES[level - 2]
  const upper = PROVISIONAL_BOUNDARIES[level - 1]
  const rangeLabel =
    level === 0
      ? '0件'
      : upper === undefined
        ? `${lower!.toLocaleString('ja-JP')}件以上`
        : `${lower!.toLocaleString('ja-JP')}〜${(upper - 1).toLocaleString('ja-JP')}件`
  return { level, color, rangeLabel }
})

export function classifyWithProvisionalPreset(source: ExactSeries): ClassifiedDay[] {
  return source.counts.map((exactCount) => {
    const level =
      exactCount === 0 ? 0 : 1 + PROVISIONAL_BOUNDARIES.filter((b) => exactCount >= b).length
    return { ...PROVISIONAL_LEGEND[level]!, exactCount }
  })
}
