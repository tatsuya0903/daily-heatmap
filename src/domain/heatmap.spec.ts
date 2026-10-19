import { describe, expect, it } from 'vitest'
import { createHeatmapCells, groupHeatmapMonths, weekdayOf } from './heatmap'
import { classifyDocument, createLegend, LEVEL_COLORS, resolveThresholds } from './thresholds'
import type { ExactSeries } from './series'
import { aggregateTsv, parseTsv } from './tsv'
import { dateToEpochDay } from './dates'

const preset = resolveThresholds({ method: 'preset', presetId: 1 }, [])
const presetLegend = createLegend(preset.boundaries)
function classifyWithPreset(source: ExactSeries) {
  return classifyDocument({ source, thresholds: preset })
}

function cells(startDate: string, counts: number[]) {
  return createHeatmapCells(startDate, classifyWithPreset({ kind: 'exact', startDate, counts }))
}

describe('共通日付セルVMとカレンダー配置', () => {
  it('日曜始まりで曜日を縦、週を横に配置し、月をまたいでも週を維持する', () => {
    const result = cells('2026-03-28', [1, 2, 3, 4, 5])
    expect(result.map((c) => [c.date, c.weekdayLabel, c.week, c.monthWeek])).toEqual([
      ['2026-03-28', '土', 0, 3],
      ['2026-03-29', '日', 1, 4],
      ['2026-03-30', '月', 1, 4],
      ['2026-03-31', '火', 1, 4],
      ['2026-04-01', '水', 1, 0],
    ])
    expect(groupHeatmapMonths(result).map((m) => [m.label, m.firstWeek, m.cells.length])).toEqual([
      ['2026年3月', 0, 4],
      ['2026年4月', 1, 1],
    ])
  })

  it('年末年始・閏日・日曜開始を正しく扱う', () => {
    expect(cells('2023-12-31', [1, 1]).map((c) => [c.weekday, c.week, c.monthWeek])).toEqual([
      [0, 0, 5],
      [1, 0, 0],
    ])
    expect(cells('2024-02-28', [0, 1, 2, 3]).map((c) => [c.date, c.weekday, c.monthWeek])).toEqual([
      ['2024-02-28', 3, 4],
      ['2024-02-29', 4, 4],
      ['2024-03-01', 5, 0],
      ['2024-03-02', 6, 0],
    ])
  })

  it('TSVにない日と明示的な0件を同じグレーにし、期間外のセルを生成しない', () => {
    const table = parseTsv('Date\tCount\n2026-04-01\t6\n2026-04-03\t0')
    const source = aggregateTsv(table, [1])
    const result = createHeatmapCells(source.startDate, classifyWithPreset(source))
    expect(result.map((c) => [c.date, c.exactCount, c.level, c.color])).toEqual([
      ['2026-04-01', 6, 1, '#e6f5e8'],
      ['2026-04-02', 0, 0, '#ebedf0'],
      ['2026-04-03', 0, 0, '#ebedf0'],
    ])
    expect(result.map((c) => c.weekday)).toEqual([3, 4, 5])
  })

  it.each(['0001-01-01', '0099-12-31', '0100-01-01', '9999-12-31'])(
    '%sの1日だけの期間に余白セルを追加しない',
    (date) => {
      const result = cells(date, [0])
      expect(result).toHaveLength(1)
      expect(result[0]).toMatchObject({ date, week: 0, exactCount: 0, level: 0 })
    },
  )

  it('負のepoch dayでも曜日は0〜6になり、西暦の2桁補正を受けない', () => {
    expect(cells('0001-01-01', [1])[0]?.weekdayLabel).toBe('月')
    expect(cells('0099-12-31', [1, 1]).map((c) => [c.date, c.weekdayLabel])).toEqual([
      ['0099-12-31', '木'],
      ['0100-01-01', '金'],
    ])
    for (let day = -719162; day < -719100; day++) {
      expect(weekdayOf(day)).toBe(new Date(day * 86400000).getUTCDay())
      expect(weekdayOf(day)).toBeGreaterThanOrEqual(0)
    }
    expect(weekdayOf(-4)).toBe(0)
    expect(weekdayOf(-5)).toBe(6)
  })

  it('3,660日の各日が1回だけ存在し、全セルの曜日・月内行・週が一貫する', () => {
    const result = cells(
      '2016-01-01',
      Array.from({ length: 3660 }, (_, i) => i),
    )
    expect(new Set(result.map((c) => c.date)).size).toBe(3660)
    expect(groupHeatmapMonths(result).flatMap((m) => m.cells)).toEqual(result)
    for (const cell of result) {
      expect(cell.epochDay).toBe(dateToEpochDay('2016-01-01') + cell.index)
      expect(cell.weekday).toBe(new Date(cell.epochDay * 86400000).getUTCDay())
      const monthStart = dateToEpochDay(`${cell.monthKey}-01`)
      expect(cell.monthWeek * 7 + cell.weekday).toBe(
        cell.day - 1 + new Date(monthStart * 86400000).getUTCDay(),
      )
    }
  })

  it('分類済みの色とラベルを受け取り、正確な件数がない場合も推定しない', () => {
    const [cell] = createHeatmapCells('2026-01-01', [
      { level: 2, color: '#123456', rangeLabel: '任意の範囲' },
    ])
    expect(cell).toMatchObject({ level: 2, color: '#123456', rangeLabel: '任意の範囲' })
    expect(cell?.description).toBe('2026/01/01（木）：任意の範囲、レベル2')
    expect(cell?.exactCount).toBeUndefined()
  })
})

describe('SPECの固定プリセットID 1', () => {
  it('0とすべての境界・最大安全整数を正確に表示する', () => {
    const values = [
      0,
      1,
      49,
      50,
      99,
      100,
      299,
      300,
      499,
      500,
      699,
      700,
      999,
      1000,
      1153,
      Number.MAX_SAFE_INTEGER,
    ]
    const result = cells('2026-01-01', values)
    expect(result.map((c) => c.level)).toEqual([0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 6, 6, 7, 7, 7])
    expect(result.map((c) => c.exactCount)).toEqual(values)
    expect(result.at(-1)?.description).toContain('9,007,199,254,740,991件、1,000件以上、レベル7')
    expect(result.map((c) => c.color)).toEqual(result.map((c) => LEVEL_COLORS[c.level]))
    expect(presetLegend.map((e) => e.rangeLabel)).toEqual([
      '0件',
      '1〜49件',
      '50〜99件',
      '100〜299件',
      '300〜499件',
      '500〜699件',
      '700〜999件',
      '1,000件以上',
    ])
  })
})
