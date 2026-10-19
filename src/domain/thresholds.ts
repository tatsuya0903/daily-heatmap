import type { ClassifiedDay } from './heatmap'
import type { HeatmapDocument, Level3 } from './series'

export type ThresholdMethod = 'preset' | 'linear' | 'quantile' | 'log' | 'custom'
export type AutomaticMethod = 'linear' | 'quantile' | 'log'
export type PresetId = 0 | 1 | 2

// SPEC 4.4の公開済みID。定義はここだけに置き、配列も変更不可にする。
export const PRESETS = Object.freeze([
  Object.freeze({
    id: 0,
    name: '小規模カウント',
    boundaries: Object.freeze([2, 3, 5, 10, 20, 50]),
  }),
  Object.freeze({
    id: 1,
    name: '中規模カウント',
    boundaries: Object.freeze([50, 100, 300, 500, 700, 1000]),
  }),
  Object.freeze({
    id: 2,
    name: '大規模カウント',
    boundaries: Object.freeze([100, 500, 1000, 5000, 10000, 50000]),
  }),
] as const)

// 確定境界を保存する。復元時にはnormalizeThresholdProfileだけで検証でき、再生成は不要。
export type ThresholdProfile = Readonly<
  | { method: 'preset'; presetId: PresetId; boundaries: readonly number[] }
  | { method: AutomaticMethod | 'custom'; presetId?: never; boundaries: readonly number[] }
>
export type ThresholdSelection =
  | { method: 'preset'; presetId: PresetId }
  | { method: AutomaticMethod }
  | { method: 'custom'; boundaries: readonly number[] }

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

export function validateBoundaries(boundaries: readonly number[], custom = false): void {
  if (boundaries.length > 6 || (custom && boundaries.length !== 6)) {
    throw new Error(custom ? '境界値を6個入力してください。' : '境界値は最大6個です。')
  }
  boundaries.forEach((value, index) => {
    if (!Number.isSafeInteger(value) || value < 2) {
      throw new Error(`境界値${index + 1}は2以上9,007,199,254,740,991以下の整数にしてください。`)
    }
    if (index > 0 && value <= boundaries[index - 1]!) {
      throw new Error(`境界値${index + 1}は直前の値より大きくしてください（重複不可）。`)
    }
  })
}

export function parseCustomBoundaries(inputs: readonly string[]): number[] {
  const boundaries = inputs.map((input, index) => {
    // number inputは指数表記や入力途中の値を変換するため、文字列のまま厳密に検証する。
    if (!/^[0-9]+$/.test(input)) {
      throw new Error(
        `境界値${index + 1}を半角の10進整数で入力してください（空欄・小数・負数・指数表記は不可）。`,
      )
    }
    return Number(input)
  })
  validateBoundaries(boundaries, true)
  return boundaries
}

export function normalizeThresholdProfile(profile: ThresholdProfile): ThresholdProfile {
  validateBoundaries(profile.boundaries, profile.method === 'custom')
  if (profile.method === 'preset') {
    const preset = PRESETS.find((entry) => entry.id === profile.presetId)
    if (!preset) throw new Error('不明なプリセットIDです。')
    if (
      preset.boundaries.length !== profile.boundaries.length ||
      preset.boundaries.some((value, index) => value !== profile.boundaries[index])
    ) {
      throw new Error('プリセットIDと境界値が一致しません。')
    }
    return Object.freeze({ method: 'preset', presetId: preset.id, boundaries: preset.boundaries })
  }
  if (
    !['linear', 'quantile', 'log', 'custom'].includes(profile.method) ||
    profile.presetId !== undefined
  ) {
    throw new Error('閾値方式またはプリセットIDが不正です。')
  }
  return Object.freeze({
    method: profile.method,
    boundaries: Object.freeze([...profile.boundaries]),
  })
}

function validateCount(value: number): void {
  if (!Number.isSafeInteger(value) || value < 0)
    throw new Error('件数は0以上の安全整数にしてください。')
}

// Number単独から「整数の直上の誤差」と「正当な小数」は区別できない。
// 補正許容幅は0：表現されている値をそのまま切り上げる。
// 呼出前のNumber変換で失われた小数部分は復元できない。
export function ceilLogBoundary(value: number): number {
  return Math.ceil(value)
}

