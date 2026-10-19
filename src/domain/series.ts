import type { ThresholdProfile } from './thresholds'

export type Level3 = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7

// 元の列名やファイル名を含めず、後続の描画・共有処理に渡す。
export interface ExactSeries {
  kind: 'exact'
  startDate: string
  counts: number[]
}

export interface LevelSeries {
  kind: 'levels'
  startDate: string
  levels: Level3[]
}

export type HeatmapSource = ExactSeries | LevelSeries
export interface HeatmapDocument {
  source: HeatmapSource
  thresholds: ThresholdProfile
}
