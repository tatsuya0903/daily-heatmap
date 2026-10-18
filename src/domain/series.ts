// 元の列名やファイル名を含めず、後続の描画・共有処理に渡す。
export interface ExactSeries {
  kind: 'exact'
  startDate: string
  counts: number[]
}