function generateLogBoundary(min: number, max: number, k: number): number {
  const logValue = Math.log1p(min) + ((Math.log1p(max) - Math.log1p(min)) * k) / 7
  const approximate = ceilLogBoundary(Math.expm1(logValue))

  // SPECの実数境界xについて
  // (x+1)^7 = (min+1)^(7-k) * (max+1)^k。
  // 最小の整数bで (b+1)^7 >= target となるものが数学的なceil(x)。
  // 元件数が安全整数なので、比較には浮動小数点誤差もepsilon補正もない。
  const target = (BigInt(min) + 1n) ** BigInt(7 - k) * (BigInt(max) + 1n) ** BigInt(k)
  let lower = BigInt(min) + 1n
  let upper = BigInt(max)
  const candidate = BigInt(Math.max(min + 1, Math.min(max, approximate)))
  if ((candidate + 1n) ** 7n >= target) {
    if (candidate ** 7n < target) return Number(candidate)
    upper = candidate - 1n
  } else {
    lower = candidate + 1n
  }
  // log1p/expm1の候補を上下の比較で検証し、ずれていた場合だけ二分探索する。
  // 巨大値でlog1p(min)とlog1p(max)が同値になっても、最大53回で確定する。
  while (lower < upper) {
    const middle = (lower + upper) / 2n
    if ((middle + 1n) ** 7n >= target) upper = middle
    else lower = middle + 1n
  }
  return Number(lower)
}

export function generateBoundaries(method: AutomaticMethod, counts: readonly number[]): number[] {
  counts.forEach(validateCount)
  const sorted = counts.filter((value) => value > 0).sort((a, b) => a - b)
  const min = sorted[0]
  const max = sorted.at(-1)
  if (min === undefined || max === undefined || min === max) return []
  const candidates: number[] = []
  for (let k = 1; k <= 6; k++) {
    if (method === 'linear') {
      // ceil(a/7) = (a+6)/7（整数除算）。幅・乗算・加算のすべてをBigIntで行う。
      const width = BigInt(max) - BigInt(min) + 1n
      candidates.push(Number(BigInt(min) + (width * BigInt(k) + 6n) / 7n))
    } else if (method === 'quantile') {
      // SPECは0-basedのsorted[ceil(n*k/7)]。1-basedへの補正（-1）は行わない。
      const candidate = sorted[Math.ceil((sorted.length * k) / 7)]
      if (candidate !== undefined) candidates.push(candidate)
    } else {
      candidates.push(generateLogBoundary(min, max, k))
    }
  }
  return [
    ...new Set(candidates.filter((b) => Number.isSafeInteger(b) && b >= 2 && b > min && b <= max)),
  ].sort((a, b) => a - b)
}

export function resolveThresholds(
  selection: ThresholdSelection,
  counts: readonly number[],
): ThresholdProfile {
  if (selection.method === 'preset') {
    const preset = PRESETS.find((entry) => entry.id === selection.presetId)
    if (!preset) throw new Error('不明なプリセットIDです。')
    return normalizeThresholdProfile({
      method: 'preset',
      presetId: preset.id,
      boundaries: preset.boundaries,
    })
  }
  return normalizeThresholdProfile({
    method: selection.method,
    boundaries:
      selection.method === 'custom'
        ? selection.boundaries
        : generateBoundaries(selection.method, counts),
  })
}

export function classifyCount(count: number, boundaries: readonly number[]): Level3 {
  validateCount(count)
  validateBoundaries(boundaries)
  return (count === 0 ? 0 : 1 + boundaries.filter((b) => count >= b).length) as Level3
}

export function createLegend(boundaries: readonly number[]): ClassifiedDay[] {
  validateBoundaries(boundaries)
  return LEVEL_COLORS.map((color, level) => {
    const lower = level === 1 ? 1 : boundaries[level - 2]
    const upper = boundaries[level - 1]
    const rangeLabel =
      level === 0
        ? '0件'
        : level > boundaries.length + 1
          ? '未使用（範囲なし）'
          : upper === undefined
            ? `${lower!.toLocaleString('ja-JP')}件以上`
            : `${lower!.toLocaleString('ja-JP')}〜${(upper - 1).toLocaleString('ja-JP')}件`
    return { level, color, rangeLabel }
  })
}

// exactのみ分類する。levelsは確定済みレベルを使い、元件数を推定しない。
export function classifyDocument(document: HeatmapDocument): ClassifiedDay[] {
  const profile = normalizeThresholdProfile(document.thresholds)
  const legend = createLegend(profile.boundaries)
  if (document.source.kind === 'exact') {
    return document.source.counts.map((exactCount) => ({
      ...legend[classifyCount(exactCount, profile.boundaries)]!,
      exactCount,
    }))
  }
  return document.source.levels.map((level) => {
    if (!Number.isInteger(level) || level < 0 || level > profile.boundaries.length + 1) {
      throw new Error('保存済みレベルが境界値の範囲外です。')
    }
    return { ...legend[level]! }
  })
}
