import { createPinia, setActivePinia } from 'pinia'
import { beforeEach, expect, it } from 'vitest'
import { useImportedSeriesStore } from './importedSeries'

beforeEach(() => setActivePinia(createPinia()))

it('初期値は分位点で、設定変更後もExactSeriesを維持し派生レベルだけを更新する', () => {
  const store = useImportedSeriesStore()
  const source = {
    kind: 'exact' as const,
    startDate: '2026-01-01',
    counts: [0, 1, 2, 3, 4, 5, 6, 7],
  }
  store.replaceSource(source)
  expect(store.thresholds).toEqual({ method: 'quantile', boundaries: [2, 3, 4, 5, 6, 7] })
  expect(store.classifiedDays.map((entry) => entry.level)).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  store.setThresholds({ method: 'preset', presetId: 1 })
  expect(store.classifiedDays.map((entry) => entry.level)).toEqual([0, 1, 1, 1, 1, 1, 1, 1])
  expect(store.source).toBe(source)
  expect(store.source?.kind === 'exact' ? store.source.counts : undefined).toEqual([
    0, 1, 2, 3, 4, 5, 6, 7,
  ])
  expect(store.classifiedDays.map((entry) => entry.exactCount)).toEqual(source.counts)
  const previous = store.thresholds
  expect(() => store.setThresholds({ method: 'custom', boundaries: [2, 2, 3, 4, 5, 6] })).toThrow(
    /重複不可/,
  )
  expect(store.thresholds).toBe(previous)
  store.replaceSource({ kind: 'exact', startDate: '2026-02-01', counts: [0, 9, 9] })
  expect(store.thresholds).toEqual({ method: 'quantile', boundaries: [] })
})

it('LevelSeriesのレベル・確定境界を維持し、閾値変更を拒否する', () => {
  const store = useImportedSeriesStore()
  const document = {
    source: {
      kind: 'levels' as const,
      startDate: '2026-01-01',
      levels: [0, 2, 1] as (0 | 1 | 2)[],
    },
    thresholds: { method: 'linear' as const, boundaries: [123] },
  }
  store.replaceDocument(document)
  expect(store.document).toBe(document)
  expect(store.dayCount).toBe(3)
  expect(store.classifiedDays.map((day) => day.level)).toEqual([0, 2, 1])
  expect(store.classifiedDays.every((day) => day.exactCount === undefined)).toBe(true)
  store.setThresholds({ method: 'quantile' })
  expect(store.document).toBe(document)
  expect(store.restored).toBe(true)
  store.clear()
  expect(store.document).toBeNull()
  expect(store.classifiedDays).toEqual([])
})

it('完全URLの件数を維持したまま新しい境界で再分類し、新TSVは分位点に戻る', () => {
  const store = useImportedSeriesStore()
  const source = { kind: 'exact' as const, startDate: '2026-01-01', counts: [6, 45] }
  store.replaceDocument({ source, thresholds: { method: 'linear', boundaries: [100] } })
  expect(store.classifiedDays.map((day) => day.level)).toEqual([1, 1])
  store.setThresholds({ method: 'preset', presetId: 0 })
  expect(store.source).toBe(source)
  expect(store.thresholds.boundaries).toEqual([2, 3, 5, 10, 20, 50])
  expect(store.classifiedDays.map((day) => day.level)).toEqual([4, 6])
  const revision = store.revision
  store.replaceSource(source)
  expect(store.restored).toBe(false)
  expect(store.revision).toBeGreaterThan(revision)
  expect(store.thresholds.method).toBe('quantile')
})
