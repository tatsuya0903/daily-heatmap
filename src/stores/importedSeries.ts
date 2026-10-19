import { computed, ref, shallowRef } from 'vue'
import { defineStore } from 'pinia'
import type { ExactSeries, HeatmapDocument } from '@/domain/series'
import {
  classifyDocument,
  createLegend,
  resolveThresholds,
  type ThresholdSelection,
} from '@/domain/thresholds'

export const useImportedSeriesStore = defineStore('imported-series', () => {
  const document = shallowRef<HeatmapDocument | null>(null)
  const restored = ref(false)
  // データ読み替え時に閾値UIの未確定入力もリセットする。
  const revision = ref(0)
  const source = computed(() => document.value?.source ?? null)
  const thresholds = computed(
    () => document.value?.thresholds ?? resolveThresholds({ method: 'quantile' }, []),
  )
  const dayCount = computed(() =>
    source.value?.kind === 'exact'
      ? source.value.counts.length
      : (source.value?.levels.length ?? 0),
  )
  const legend = computed(() => createLegend(thresholds.value.boundaries))
  const classifiedDays = computed(() => (document.value ? classifyDocument(document.value) : []))

  function replaceDocument(next: HeatmapDocument) {
    document.value = next
    restored.value = true
    revision.value++
  }

  function clear() {
    document.value = null
    restored.value = false
    revision.value++
  }

  function replaceSource(series: ExactSeries) {
    const profile = resolveThresholds({ method: 'quantile' }, series.counts)
    document.value = { source: series, thresholds: profile }
    restored.value = false
    revision.value++
  }

  function setThresholds(selection: ThresholdSelection) {
    if (source.value?.kind !== 'exact') return
    // 検証完了後にだけ確定値を置換する。countsは変更しない。
    const profile = resolveThresholds(selection, source.value.counts)
    document.value = { source: source.value, thresholds: profile }
  }

  return {
    document,
    source,
    thresholds,
    dayCount,
    restored,
    revision,
    legend,
    classifiedDays,
    replaceSource,
    replaceDocument,
    clear,
    setThresholds,
  }
})
