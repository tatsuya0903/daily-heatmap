import { describe, expect, it } from 'vitest'
import {
  PRESETS,
  LEVEL_COLORS,
  ceilLogBoundary,
  classifyCount,
  classifyDocument,
  createLegend,
  generateBoundaries,
  normalizeThresholdProfile,
  parseCustomBoundaries,
  resolveThresholds,
  validateBoundaries,
  type AutomaticMethod,
  type ThresholdProfile,
} from './thresholds'

const max = Number.MAX_SAFE_INTEGER
const automaticMethods: AutomaticMethod[] = ['linear', 'quantile', 'log']

describe('固定定義とプロファイル', () => {
  it.each([
    { id: 0 as const, boundaries: [2, 3, 5, 10, 20, 50] },
    { id: 1 as const, boundaries: [50, 100, 300, 500, 700, 1000] },
    { id: 2 as const, boundaries: [100, 500, 1000, 5000, 10000, 50000] },
  ])('ID $idの全境界の直前・一致・直後とラベル', ({ id, boundaries }) => {
    const profile = resolveThresholds({ method: 'preset', presetId: id }, [0, 0])
    expect(profile).toEqual({ method: 'preset', presetId: id, boundaries })
    expect(profile.boundaries).toHaveLength(6)
    expect(classifyCount(0, boundaries)).toBe(0)
    expect(classifyCount(1, boundaries)).toBe(1)
    const legend = createLegend(boundaries)
    boundaries.forEach((b, index) => {
      expect(classifyCount(b - 1, boundaries)).toBe(index + 1)
      expect(classifyCount(b, boundaries)).toBe(index + 2)
      // ID0には隣接境界があるため、直後が次の境界と一致する場合も含む。
      expect(classifyCount(b + 1, boundaries)).toBe(1 + boundaries.filter((v) => b + 1 >= v).length)
      const lower = index === 0 ? 1 : boundaries[index - 1]!
      expect(legend[index + 1]?.rangeLabel).toBe(
        `${lower.toLocaleString('ja-JP')}〜${(b - 1).toLocaleString('ja-JP')}件`,
      )
    })
    expect(classifyCount(max, boundaries)).toBe(7)
    expect(legend[7]?.rangeLabel).toBe(`${boundaries[5]!.toLocaleString('ja-JP')}件以上`)
    expect(Object.isFrozen(profile)).toBe(true)
    expect(Object.isFrozen(profile.boundaries)).toBe(true)
    expect(Object.isFrozen(PRESETS[id].boundaries)).toBe(true)
  })

  it('任意の境界をプリセットIDに結び付けず、不明IDや非プリセットのIDも拒否する', () => {
    const malformed = [
      { method: 'preset', presetId: 0, boundaries: PRESETS[1].boundaries },
      { method: 'preset', presetId: 9, boundaries: PRESETS[0].boundaries },
      { method: 'preset', boundaries: PRESETS[0].boundaries },
      { method: 'quantile', presetId: 0, boundaries: [] },
      { method: 'unknown', boundaries: [] },
    ]
    malformed.forEach((profile) =>
      expect(() => normalizeThresholdProfile(profile as ThresholdProfile)).toThrow(
        /プリセットID|閾値方式/,
      ),
    )
  })

  it('確定境界のコピーを保ち、アルゴリズムの再生成をせず再利用できる', () => {
    const boundaries = [3, 7]
    const profile = normalizeThresholdProfile({ method: 'quantile', boundaries })
    boundaries[0] = 99
    const source = { kind: 'exact' as const, startDate: '2026-01-01', counts: [0, 2, 3, 6, 7, max] }
    const classified = classifyDocument({ source, thresholds: profile })
    expect(classified.map((entry) => entry.level)).toEqual([0, 1, 2, 2, 3, 3])
    expect(classified.map((entry) => entry.exactCount)).toEqual(source.counts)
    const restored = normalizeThresholdProfile(JSON.parse(JSON.stringify(profile)))
    expect(classifyDocument({ source, thresholds: restored })).toEqual(classified)
    expect(profile.boundaries).toEqual([3, 7])
  })
})

