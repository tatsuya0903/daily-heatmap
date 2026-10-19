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
  expect(store.source?.counts).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
  expect(store.classifiedDays.map((entry) => entry.exactCount)).toEqual(source.counts)
  const previous = store.thresholds
  expect(() => store.setThresholds({ method: 'custom', boundaries: [2, 2, 3, 4, 5, 6] })).toThrow(
    /重複不可/,
  )
  expect(store.thresholds).toBe(previous)
  store.replaceSource({ kind: 'exact', startDate: '2026-02-01', counts: [0, 9, 9] })
  expect(store.thresholds).toEqual({ method: 'quantile', boundaries: [] })
})