describe.each(automaticMethods)('%sの共通境界条件', (method) => {
  it.each([[], [0, 0], [1], [0, 8, 8, 0], [max, 0, max]])('%jの境界は空', (...counts) => {
    expect(generateBoundaries(method, counts)).toEqual([])
  })

  it('0を分布から除き、同じ件数を分割せず、入力順に依存しない', () => {
    const counts = [1, 1, 2, 2, 3, 3, 3, 15, 1000, max]
    const boundaries = generateBoundaries(method, counts)
    expect(generateBoundaries(method, [0, ...counts, 0, 0])).toEqual(boundaries)
    expect(generateBoundaries(method, [...counts].reverse())).toEqual(boundaries)
    expect(generateBoundaries(method, counts)).toEqual(boundaries)
    expect(() => validateBoundaries(boundaries)).not.toThrow()
    const levels = counts.map((n) => classifyCount(n, boundaries))
    expect(levels[0]).toBe(levels[1])
    expect(levels[2]).toBe(levels[3])
    expect(levels[4]).toBe(levels[6])
    expect(levels).toEqual([...levels].sort((a, b) => a - b))
  })

  it.each([
    [1, 2],
    [max - 10, max],
    [1, 2, 3, max],
  ])('少数ユニーク値・巨大安全整数・外れ値 %j', (...counts) => {
    const boundaries = generateBoundaries(method, counts)
    expect(boundaries.length).toBeLessThanOrEqual(6)
    expect(new Set(boundaries).size).toBe(boundaries.length)
    expect(() => validateBoundaries(boundaries)).not.toThrow()
    boundaries.forEach((b) => {
      expect(b).toBeGreaterThan(Math.min(...counts))
      expect(b).toBeLessThanOrEqual(Math.max(...counts))
    })
    expect(classifyCount(0, boundaries)).toBe(0)
    expect(classifyCount(max, boundaries)).toBeLessThanOrEqual(7)
  })

  it.each([-1, 1.5, max + 1, NaN, Infinity])('不正件数 %s を拒否する', (count) => {
    expect(() => generateBoundaries(method, [1, count])).toThrow(
      '件数は0以上の安全整数にしてください。',
    )
    expect(() => classifyCount(count, [])).toThrow('件数は0以上の安全整数にしてください。')
  })
})

describe('生成アルゴリズムの固定例', () => {
  it('Linearの切り上げ・max超過除去・重複除去', () => {
    expect(generateBoundaries('linear', [1, 14])).toEqual([3, 5, 7, 9, 11, 13])
    expect(generateBoundaries('linear', [1, 8])).toEqual([3, 4, 5, 6, 7, 8])
    expect(generateBoundaries('linear', [1, 2])).toEqual([2])
    expect(generateBoundaries('linear', [5, 6, 7])).toEqual([6, 7])
  })

  it('Linearの幅と乗算を最大安全整数でも正確に計算する', () => {
    expect(generateBoundaries('linear', [1, max])).toEqual([
      1286742750677286, 2573485501354570, 3860228252031855, 5146971002709139, 6433713753386424,
      7720456504063708,
    ])
    expect(generateBoundaries('linear', [max - 10, max])).toEqual([
      max - 8,
      max - 6,
      max - 5,
      max - 3,
      max - 2,
      max,
    ])
  })

  it('Quantileの0-based添字はceil(n*k/7)で、-1を引かない', () => {
    expect(generateBoundaries('quantile', [1, 2, 3, 4, 5, 6, 7])).toEqual([2, 3, 4, 5, 6, 7])
    expect(generateBoundaries('quantile', [1, 2, 3, 4, 5, 6, 7, 8])).toEqual([3, 4, 5, 6, 7, 8])
    expect(generateBoundaries('quantile', [1, 2])).toEqual([2]) // 添字n以上は無視
    expect(generateBoundaries('quantile', [1, 1, 1, 1, 1, 2, 3])).toEqual([2, 3])
    expect(generateBoundaries('quantile', [1, 1, 1, 1, 1, 1, 1, max])).toEqual([max])
  })

  it('Logはlog1p/expm1の候補を元件数の整数比較で補正し、既存の固定例を維持する', () => {
    expect(generateBoundaries('log', [1, 255])).toEqual([3, 7, 15, 31, 63, 127])
    expect(generateBoundaries('log', [1, 4373])).toEqual([5, 17, 53, 161, 485, 1457])
    expect(generateBoundaries('log', [1, 256])).toEqual([4, 8, 16, 32, 64, 128])
    expect(generateBoundaries('log', [1, 2])).toEqual([2])
    expect(generateBoundaries('log', [1, max])).toEqual([
      344, 59357, 10225827, 1761656762, 303489814597, 52283775990873,
    ])
  })
})

describe('Logの切り上げ精度', () => {
  it.each([0.25, 0.75])('巨大整数の正当な小数部分 %s を補正で消さない', (fraction) => {
    const integer = 1_000_000_000_000_000
    expect(ceilLogBoundary(integer + fraction)).toBe(integer + 1)
  })

  it('単独のNumberの許容幅は0。整数の直上・直下も表現値どおりに切り上げる', () => {
    expect(ceilLogBoundary(7)).toBe(7)
    // 直上の値を誤差だと決めつけない。生成時の補正には元のmin/maxを使う。
    expect(ceilLogBoundary(7 + 8 * Number.EPSILON)).toBe(8)
    expect(ceilLogBoundary(7 - 8 * Number.EPSILON)).toBe(7)
    expect(ceilLogBoundary(7 + 64 * Number.EPSILON)).toBe(8)
    expect(ceilLogBoundary(7.01)).toBe(8)
    expect(ceilLogBoundary(6.99)).toBe(7)
  })

  it('100兆〜200兆の全6境界を数学的に切り上げる', () => {
    // Python Decimalのln/exp、80桁と120桁の両方で同じ切り上げ値。
    // 2番目の実数境界は121901365420447.588960015561237894...。
    expect(generateBoundaries('log', [100_000_000_000_000, 200_000_000_000_000])).toEqual([
      110_408_951_367_382, 121_901_365_420_448, 134_590_019_263_236, 148_599_428_913_695,
      164_067_071_201_528, 181_144_732_852_782,
    ])
  })

  it('巨大な整数に一致する理論境界を余計に1増やさない', () => {
    // min+1=10^12、max+1=128*10^12。理論値は10^12*2^k-1で厳密な整数。
    // 有限桁の高精度ln/expも整数の直上/直下へずれるため、この例は代数式で確定する。
    expect(generateBoundaries('log', [999_999_999_999, 127_999_999_999_999])).toEqual([
      1_999_999_999_999, 3_999_999_999_999, 7_999_999_999_999, 15_999_999_999_999,
      31_999_999_999_999, 63_999_999_999_999,
    ])
  })

  it('MAX_SAFE_INTEGER直下で対数の差がNumberでは消えても正しく6境界を生成する', () => {
    // Decimal 80桁・120桁で一致。旧Number計算では候補6個がすべてmax-6になっていた。
    expect(generateBoundaries('log', [max - 10, max])).toEqual([
      max - 8,
      max - 7,
      max - 5,
      max - 4,
      max - 2,
      max - 1,
    ])
    expect(generateBoundaries('log', [max - 1, max])).toEqual([max])
    expect(ceilLogBoundary(max)).toBe(max)
  })

  it('Number変換時点で失われた小数は単独の切り上げ関数では復元できない', () => {
    // この領域の隣接Numberの間隔は1。.25は呼出前に消える。
    const represented = max - 1 + 0.25
    expect(represented).toBe(max - 1)
    expect(ceilLogBoundary(represented)).toBe(max - 1)
  })
})

describe('カスタムと凡例', () => {
  it('6個の10進整数を検証し、全0でも定義を保持する', () => {
    const boundaries = parseCustomBoundaries(['2', '3', '5', '10', '20', String(max)])
    expect(resolveThresholds({ method: 'custom', boundaries }, [0, 0]).boundaries).toEqual(
      boundaries,
    )
  })
  it.each([
    '',
    ' ',
    '2.0',
    '2.5',
    '-2',
    '+2',
    '2e3',
    '1E2',
    '２',
    '2,000',
    'NaN',
    String(max + 1),
    '0',
    '1',
  ])('入力 %s を拒否する', (input) => {
    expect(() => parseCustomBoundaries([input, '3', '5', '10', '20', '50'])).toThrow(/境界値1/)
  })
  it.each([[2, 2, 3, 4, 5, 6], [3, 2, 4, 5, 6, 7], [], [2, 3, 4, 5, 6], [2, 3, 4, 5, 6, 7, 8]])(
    '不正な配列 %j を拒否する',
    (...boundaries) => {
      expect(() => resolveThresholds({ method: 'custom', boundaries }, [])).toThrow(/境界値/)
    },
  )
  it.each([0, 1, 2, 3, 4, 5, 6])(
    '境界数%sでも8色を保ち、最終範囲と未使用区分を明示する',
    (length) => {
      const boundaries = [2, 3, 5, 10, 20, 50].slice(0, length)
      const legend = createLegend(boundaries)
      expect(legend).toHaveLength(8)
      expect(legend.map((entry) => entry.color)).toEqual(LEVEL_COLORS)
      expect(legend[0]?.rangeLabel).toBe('0件')
      expect(legend[length + 1]?.rangeLabel).toBe(`${length ? boundaries.at(-1) : 1}件以上`)
      expect(
        legend.slice(length + 2).every((entry) => entry.rangeLabel === '未使用（範囲なし）'),
      ).toBe(true)
      expect(classifyCount(0, boundaries)).toBe(0)
      expect(classifyCount(max, boundaries)).toBe(length + 1)
    },
  )
  it('共通関数も不正境界を拒否する', () => {
    for (const boundaries of [
      [1],
      [2.5],
      [NaN],
      [Infinity],
      [max + 1],
      [3, 2],
      [2, 2],
      [2, 3, 4, 5, 6, 7, 8],
    ]) {
      expect(() => createLegend(boundaries)).toThrow(/境界値/)
      expect(() => classifyCount(1, boundaries)).toThrow(/境界値/)
    }
  })
})

it('LevelSeriesは再分類や件数の推定をせず、保存済み境界とレベルで表示する', () => {
  const thresholds = normalizeThresholdProfile({ method: 'log', boundaries: [5, 10] })
  const document = {
    source: { kind: 'levels' as const, startDate: '2026-01-01', levels: [0, 1, 2, 3] as const },
    thresholds,
  }
  const result = classifyDocument({
    ...document,
    source: { ...document.source, levels: [...document.source.levels] },
  })
  expect(result.map((entry) => entry.level)).toEqual([0, 1, 2, 3])
  expect(result.every((entry) => !('exactCount' in entry))).toBe(true)
  expect(() =>
    classifyDocument({
      source: { kind: 'levels', startDate: '2026-01-01', levels: [4] },
      thresholds,
    }),
  ).toThrow('保存済みレベルが境界値の範囲外です。')
})
